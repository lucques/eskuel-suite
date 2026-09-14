import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
    createDatabasePackage,
    parseDatabasePackageRecipe,
} from './package-authoring';
import { readDatabasePackage } from './package';

const encoder = new TextEncoder();
const licenseBytes = encoder.encode('Example License\n');
const noticeBytes = encoder.encode('Example Notice\n');
const provenanceBytes = encoder.encode('{"source":"Example source"}\n');
const exampleRecipe = JSON.parse(readFileSync(new URL(
    '../../spec/database-package-recipe/v1/examples/example.recipe.json',
    import.meta.url,
), 'utf8')) as Record<string, unknown>;

describe('Eskuel database package authoring', () => {
    it('creates a package whose generated descriptor values validate', async () => {
        const recipe = parseDatabasePackageRecipe(makeRecipe());
        const sql = encoder.encode('-- eskuel:system=sqlite\n-- eskuel:systemMinVersion=3.37.0\nCREATE TABLE example (id INTEGER);\n');

        const archive = await createDatabasePackage(
            recipe,
            sql,
            makePackageFiles(),
        );
        const result = await readDatabasePackage(archive, 1024 * 1024);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.descriptor).toMatchObject({
                name: 'example',
                version: '1.0.0',
                contributors: [
                    {
                        title: 'Example author',
                        roles: ['creator'],
                    },
                    {
                        title: 'Example author',
                        roles: ['dataCreator'],
                    },
                ],
                notices: [{ title: 'Example rights notice', path: 'NOTICES/Example.txt' }],
                provenance: { path: 'PROVENANCE.json', mediatype: 'application/json' },
                resources: [{
                    path: 'data/example.sql',
                    format: 'sql',
                    mediatype: 'application/sql',
                    bytes: sql.byteLength,
                    hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
                    'eskuel:database': {
                        artifactType: 'initial-sql-script',
                        system: 'sqlite',
                        systemMinVersion: '3.37.0',
                    },
                }],
            });
            expect(result.data.data).toMatchObject({
                type: 'initial-sql-script',
                system: 'sqlite',
            });
            expect(result.data.notices).toEqual([{
                metadata: { title: 'Example rights notice', path: 'NOTICES/Example.txt' },
                text: 'Example Notice\n',
            }]);
        }
    });

    it('creates deterministic archives from the same inputs', async () => {
        const recipe = parseDatabasePackageRecipe(makeRecipe());
        const sql = encoder.encode('SELECT 1;\n');
        const licenses = makePackageFiles();

        const first = await createDatabasePackage(recipe, sql, licenses);
        const second = await createDatabasePackage(recipe, sql, licenses);

        expect(second).toEqual(first);
    });

    it('supports PostgreSQL initialization-script packages', async () => {
        const recipe = parseDatabasePackageRecipe(makeRecipe({
            resource: {
                name: 'example',
                path: 'data/example.sql',
                artifactType: 'initial-sql-script',
                system: 'postgresql',
                systemMinVersion: '14.0.0',
            },
        }));

        const archive = await createDatabasePackage(
            recipe,
            encoder.encode('CREATE TABLE example (id INTEGER);\n'),
            makePackageFiles(),
        );
        const result = await readDatabasePackage(archive, 1024 * 1024);

        expect(result).toMatchObject({
            ok: true,
            data: {
                data: {
                    type: 'initial-sql-script',
                    system: 'postgresql',
                    systemMinVersion: '14.0.0',
                },
            },
        });
    });

    it('creates SQLite database-file packages', async () => {
        const recipe = parseDatabasePackageRecipe(makeRecipe({
            resource: {
                name: 'example',
                path: 'data/example.sqlite',
                artifactType: 'database-file',
                system: 'sqlite',
                systemMinVersion: '3.0.0',
            },
        }));
        const database = new Uint8Array(readFileSync(new URL(
            '../../spec/database-package/v1/examples/database-file/data/example-school.sqlite',
            import.meta.url,
        )));

        const archive = await createDatabasePackage(
            recipe,
            database,
            makePackageFiles(),
        );
        const result = await readDatabasePackage(archive, 1024 * 1024);

        expect(result).toMatchObject({
            ok: true,
            data: {
                data: {
                    type: 'sqlite-db',
                    systemMinVersion: '3.0.0',
                },
                descriptor: {
                    resources: [{
                        format: 'sqlite',
                        mediatype: 'application/vnd.sqlite3',
                    }],
                },
            },
        });
    });

    it('rejects unknown recipe properties', () => {
        expect(() => parseDatabasePackageRecipe({
            ...makeRecipe(),
            description: 'Not part of the recipe contract',
        })).toThrow("recipe contains unknown property 'description'");
    });

    it('enforces artifact-specific recipe metadata through the JSON Schema', () => {
        expect(() => parseDatabasePackageRecipe(makeRecipe({
            resource: {
                name: 'example',
                path: 'data/example.sqlite',
                artifactType: 'database-file',
                system: 'postgresql',
                systemMinVersion: '14.0.0',
            },
        }))).toThrow('recipe/resource/system should be equal to constant');
    });

    it('requires distinct package paths beyond structural schema validation', () => {
        const license = {
            name: 'Example',
            path: 'LICENSES/Example.txt',
            inputPath: 'Example-License.txt',
        };
        expect(() => parseDatabasePackageRecipe(makeRecipe({
            licenses: [
                license,
                {
                    ...license,
                    path: 'LICENSES/example.txt',
                    inputPath: 'Other-License.txt',
                },
            ],
        }))).toThrow('recipe package paths must be distinct');
    });

    it('requires every declared package-file input', async () => {
        const recipe = parseDatabasePackageRecipe(makeRecipe());

        await expect(createDatabasePackage(
            recipe,
            encoder.encode('SELECT 1;\n'),
            new Map(),
        )).rejects.toThrow("No input was supplied for package path 'LICENSES/Example.txt'");
    });

    it('rejects non-text notice contents', async () => {
        const recipe = parseDatabasePackageRecipe(makeRecipe());
        const files = makePackageFiles();
        files.set('NOTICES/Example.txt', new Uint8Array([0xff, 0x00]));

        await expect(createDatabasePackage(
            recipe,
            encoder.encode('SELECT 1;\n'),
            files,
        )).rejects.toThrow("Notice file 'NOTICES/Example.txt' is not valid UTF-8");
    });

    it('rejects non-text provenance contents', async () => {
        const recipe = parseDatabasePackageRecipe(makeRecipe());
        const files = makePackageFiles();
        files.set('PROVENANCE.json', new Uint8Array([0xff, 0x00]));

        await expect(createDatabasePackage(
            recipe,
            encoder.encode('SELECT 1;\n'),
            files,
        )).rejects.toThrow("Provenance file 'PROVENANCE.json' is not valid UTF-8");
    });
});

function makeRecipe(updates: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ...structuredClone(exampleRecipe),
        ...updates,
    };
}

function makePackageFiles(): Map<string, Uint8Array> {
    return new Map([
        ['LICENSES/Example.txt', licenseBytes],
        ['NOTICES/Example.txt', noticeBytes],
        ['PROVENANCE.json', provenanceBytes],
    ]);
}
