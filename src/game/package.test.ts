import { readFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
    ESKUEL_GAME_PACKAGE_PROFILE,
    parseGamePackage,
    readGamePackage,
} from './package';

const textEncoder = new TextEncoder();
const exampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<game format-version="1" db-system="sqlite" db-system-min-version="3.0.0">
    <head><title>Example</title><teaser>Teaser</teaser><copyright>Author</copyright></head>
    <scenes><text-scene><text>Introduction</text></text-scene></scenes>
</game>
`;
const exampleLicense = 'Example License\n';
const limits = {
    maxGameXmlBytes: 1024 * 1024,
    maxDatabasePackageBytes: 1024 * 1024,
    maxDatabaseResourceBytes: 1024 * 1024,
};

describe('Eskuel game package parser', () => {
    it('loads the published example with its database dependency', async () => {
        const archive = readExampleArchive('pokemon-adventure.eskuelgame');

        const result = await parseGamePackage(archive, limits);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.xml).toContain('<title>Pokémon Adventure</title>');
            expect(result.data.dbData).toMatchObject({
                type: 'initial-sql-script',
                system: 'sqlite',
                systemMinVersion: '3.0.0',
            });
        }
    });

    it('preserves outer and nested package licensing metadata', async () => {
        const archive = readExampleArchive('pokemon-adventure.eskuelgame');

        const result = await readGamePackage(archive, limits);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.descriptor.name).toBe('pokemon-adventure');
            expect(result.data.licenses[0].text).toContain('MIT License');
            expect(result.data.notices[0].text).toContain('illustrative example content');
            expect(result.data.provenance?.metadata.mediatype).toBe('application/json');
            expect(result.data.database.descriptor.name).toBe('example-school-sql');
            expect(result.data.database.licenses[0].text).toContain('MIT License');
        }
    });

    it('loads the published PostgreSQL example with its database dependency', async () => {
        const archive = readExampleArchive('pokemon-adventure-postgresql.eskuelgame');

        const result = await parseGamePackage(archive, limits);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.xml).toContain('db-system="postgresql" db-system-min-version="14.0.0"');
            expect(result.data.dbData).toMatchObject({
                type: 'initial-sql-script',
                system: 'postgresql',
                systemMinVersion: '14.0.0',
            });
        }
    });

    it('accepts resources in either order', async () => {
        const archive = await makeGamePackage({ reverseResources: true });

        const result = await parseGamePackage(archive, limits);

        expect(result.ok).toBe(true);
    });

    it('requires a package-specific game XML filename', async () => {
        const archive = await makeGamePackage({
            gameResourceUpdates: { path: 'data/game.xml' },
            gameEntryPath: 'data/game.xml',
        });

        const result = await parseGamePackage(archive, limits);

        expectPackageFailure(result, "path must be 'data/example-game.xml'");
    });

    it('requires the fixed database resource name', async () => {
        const archive = await makeGamePackage({
            databaseResourceUpdates: { name: 'example-database' },
        });

        const result = await parseGamePackage(archive, limits);

        expectPackageFailure(result, 'datapackage.json/resources/1/name should be equal to constant');
    });

    it('requires the fixed database dependency path', async () => {
        const archive = await makeGamePackage({
            databaseResourceUpdates: { path: 'dependencies/other.eskueldb' },
            databaseEntryPath: 'dependencies/other.eskueldb',
        });

        const result = await parseGamePackage(archive, limits);

        expectPackageFailure(result, 'datapackage.json/resources/1/path should be equal to constant');
    });

    it('rejects unknown profiles', async () => {
        const archive = await makeGamePackage({
            descriptorUpdates: { $schema: 'https://example.com/game-package-v2.json' },
        });

        const result = await parseGamePackage(archive, limits);

        expectPackageFailure(result, 'datapackage.json/$schema should be equal to constant');
    });

    it('rejects unknown descriptor properties through the JSON Schema', async () => {
        const archive = await makeGamePackage({
            descriptorUpdates: { description: 'Not allowed in v1' },
        });

        const result = await parseGamePackage(archive, limits);

        expectPackageFailure(result, "datapackage.json contains unknown property 'description'");
    });

    it('rejects case-insensitively duplicate declared paths', async () => {
        const archive = await makeGamePackage({
            descriptorUpdates: {
                licenses: [
                    { name: 'Example-A', path: 'LICENSES/Example.txt' },
                    { name: 'Example-B', path: 'LICENSES/example.txt' },
                ],
            },
        });

        const result = await parseGamePackage(archive, limits);

        expectPackageFailure(result, 'datapackage.json file paths must be distinct');
    });

    it('rejects undeclared archive files', async () => {
        const archive = await makeGamePackage({
            extraEntries: { 'README.txt': textEncoder.encode('Unexpected') },
        });

        const result = await parseGamePackage(archive, limits);

        expectPackageFailure(result, "Archive contains undeclared entry 'README.txt'");
    });

    it('rejects a resource whose SHA-256 hash does not match', async () => {
        const archive = await makeGamePackage({
            gameResourceUpdates: { hash: `sha256:${'0'.repeat(64)}` },
        });

        const result = await parseGamePackage(archive, limits);

        expectPackageFailure(result, "Resource 'game' SHA-256 hash does not match descriptor");
    });

    it('rejects an invalid nested database package', async () => {
        const archive = await makeGamePackage({ databaseBytes: textEncoder.encode('not a database package') });

        const result = await parseGamePackage(archive, limits);

        expectPackageFailure(result, 'Database dependency');
        expectPackageFailure(result, 'File is not a supported ZIP archive');
    });

    it('applies the game XML limit before decompression', async () => {
        const archive = await makeGamePackage();

        const result = await parseGamePackage(archive, { ...limits, maxGameXmlBytes: 1 });

        expect(result).toEqual({ ok: false, error: { kind: 'file-size-too-large' } });
    });

    it('applies the nested database-package limit before decompression', async () => {
        const archive = await makeGamePackage();

        const result = await parseGamePackage(archive, { ...limits, maxDatabasePackageBytes: 1 });

        expect(result).toEqual({ ok: false, error: { kind: 'file-size-too-large' } });
    });
});

type GamePackageOptions = {
    descriptorUpdates?: Record<string, unknown>;
    gameResourceUpdates?: Record<string, unknown>;
    databaseResourceUpdates?: Record<string, unknown>;
    gameEntryPath?: string;
    databaseEntryPath?: string;
    databaseBytes?: Uint8Array;
    extraEntries?: Record<string, Uint8Array>;
    reverseResources?: boolean;
};

async function makeGamePackage(options: GamePackageOptions = {}): Promise<Uint8Array> {
    const gameBytes = textEncoder.encode(exampleXml);
    const databaseBytes = options.databaseBytes ?? readDatabaseExampleArchive();
    const gameResource = {
        name: 'game',
        path: 'data/example-game.xml',
        format: 'xml',
        mediatype: 'application/xml',
        bytes: gameBytes.byteLength,
        hash: `sha256:${await sha256(gameBytes)}`,
        ...options.gameResourceUpdates,
    };
    const databaseResource = {
        name: 'database',
        path: 'dependencies/database.eskueldb',
        format: 'eskueldb',
        mediatype: 'application/zip',
        bytes: databaseBytes.byteLength,
        hash: `sha256:${await sha256(databaseBytes)}`,
        ...options.databaseResourceUpdates,
    };
    const descriptor = {
        $schema: ESKUEL_GAME_PACKAGE_PROFILE,
        name: 'example-game',
        title: 'Example game',
        version: '1.0.0',
        contributors: [{ title: 'Example author', roles: ['creator'] }],
        licenses: [{ name: 'Example', path: 'LICENSES/Example.txt' }],
        resources: options.reverseResources
            ? [databaseResource, gameResource]
            : [gameResource, databaseResource],
        ...options.descriptorUpdates,
    };
    return zipSync({
        'datapackage.json': textEncoder.encode(JSON.stringify(descriptor)),
        [options.gameEntryPath ?? 'data/example-game.xml']: gameBytes,
        [options.databaseEntryPath ?? 'dependencies/database.eskueldb']: databaseBytes,
        'LICENSES/Example.txt': textEncoder.encode(exampleLicense),
        ...options.extraEntries,
    });
}

async function sha256(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function readExampleArchive(filename: string): Uint8Array {
    return new Uint8Array(readFileSync(new URL(`../../spec/game-package/v1/examples/${filename}`, import.meta.url)));
}

function readDatabaseExampleArchive(): Uint8Array {
    return new Uint8Array(readFileSync(new URL(
        '../../spec/database-package/v1/examples/initial-sql-script.eskueldb',
        import.meta.url,
    )));
}

function expectPackageFailure(
    result: Awaited<ReturnType<typeof parseGamePackage>>,
    detail: string,
): void {
    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(result.error.kind).toBe('parse-game-package');
        if (result.error.kind === 'parse-game-package') {
            expect(result.error.details).toContain(detail);
        }
    }
}
