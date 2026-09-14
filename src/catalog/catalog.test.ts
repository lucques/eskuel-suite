import { describe, expect, it } from 'vitest';

import type { DatabaseCatalogEntry, GameCatalogEntry } from './model';
import { selectDatabaseCatalogSources, selectGameCatalogSources } from './selection';
import { assertDatabaseCatalog, assertGameCatalog } from './validation';

describe('game catalog', () => {
    it('selects every file from the requested localization', () => {
        const catalog = [makeGameCatalogEntry()];

        assertGameCatalog(catalog);
        const sources = selectGameCatalogSources(catalog, 'en');

        expect(sources).toEqual([
            {
                key: 'game/en/game.xml',
                entryKey: 'game/en',
                entryTitle: 'Game',
                pageUrl: '/en/games/game/',
                source: {
                    filename: 'game.xml',
                    type: 'xml',
                    source: { type: 'fetch', url: '/game.xml' },
                },
            },
            {
                key: 'game/en/game-compact.xml',
                entryKey: 'game/en',
                entryTitle: 'Game',
                pageUrl: '/en/games/game/',
                source: {
                    filename: 'game-compact.xml',
                    type: 'xml',
                    source: { type: 'fetch', url: '/game-compact.xml' },
                },
            },
            {
                key: 'game/en/game.eskuelgame',
                entryKey: 'game/en',
                entryTitle: 'Game',
                pageUrl: '/en/games/game/',
                source: {
                    filename: 'game.eskuelgame',
                    type: 'eskuel-game-package',
                    source: { type: 'fetch', url: '/game.eskuelgame' },
                },
            },
        ]);
        expect(selectGameCatalogSources(catalog, 'fr')).toEqual([]);
    });

    it('accepts representative GameCatalogEntry output from a de-eskuel manifest adapter', () => {
        const catalog: readonly GameCatalogEntry[] = [{
            id: 'battle-of-the-bands',
            localizations: {
                de: {
                    title: 'Battle of the Bands',
                    pageUrl: '/de/spiele/battle-of-the-bands/',
                    files: [{
                        url: '/res/games/battle-of-the-bands/localizations/de/main/v1/battle-of-the-bands.xml',
                        filename: 'battle-of-the-bands.xml',
                    }],
                },
                en: {
                    title: 'Battle of the Bands',
                    pageUrl: '/en/games/battle-of-the-bands/',
                    files: [{
                        url: '/res/games/battle-of-the-bands/localizations/en/main/v1/battle-of-the-bands.xml',
                        filename: 'battle-of-the-bands.xml',
                    }],
                },
            },
        }];

        assertGameCatalog(catalog);

        expect(selectGameCatalogSources(catalog, 'de')).toEqual([
            expect.objectContaining({
                key: 'battle-of-the-bands/de/battle-of-the-bands.xml',
                entryTitle: 'Battle of the Bands',
                source: {
                    filename: 'battle-of-the-bands.xml',
                    type: 'xml',
                    source: {
                        type: 'fetch',
                        url: '/res/games/battle-of-the-bands/localizations/de/main/v1/battle-of-the-bands.xml',
                    },
                },
            }),
        ]);
    });
});

describe('database catalog', () => {
    it('derives SQL script, SQLite file, and Eskuel package sources from filenames', () => {
        const catalog = [makeDatabaseCatalogEntry()];

        assertDatabaseCatalog(catalog);
        const sources = selectDatabaseCatalogSources(catalog, 'en');

        expect(sources.map(source => source.source)).toEqual([
            {
                filename: 'database.sql',
                type: 'initial-sql-script',
                source: { type: 'fetch', url: '/database.sql' },
            },
            {
                filename: 'database.sqlite',
                type: 'sqlite-db',
                source: { type: 'fetch', url: '/database.sqlite' },
            },
            {
                filename: 'database.eskueldb',
                type: 'eskuel-database-package',
                source: { type: 'fetch', url: '/database.eskueldb' },
            },
        ]);
    });
});

describe('catalog runtime validation', () => {
    it.each([
        {
            name: 'a non-array catalog',
            candidate: () => ({ entries: [] }),
            expected: /must be an array/,
        },
        {
            name: 'duplicate entry IDs',
            candidate: () => [makeGameCatalogEntry(), makeGameCatalogEntry()],
            expected: /duplicate ID 'game'/,
        },
        {
            name: 'a blank file URL',
            candidate: () => {
                const entry = mutableGameCatalogEntry();
                entry.localizations.en.files[0].url = ' ';
                return [entry];
            },
            expected: /files\[0\]\.url must be a non-empty string/,
        },
        {
            name: 'duplicate filenames in one localization',
            candidate: () => {
                const entry = mutableGameCatalogEntry();
                entry.localizations.en.files[1].filename = 'game.xml';
                return [entry];
            },
            expected: /duplicate filename 'game.xml'/,
        },
        {
            name: 'an unsupported game filename',
            candidate: () => {
                const entry = mutableGameCatalogEntry();
                entry.localizations.en.files[0].filename = 'game.sql';
                return [entry];
            },
            expected: /unsupported game extension/,
        },
        {
            name: 'a blank page URL',
            candidate: () => {
                const entry = mutableGameCatalogEntry();
                entry.localizations.en.pageUrl = ' ';
                return [entry];
            },
            expected: /pageUrl must be a non-empty string/,
        },
    ])('rejects $name', ({ candidate, expected }) => {
        expect(() => assertGameCatalog(candidate())).toThrowError(expected);
    });

    it('accepts an empty file list for an unpublished localization', () => {
        const entry = mutableGameCatalogEntry();
        entry.localizations.en.files = [];

        expect(() => assertGameCatalog([entry])).not.toThrow();
    });

    it('rejects unsupported database filename extensions', () => {
        const entry = makeDatabaseCatalogEntry();
        const candidate = structuredClone(entry) as unknown as {
            localizations: Record<string, { files: Array<{ filename: string }> }>;
        };
        candidate.localizations.en.files[0].filename = 'database.csv';

        expect(() => assertDatabaseCatalog([candidate])).toThrowError(/unsupported database extension/);
    });
});

function makeGameCatalogEntry(): GameCatalogEntry {
    return {
        id: 'game',
        localizations: {
            en: {
                title: 'Game',
                pageUrl: '/en/games/game/',
                files: [
                    { url: '/game.xml', filename: 'game.xml' },
                    { url: '/game-compact.xml', filename: 'game-compact.xml' },
                    { url: '/game.eskuelgame', filename: 'game.eskuelgame' },
                ],
            },
            de: {
                title: 'Spiel',
                files: [{ url: '/spiel.xml', filename: 'spiel.xml' }],
            },
        },
    };
}

function makeDatabaseCatalogEntry(): DatabaseCatalogEntry {
    return {
        id: 'database',
        localizations: {
            en: {
                title: 'Database',
                files: [
                    { url: '/database.sql', filename: 'database.sql' },
                    { url: '/database.sqlite', filename: 'database.sqlite' },
                    { url: '/database.eskueldb', filename: 'database.eskueldb' },
                ],
            },
        },
    };
}

type MutableGameCatalogEntry = {
    id: string;
    localizations: Record<string, {
        title: string;
        pageUrl?: string;
        files: Array<{ url: string; filename: string }>;
    }>;
};

function mutableGameCatalogEntry(): MutableGameCatalogEntry {
    return structuredClone(makeGameCatalogEntry()) as MutableGameCatalogEntry;
}
