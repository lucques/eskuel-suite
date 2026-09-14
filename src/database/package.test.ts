import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';

import {
    ESKUEL_DATABASE_PACKAGE_PROFILE,
    MAX_DATABASE_PACKAGE_AUXILIARY_FILE_BYTES,
    MAX_DATABASE_PACKAGE_DESCRIPTOR_BYTES,
    MAX_DATABASE_PACKAGE_LICENSE_BYTES,
    parseDatabasePackage,
    readDatabasePackage,
} from './package';
import type { DatabaseSystem } from './system';

const textEncoder = new TextEncoder();
const exampleSql = '-- eskuel:system=sqlite\n-- eskuel:systemMinVersion=3.0.0\nCREATE TABLE example (id INTEGER);\n';
const exampleLicense = 'Example License\n\nPermission is granted to use the example database.\n';

describe('Eskuel database package parser', () => {
    it('loads the published initial SQL script example', async () => {
        const archive = readExampleArchive('initial-sql-script.eskueldb');

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expect(result).toEqual({
            ok: true,
            data: {
                type: 'initial-sql-script',
                system: 'sqlite',
                sql: expect.stringContaining('CREATE TABLE students'),
                systemMinVersion: '3.0.0',
            },
        });
    });

    it('loads the published SQLite database-file example', async () => {
        const archive = readExampleArchive('database-file.eskueldb');

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data).toMatchObject({
                type: 'sqlite-db',
                systemMinVersion: '3.0.0',
            });
            expect(result.data.type === 'sqlite-db' ? result.data.data.byteLength : null).toBe(8192);
        }
    });

    it('loads the published PostgreSQL initialization-script example', async () => {
        const archive = readExampleArchive('postgresql-initial-sql-script.eskueldb');

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expect(result).toEqual({
            ok: true,
            data: {
                type: 'initial-sql-script',
                system: 'postgresql',
                sql: expect.stringContaining('CREATE TABLE students'),
                systemMinVersion: '14.0.0',
            },
        });
    });

    it('rejects a file that is not a ZIP archive', async () => {
        const result = await parseDatabasePackage(textEncoder.encode('not a zip'), 1024);

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-database-package',
                details: 'File is not a supported ZIP archive',
            },
        });
    });

    it('rejects unknown descriptor properties', async () => {
        const archive = await makeSqlPackage({ descriptorUpdates: { description: 'Not allowed in v1' } });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, "datapackage.json contains unknown property 'description'");
    });

    it('rejects unknown profiles instead of guessing a format version', async () => {
        const archive = await makeSqlPackage({ descriptorUpdates: { $schema: 'https://example.com/v2.json' } });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, 'datapackage.json/$schema should be equal to constant');
    });

    it('rejects unsafe archive entry paths before reading the descriptor', async () => {
        const bytes = textEncoder.encode(exampleSql);
        const descriptor = await makeSqlDescriptor(bytes, {
            resourceUpdates: { path: '../example.sql' },
        });
        const archive = zipSync({
            'datapackage.json': textEncoder.encode(JSON.stringify(descriptor)),
            '../example.sql': bytes,
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, 'unsafe or hidden path segment');
    });

    it('rejects symbolic-link entries', async () => {
        const bytes = textEncoder.encode(exampleSql);
        const descriptor = await makeSqlDescriptor(bytes);
        const archive = zipSync({
            'datapackage.json': textEncoder.encode(JSON.stringify(descriptor)),
            'data/example.sql': [bytes, { os: 3, attrs: 0o120777 << 16 }],
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, 'symbolic link');
    });

    it('rejects files not declared as the resource or a license', async () => {
        const archive = await makeSqlPackage({
            extraEntries: { 'README.txt': textEncoder.encode('extra') },
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, "Archive contains undeclared entry 'README.txt'");
    });

    it('requires license paths to name bundled files', async () => {
        const archive = await makeSqlPackage({ includeLicense: false });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, "Archive does not contain declared license file 'LICENSES/Example.txt'");
    });

    it('rejects remote license paths', async () => {
        const archive = await makeSqlPackage({
            descriptorUpdates: {
                licenses: [{ name: 'Example', path: 'https://example.com/LICENSE.txt' }],
            },
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, 'datapackage.json/licenses/0/path should match pattern');
    });

    it('rejects duplicate license paths', async () => {
        const archive = await makeSqlPackage({
            descriptorUpdates: {
                licenses: [
                    { name: 'Example-A', path: 'LICENSES/Example.txt' },
                    { name: 'Example-B', path: 'LICENSES/example.txt' },
                ],
            },
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, 'datapackage.json file paths must be distinct');
    });

    it('accepts multiple declared license files', async () => {
        const archive = await makeSqlPackage({
            descriptorUpdates: {
                licenses: [
                    { name: 'Example', path: 'LICENSES/Example.txt' },
                    { name: 'Other', path: 'LICENSES/Other.txt' },
                ],
            },
            extraEntries: {
                'LICENSES/Other.txt': textEncoder.encode('Other License\n'),
            },
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expect(result.ok).toBe(true);
    });

    it('rejects invalid UTF-8 in a bundled license', async () => {
        const archive = await makeSqlPackage({
            licenseBytes: new Uint8Array([0xff]),
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, "License file 'LICENSES/Example.txt' is not valid UTF-8");
    });

    it('rejects an empty bundled license', async () => {
        const archive = await makeSqlPackage({ licenseBytes: new Uint8Array() });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, "License file 'LICENSES/Example.txt' must not be empty");
    });

    it('applies the license size limit before decompression', async () => {
        const archive = await makeSqlPackage({
            licenseBytes: new Uint8Array(MAX_DATABASE_PACKAGE_LICENSE_BYTES + 1),
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expect(result).toEqual({ ok: false, error: { kind: 'file-size-too-large' } });
    });

    it('retains declared text notices and provenance', async () => {
        const noticeText = 'Example notice\n';
        const provenanceText = '{"source":"Example source"}\n';
        const archive = await makeSqlPackage({
            descriptorUpdates: {
                notices: [{ title: 'Example notice', path: 'NOTICES/Example.txt' }],
                provenance: { path: 'PROVENANCE', mediatype: 'application/json' },
            },
            extraEntries: {
                'NOTICES/Example.txt': textEncoder.encode(noticeText),
                PROVENANCE: textEncoder.encode(provenanceText),
            },
        });

        const result = await readDatabasePackage(archive, 1024 * 1024);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.licenses).toEqual([{
                metadata: { name: 'Example', path: 'LICENSES/Example.txt' },
                text: exampleLicense,
            }]);
            expect(result.data.notices).toEqual([{
                metadata: { title: 'Example notice', path: 'NOTICES/Example.txt' },
                text: noticeText,
            }]);
            expect(result.data.provenance).toEqual({
                metadata: { path: 'PROVENANCE', mediatype: 'application/json' },
                text: provenanceText,
            });
        }
    });

    it.each([
        { bytes: new Uint8Array([0xff]), detail: 'is not valid UTF-8' },
        { bytes: textEncoder.encode('  \n'), detail: 'must not be empty' },
        { bytes: textEncoder.encode('rights\0notice'), detail: 'must be plain text' },
    ])('rejects invalid text notices: $detail', async ({ bytes, detail }) => {
        const archive = await makeSqlPackage({
            descriptorUpdates: {
                notices: [{ path: 'NOTICES/Example.txt' }],
            },
            extraEntries: {
                'NOTICES/Example.txt': bytes,
            },
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, detail);
    });

    it.each([
        { bytes: new Uint8Array([0xff]), detail: 'is not valid UTF-8' },
        { bytes: textEncoder.encode('  \n'), detail: 'must not be empty' },
        { bytes: textEncoder.encode('source\0data'), detail: 'must be plain text' },
    ])('rejects invalid text provenance: $detail', async ({ bytes, detail }) => {
        const archive = await makeSqlPackage({
            descriptorUpdates: {
                provenance: { path: 'PROVENANCE.txt', mediatype: 'text/plain' },
            },
            extraEntries: {
                'PROVENANCE.txt': bytes,
            },
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, detail);
    });

    it('requires every declared notice and provenance file', async () => {
        const archive = await makeSqlPackage({
            descriptorUpdates: {
                notices: [{ path: 'NOTICES/Missing.txt' }],
                provenance: { path: 'PROVENANCE.txt', mediatype: 'text/plain' },
            },
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, "Archive does not contain declared notice file 'NOTICES/Missing.txt'");
    });

    it('rejects notice and provenance paths outside their conventional locations', async () => {
        const archive = await makeSqlPackage({
            descriptorUpdates: {
                notices: [{ path: 'NOTICE.txt' }],
                provenance: { path: 'metadata/provenance.json', mediatype: 'application/json' },
            },
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, 'datapackage.json/notices/0/path should match pattern');
    });

    it('limits declared notice and provenance files before decompression', async () => {
        const archive = await makeSqlPackage({
            descriptorUpdates: {
                provenance: { path: 'PROVENANCE.data', mediatype: 'text/plain' },
            },
            extraEntries: {
                'PROVENANCE.data': new Uint8Array(MAX_DATABASE_PACKAGE_AUXILIARY_FILE_BYTES + 1),
            },
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expect(result).toEqual({ ok: false, error: { kind: 'file-size-too-large' } });
    });

    it('rejects a descriptor whose bytes value differs from the ZIP entry', async () => {
        const archive = await makeSqlPackage({ resourceUpdates: { bytes: 1 } });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, 'Resource bytes is 1');
    });

    it('rejects a resource whose SHA-256 does not match', async () => {
        const archive = await makeSqlPackage({
            resourceUpdates: { hash: `sha256:${'0'.repeat(64)}` },
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, 'Resource SHA-256 hash does not match descriptor');
    });

    it('rejects a PostgreSQL directive in a package declaring SQLite', async () => {
        const archive = await makeSqlPackage({
            sql: '-- eskuel:system=postgresql\n-- eskuel:systemMinVersion=14.0.0\nSELECT 1;\n',
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, 'script declares postgresql, but the package declares sqlite');
    });

    it('uses a PostgreSQL package declaration when the script omits redundant metadata', async () => {
        const archive = await makeSqlPackage({
            sql: 'CREATE TABLE example (id INTEGER);\n',
            system: 'postgresql',
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expect(result).toMatchObject({
            ok: true,
            data: { type: 'initial-sql-script', system: 'postgresql' },
        });
    });

    it('rejects an SQLite directive in a package declaring PostgreSQL', async () => {
        const archive = await makeSqlPackage({ system: 'postgresql' });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, 'script declares sqlite, but the package declares postgresql');
    });

    it('rejects a byte-order mark in a packaged SQL script', async () => {
        const archive = await makeSqlPackage({
            sql: '\uFEFF-- eskuel:system=sqlite\n-- eskuel:systemMinVersion=3.0.0\nSELECT 1;\n',
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expectPackageFailure(result, 'must not contain a UTF-8 byte-order mark');
    });

    it('applies the resource size limit before decompression', async () => {
        const archive = await makeSqlPackage();

        const result = await parseDatabasePackage(archive, 1);

        expect(result).toEqual({ ok: false, error: { kind: 'file-size-too-large' } });
    });

    it('applies the descriptor size limit before decompression', async () => {
        const bytes = textEncoder.encode(exampleSql);
        const descriptor = await makeSqlDescriptor(bytes);
        const oversizedDescriptor = textEncoder.encode(
            JSON.stringify(descriptor) + ' '.repeat(MAX_DATABASE_PACKAGE_DESCRIPTOR_BYTES),
        );
        const archive = zipSync({
            'datapackage.json': oversizedDescriptor,
            'data/example.sql': bytes,
        });

        const result = await parseDatabasePackage(archive, 1024 * 1024);

        expect(result).toEqual({ ok: false, error: { kind: 'file-size-too-large' } });
    });
});

type SqlPackageOptions = {
    sql?: string;
    system?: DatabaseSystem;
    descriptorUpdates?: Record<string, unknown>;
    resourceUpdates?: Record<string, unknown>;
    extraEntries?: Record<string, Uint8Array>;
    includeLicense?: boolean;
    licenseBytes?: Uint8Array;
};

async function makeSqlPackage(options: SqlPackageOptions = {}): Promise<Uint8Array> {
    const bytes = textEncoder.encode(options.sql ?? exampleSql);
    const descriptor = await makeSqlDescriptor(bytes, options);
    return zipSync({
        'datapackage.json': textEncoder.encode(JSON.stringify(descriptor)),
        'data/example.sql': bytes,
        ...(options.includeLicense === false
            ? {}
            : { 'LICENSES/Example.txt': options.licenseBytes ?? textEncoder.encode(exampleLicense) }),
        ...options.extraEntries,
    });
}

async function makeSqlDescriptor(
    bytes: Uint8Array,
    options: Pick<SqlPackageOptions, 'descriptorUpdates' | 'resourceUpdates' | 'system'> = {},
): Promise<Record<string, unknown>> {
    const hash = await sha256(bytes);
    const resource = {
        name: 'example',
        path: 'data/example.sql',
        format: 'sql',
        mediatype: 'application/sql',
        bytes: bytes.byteLength,
        hash: `sha256:${hash}`,
        'eskuel:database': {
            artifactType: 'initial-sql-script',
            system: options.system ?? 'sqlite',
            systemMinVersion: '3.0.0',
        },
        ...options.resourceUpdates,
    };
    return {
        $schema: ESKUEL_DATABASE_PACKAGE_PROFILE,
        name: 'example',
        title: 'Example database',
        version: '1.0.0',
        contributors: [{ title: 'Example author', roles: ['creator'] }],
        licenses: [{ name: 'Example', path: 'LICENSES/Example.txt' }],
        resources: [resource],
        ...options.descriptorUpdates,
    };
}

async function sha256(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function readExampleArchive(filename: string): Uint8Array {
    return new Uint8Array(readFileSync(new URL(`../../spec/database-package/v1/examples/${filename}`, import.meta.url)));
}

function expectPackageFailure(
    result: Awaited<ReturnType<typeof parseDatabasePackage>>,
    detail: string,
): void {
    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(result.error.kind).toBe('parse-database-package');
        if (result.error.kind === 'parse-database-package') {
            expect(result.error.details).toContain(detail);
        }
    }
}
