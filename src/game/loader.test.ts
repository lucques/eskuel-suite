import { readFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';

import type { DatabaseSystem } from '../database/system';
import { defaultSettingsStore } from '../settings/store';
import { loadGame, loadGameWithInfo } from './loader';
import { Game } from './model';
import { ESKUEL_GAME_PACKAGE_PROFILE } from './package';
import type { XmlElement, XmlParser } from './xml/model';

const validGameXml: XmlElement = {
    name: 'game',
    text: '',
    attributes: {},
    children: [
        {
            name: 'head',
            text: '',
            attributes: {},
            children: [
                { name: 'title', text: 'Loaded game', attributes: {}, children: [] },
                { name: 'teaser', text: 'A teaser', attributes: {}, children: [] },
                { name: 'copyright', text: 'An author', attributes: {}, children: [] },
            ],
        },
        {
            name: 'scenes',
            text: '',
            attributes: {},
            children: [{
                name: 'text-scene',
                text: '',
                attributes: {},
                children: [{ name: 'text', text: 'Introduction', attributes: {}, children: [] }],
            }],
        },
    ],
};

const imageGameXml: XmlElement = {
    ...validGameXml,
    attributes: {
        'format-version': '1',
        'db-system': 'sqlite',
        'db-system-min-version': '3.0.0',
    },
    children: [
        validGameXml.children[0],
        {
            name: 'scenes',
            text: '',
            attributes: {},
            children: [{
                name: 'image-scene',
                text: 'iVBORw0KGgoAAAANSUhEUgAABAAAAAMA',
                attributes: { 'media-type': 'image/png' },
                children: [],
            }],
        },
    ],
};

const packagedGameXml: XmlElement = {
    ...validGameXml,
    attributes: {
        'format-version': '2',
        'db-system': 'sqlite',
        'db-system-min-version': '3.0.0',
    },
};

const originalSettings = defaultSettingsStore.getSnapshot();
const parserThatMustNotBeCalled: XmlParser = {
    parse() {
        throw new Error('XML parser should not be called');
    },
};

describe('game loading', () => {
    afterEach(() => {
        defaultSettingsStore.update(originalSettings);
        vi.restoreAllMocks();
    });

    it('returns an object source without invoking the XML parser', async () => {
        const game = new Game('Object game', '', '', null, [{ type: 'text', text: 'Introduction' }]);
        let parseCalls = 0;
        const parser: XmlParser = {
            parse() {
                parseCalls++;
                return { ok: false, error: { kind: 'parse-xml', details: 'Parser should not be called' } };
            },
        };

        const loaded = await Effect.runPromise(loadGame({ type: 'object', source: game }, parser));

        expect(loaded).toBe(game);
        expect(parseCalls).toBe(0);
    });

    it('materializes an inline source and converts the parsed XML', async () => {
        const parser: XmlParser = {
            parse(text) {
                expect(text).toBe('<game />');
                return { ok: true, data: validGameXml };
            },
        };

        const loaded = await Effect.runPromise(loadGame({
            type: 'xml',
            source: { type: 'inline', content: '<game />' },
        }, parser));

        expect(loaded).toEqual(new Game(
            'Loaded game',
            'A teaser',
            'An author',
            null,
            [{ type: 'text', text: 'Introduction' }],
        ));
    });

    it('preserves a typed XML-parser failure', async () => {
        const parser: XmlParser = {
            parse() {
                return { ok: false, error: { kind: 'parse-xml', details: 'Malformed XML' } };
            },
        };

        const error = await Effect.runPromise(Effect.flip(loadGame({
            type: 'xml',
            source: { type: 'inline', content: '<broken' },
        }, parser)));

        expect(error).toEqual({ kind: 'parse-xml', details: 'Malformed XML' });
    });

    it('preserves a typed game-conversion failure', async () => {
        const parser: XmlParser = {
            parse() {
                return {
                    ok: true,
                    data: { name: 'game', text: '', attributes: {}, children: [] },
                };
            },
        };

        const error = await Effect.runPromise(Effect.flip(loadGame({
            type: 'xml',
            source: { type: 'inline', content: '<game />' },
        }, parser)));

        expect(error).toEqual({ kind: 'parse-xml', details: '<title>...</title> is missing' });
    });

    it.each([
        {
            settings: { maxImageFileBytes: 8 },
            error: {
                kind: 'image-resource-limit',
                resource: 'file-bytes',
                limit: 8,
                sceneNumber: 1,
            },
        },
        {
            settings: { maxImageWidth: 100 },
            error: {
                kind: 'image-resource-limit',
                resource: 'width',
                limit: 100,
                sceneNumber: 1,
            },
        },
        {
            settings: { maxImageHeight: 100 },
            error: {
                kind: 'image-resource-limit',
                resource: 'height',
                limit: 100,
                sceneNumber: 1,
            },
        },
    ] as const)('applies the configured image resource limit', async ({ settings, error: expected }) => {
        defaultSettingsStore.update(settings);
        const parser: XmlParser = {
            parse() {
                return { ok: true, data: imageGameXml };
            },
        };

        const error = await Effect.runPromise(Effect.flip(loadGame({
            type: 'xml',
            source: { type: 'inline', content: '<game />' },
        }, parser)));

        expect(error).toEqual(expected);
    });

    it('preserves a file-size failure for oversized inline XML', async () => {
        defaultSettingsStore.update({ maxGameFileBytes: 3 });

        const error = await Effect.runPromise(Effect.flip(loadGame({
            type: 'xml',
            source: { type: 'inline', content: 'four' },
        }, parserThatMustNotBeCalled)));

        expect(error).toEqual({ kind: 'file-size-too-large' });
    });

    it('preserves a file-size failure for oversized fetched XML', async () => {
        defaultSettingsStore.update({
            maxGameFileBytes: 100,
            maxFetchedSourceBytes: 3,
        });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('four'));

        const error = await Effect.runPromise(Effect.flip(loadGame({
            type: 'xml',
            source: { type: 'fetch', url: '/large-game.xml' },
        }, parserThatMustNotBeCalled)));

        expect(error).toEqual({ kind: 'file-size-too-large' });
    });

    it('maps a failed XML fetch to a typed fetch failure', async () => {
        const url = '/missing-game.xml';
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));

        const error = await Effect.runPromise(Effect.flip(loadGame({
            type: 'xml',
            source: { type: 'fetch', url },
        }, parserThatMustNotBeCalled)));

        expect(error).toEqual({ kind: 'fetch-xml', url });
    });

    it('loads an Eskuel game package and supplies its database dependency', async () => {
        const archive = await makeGamePackage();
        const parser: XmlParser = {
            parse(text) {
                expect(text).toContain('<title>Packaged game</title>');
                return { ok: true, data: packagedGameXml };
            },
        };

        const loaded = await Effect.runPromise(loadGame({
            type: 'eskuel-game-package',
            source: { type: 'inline', content: archive },
        }, parser));

        expect(loaded).toMatchObject({
            title: 'Loaded game',
            dbSystem: 'sqlite',
            dbData: {
                type: 'initial-sql-script',
                system: 'sqlite',
                systemMinVersion: '3.0.0',
            },
        });
    });

    it('preserves game and database package information for consumers', async () => {
        const archive = await makeGamePackage();

        const loaded = await Effect.runPromise(loadGameWithInfo({
            type: 'eskuel-game-package',
            source: { type: 'inline', content: archive },
        }, { parse: () => ({ ok: true, data: packagedGameXml }) }));

        expect(loaded.packageInfo).toMatchObject({
            descriptor: { name: 'packaged-game' },
            licenses: [{ metadata: { path: 'LICENSES/Example.txt' }, text: 'Example License\n' }],
            database: {
                descriptor: { name: 'example-school-sql' },
                licenses: [{ metadata: { path: 'LICENSES/MIT.txt' } }],
            },
        });
    });

    it('rejects an embedded database source in packaged game XML', async () => {
        const archive = await makeGamePackage();
        const parser: XmlParser = {
            parse() {
                return {
                    ok: true,
                    data: {
                        ...packagedGameXml,
                        children: [
                            ...packagedGameXml.children,
                            {
                                name: 'initial-sql-script',
                                text: 'SELECT 1;',
                                attributes: {},
                                children: [],
                            },
                        ],
                    },
                };
            },
        };

        const error = await Effect.runPromise(Effect.flip(loadGame({
            type: 'eskuel-game-package',
            source: { type: 'inline', content: archive },
        }, parser)));

        expect(error).toEqual({
            kind: 'parse-game-package',
            details: 'Game XML must not contain an embedded database source',
        });
    });

    it('requires explicit format metadata in packaged game XML', async () => {
        const archive = await makeGamePackage();
        const parser: XmlParser = {
            parse() {
                return { ok: true, data: validGameXml };
            },
        };

        const error = await Effect.runPromise(Effect.flip(loadGame({
            type: 'eskuel-game-package',
            source: { type: 'inline', content: archive },
        }, parser)));

        expect(error).toEqual({
            kind: 'parse-game-package',
            details: 'Game XML must declare format-version',
        });
    });

    it('requires an explicit database system in packaged game XML', async () => {
        const archive = await makeGamePackage();
        const parser: XmlParser = {
            parse() {
                return {
                    ok: true,
                    data: {
                        ...packagedGameXml,
                        attributes: { 'format-version': '2' },
                    },
                };
            },
        };

        const error = await Effect.runPromise(Effect.flip(loadGame({
            type: 'eskuel-game-package',
            source: { type: 'inline', content: archive },
        }, parser)));

        expect(error).toEqual({
            kind: 'parse-game-package',
            details: 'Game XML is invalid: Game format version 2 requires the db-system attribute',
        });
    });

    it('loads a PostgreSQL game whose database dependency uses PostgreSQL', async () => {
        const archive = await makeGamePackage(
            'postgresql-initial-sql-script.eskueldb',
            'postgresql',
        );
        const parser: XmlParser = {
            parse() {
                return {
                    ok: true,
                    data: {
                        ...packagedGameXml,
                        attributes: {
                            'format-version': '2',
                            'db-system': 'postgresql',
                            'db-system-min-version': '14.0.0',
                        },
                    },
                };
            },
        };

        const loaded = await Effect.runPromise(loadGame({
            type: 'eskuel-game-package',
            source: { type: 'inline', content: archive },
        }, parser));

        expect(loaded).toMatchObject({
            dbSystem: 'postgresql',
            dbData: {
                type: 'initial-sql-script',
                system: 'postgresql',
                systemMinVersion: '14.0.0',
            },
        });
    });

    it('rejects a game whose XML and database dependency use different systems', async () => {
        const archive = await makeGamePackage();
        const parser: XmlParser = {
            parse() {
                return {
                    ok: true,
                    data: {
                        ...packagedGameXml,
                        attributes: {
                            'format-version': '2',
                            'db-system': 'postgresql',
                            'db-system-min-version': '14.0.0',
                        },
                    },
                };
            },
        };

        const error = await Effect.runPromise(Effect.flip(loadGame({
            type: 'eskuel-game-package',
            source: { type: 'inline', content: archive },
        }, parser)));

        expect(error).toEqual({
            kind: 'parse-game-package',
            details: 'Game XML db-system must match database dependency system sqlite',
        });
    });

    it('maps a failed game-package fetch to a typed fetch failure', async () => {
        const url = '/missing-game.eskuelgame';
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));

        const error = await Effect.runPromise(Effect.flip(loadGame({
            type: 'eskuel-game-package',
            source: { type: 'fetch', url },
        }, parserThatMustNotBeCalled)));

        expect(error).toEqual({ kind: 'fetch-game-package', url });
    });
});

