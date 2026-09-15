import { readFileSync } from 'node:fs';
import { Effect } from 'effect';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadDatabaseWithMetadata } from '../database/loader';
import { loadGameWithInfo } from '../game/loader';
import { fastXmlParser } from '../game/xml/fast-parser';
import { defaultSettingsStore } from '../settings/store';
import { createDatabaseUrlSource, createGameUrlSource } from './url-source';

const originalSettings = defaultSettingsStore.getSnapshot();
const xml = readFileSync(new URL('../../tests/e2e/fixtures/games/valid/default.xml', import.meta.url));
const sql = new TextEncoder().encode('CREATE TABLE example (id INTEGER);');
const sqlite = readFileSync(new URL('../../spec/database-package/v1/examples/database-file/data/example-school.sqlite', import.meta.url));
const databasePackage = readFileSync(new URL('../../spec/database-package/v1/examples/initial-sql-script.eskueldb', import.meta.url));
const gamePackage = readFileSync(new URL('../../spec/game-package/v1/examples/pokemon-adventure.eskuelgame', import.meta.url));

afterEach(() => {
    vi.restoreAllMocks();
    defaultSettingsStore.update(originalSettings);
});

function fetchBytes(bytes: Uint8Array) {
    // Hosts commonly return a generic or incorrect MIME type.
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(Uint8Array.from(bytes), {
        headers: { 'content-type': 'application/octet-stream' },
    }));
}

for (const url of ['/gistfile1.txt', '/download', '/?id=123', '/misleading.sqlite']) {
    it(`loads game XML from ${url} using its content`, async () => {
        const fetch = fetchBytes(xml);
        const result = await Effect.runPromise(loadGameWithInfo(createGameUrlSource(url), fastXmlParser));
        expect(result.game.title).toBe('Default E2E Game');
        expect(result.packageInfo).toBeUndefined();
        expect(fetch).toHaveBeenCalledExactlyOnceWith(url, expect.anything());
    });
}

for (const input of ['url', 'upload'] as const) {
    describe(`${input} content detection`, () => {
        it.each([
            { name: 'SQL', bytes: sql, type: 'initial-sql-script' },
            { name: 'SQLite', bytes: sqlite, type: 'sqlite-db' },
            { name: 'database package', bytes: databasePackage, type: 'initial-sql-script' },
        ])('opens $name independently of the filename', async ({ bytes, type, name }) => {
            const fetch = fetchBytes(bytes);
            const source = input === 'url'
                ? createDatabaseUrlSource('/download.txt?file=data.xml')
                : { type: 'auto' as const, source: { type: 'inline' as const, content: bytes } };
            const result = await Effect.runPromise(loadDatabaseWithMetadata(source));
            expect(result.data.type).toBe(type);
            expect(result.packageInfo !== undefined).toBe(name === 'database package');
            expect(fetch).toHaveBeenCalledTimes(input === 'url' ? 1 : 0);
        });

        it.each([
            { name: 'XML', bytes: xml, packaged: false },
            { name: 'game package', bytes: gamePackage, packaged: true },
        ])('opens $name independently of the filename', async ({ bytes, packaged }) => {
            const fetch = fetchBytes(bytes);
            const source = input === 'url'
                ? createGameUrlSource('/download.sql')
                : { type: 'auto' as const, source: { type: 'inline' as const, content: bytes } };
            const result = await Effect.runPromise(loadGameWithInfo(source, fastXmlParser));
            expect(result.game.scenes.length).toBeGreaterThan(0);
            expect(result.packageInfo !== undefined).toBe(packaged);
            expect(fetch).toHaveBeenCalledTimes(input === 'url' ? 1 : 0);
        });

        it('validates ZIP contents instead of accepting arbitrary archives', async () => {
            const bytes = zipSync({ 'unrelated.txt': sql });
            fetchBytes(bytes);
            const source = input === 'url'
                ? createGameUrlSource('/archive.txt')
                : { type: 'auto' as const, source: { type: 'inline' as const, content: bytes } };
            const error = await Effect.runPromise(Effect.flip(loadGameWithInfo(source, fastXmlParser)));
            expect(error.kind).toBe('parse-game-package');
        });
    });
}

it.each([new Uint8Array([0xff, 0xfe, 0xfd]), new Uint8Array([0, 1, 2])])('rejects unsupported binary content as a typed failure', async bytes => {
    fetchBytes(bytes);
    const gameError = await Effect.runPromise(Effect.flip(loadGameWithInfo(createGameUrlSource('/game.xml'), fastXmlParser)));
    const databaseError = await Effect.runPromise(Effect.flip(loadDatabaseWithMetadata(createDatabaseUrlSource('/database.sql'))));
    expect(gameError.kind).toBe('parse-xml');
    expect(databaseError.kind).toBe('parse-database-content');
});

it('rejects invalid game XML even when the URL ends in .xml', async () => {
    fetchBytes(new TextEncoder().encode('<html><body>Not a game</body></html>'));
    const error = await Effect.runPromise(Effect.flip(loadGameWithInfo(createGameUrlSource('/game.xml'), fastXmlParser)));
    expect(error.kind).toBe('parse-xml');
});

it.each([
    { bytes: xml, settings: { maxGameFileBytes: 3, maxGamePackageBytes: 100_000 } },
    { bytes: gamePackage, settings: { maxGameFileBytes: 100_000, maxGamePackageBytes: 3 } },
    { bytes: xml, settings: { maxFetchedSourceBytes: 3 } },
])('enforces the applicable game limit after detection', async ({ bytes, settings }) => {
    defaultSettingsStore.update(settings);
    fetchBytes(bytes);
    const error = await Effect.runPromise(Effect.flip(loadGameWithInfo(createGameUrlSource('/download'), fastXmlParser)));
    expect(error).toEqual({ kind: 'file-size-too-large' });
});

it.each([{ maxDatabaseFileBytes: 3 }, { maxFetchedSourceBytes: 3 }])('enforces database download limits', async settings => {
    defaultSettingsStore.update(settings);
    fetchBytes(sql);
    const error = await Effect.runPromise(Effect.flip(loadDatabaseWithMetadata(createDatabaseUrlSource('/download'))));
    expect(error).toEqual({ kind: 'file-size-too-large' });
});

it('preserves fetch failures for URLs without filenames', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    const url = '/?id=missing';
    const gameError = await Effect.runPromise(Effect.flip(loadGameWithInfo(createGameUrlSource(url), fastXmlParser)));
    const databaseError = await Effect.runPromise(Effect.flip(loadDatabaseWithMetadata(createDatabaseUrlSource(url))));
    expect(gameError).toEqual({ kind: 'fetch-game', url });
    expect(databaseError).toEqual({ kind: 'fetch-db', url });
});