async function makeGamePackage(
    databaseExample = 'initial-sql-script.eskueldb',
    dbSystem: DatabaseSystem = 'sqlite',
): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const xmlBytes = encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<game format-version="2" db-system="${dbSystem}" db-system-min-version="${dbSystem === 'sqlite' ? '3.0.0' : '14.0.0'}">
    <head><title>Packaged game</title><teaser>Teaser</teaser><copyright>Author</copyright></head>
    <scenes><text-scene><text>Introduction</text></text-scene></scenes>
</game>
`);
    const databaseBytes = new Uint8Array(readFileSync(new URL(
        `../../spec/database-package/v1/examples/${databaseExample}`,
        import.meta.url,
    )));
    const descriptor = {
        $schema: ESKUEL_GAME_PACKAGE_PROFILE,
        name: 'packaged-game',
        title: 'Packaged game',
        version: '1.0.0',
        contributors: [{ title: 'Example author', roles: ['creator'] }],
        licenses: [{ name: 'Example', path: 'LICENSES/Example.txt' }],
        resources: [{
            name: 'game',
            path: 'data/packaged-game.xml',
            format: 'xml',
            mediatype: 'application/xml',
            bytes: xmlBytes.byteLength,
            hash: `sha256:${await sha256(xmlBytes)}`,
        }, {
            name: 'database',
            path: 'dependencies/database.eskueldb',
            format: 'eskueldb',
            mediatype: 'application/zip',
            bytes: databaseBytes.byteLength,
            hash: `sha256:${await sha256(databaseBytes)}`,
        }],
    };
    return zipSync({
        'datapackage.json': encoder.encode(JSON.stringify(descriptor)),
        'data/packaged-game.xml': xmlBytes,
        'dependencies/database.eskueldb': databaseBytes,
        'LICENSES/Example.txt': encoder.encode('Example License\n'),
    });
}

async function sha256(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
