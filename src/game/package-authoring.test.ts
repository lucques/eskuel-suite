import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
    createGamePackage,
    parseGamePackageRecipe,
} from './package-authoring';
import type { GamePackageRecipe } from './package-authoring';
import { readGamePackage } from './package';

const textEncoder = new TextEncoder();
const gameXml = textEncoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<game format-version="2" db-system="sqlite" db-system-min-version="3.0.0">
    <head><title>Example game</title><teaser>Teaser</teaser><copyright>Example author</copyright></head>
    <scenes><text-scene><text>Introduction</text></text-scene></scenes>
</game>
`);
const limits = {
    maxGameXmlBytes: 1024 * 1024,
    maxDatabasePackageBytes: 1024 * 1024,
    maxDatabaseResourceBytes: 1024 * 1024,
};

describe('Eskuel game-package authoring', () => {
    it('parses the published recipe and creates a metadata-preserving package', async () => {
        const recipe = readExampleRecipe();
        const packageFiles = new Map([
            ['LICENSES/CC0-1.0.txt', textEncoder.encode('Example License\n')],
            ['NOTICES/THIRD-PARTY-RIGHTS.txt', textEncoder.encode('Example Notice\n')],
            ['PROVENANCE.json', textEncoder.encode('{"source":"example"}\n')],
        ]);

        const archive = await createGamePackage(
            recipe,
            gameXml,
            readDatabaseExampleArchive(),
            packageFiles,
        );
        const result = await readGamePackage(archive, limits);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.descriptor.resources).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'game', path: 'data/example-game.xml' }),
                expect.objectContaining({ name: 'database', path: 'dependencies/database.eskueldb' }),
            ]));
            expect(result.data.licenses[0].text).toBe('Example License\n');
            expect(result.data.notices[0].text).toBe('Example Notice\n');
            expect(result.data.provenance?.text).toBe('{"source":"example"}\n');
            expect(result.data.database.descriptor.name).toBe('example-school-sql');
        }
    });

    it('creates deterministic bytes for identical inputs', async () => {
        const recipe = minimalRecipe();
        const files = new Map([['LICENSES/Example.txt', textEncoder.encode('Example License\n')]]);
        const database = readDatabaseExampleArchive();

        const first = await createGamePackage(recipe, gameXml, database, files);
        const second = await createGamePackage(recipe, gameXml, database, files);

        expect(second).toEqual(first);
    });

    it('rejects missing declared package files', async () => {
        const recipe = minimalRecipe();

        await expect(createGamePackage(
            recipe,
            gameXml,
            readDatabaseExampleArchive(),
            new Map(),
        )).rejects.toThrow("No input was supplied for package path 'LICENSES/Example.txt'");
    });

    it('rejects a database dependency whose system differs from the game XML db-system', async () => {
        const files = new Map([['LICENSES/Example.txt', textEncoder.encode('Example License\n')]]);

        await expect(createGamePackage(
            minimalRecipe(),
            gameXml,
            readDatabaseExampleArchive('postgresql-initial-sql-script.eskueldb'),
            files,
        )).rejects.toThrow('Game XML db-system must match database dependency system postgresql');
    });

    it('rejects unsafe recipe input paths', () => {
        const candidate = readJson('../../spec/game-package-recipe/v1/examples/example.recipe.json');
        const licenses = candidate.licenses as Array<Record<string, unknown>>;
        licenses[0].inputPath = '../LICENSE.txt';

        expect(() => parseGamePackageRecipe(candidate)).toThrow('recipe/licenses/0/inputPath should match pattern');
    });
});

function readExampleRecipe(): GamePackageRecipe {
    return parseGamePackageRecipe(readJson(
        '../../spec/game-package-recipe/v1/examples/example.recipe.json',
    ));
}

function minimalRecipe(): GamePackageRecipe {
    return parseGamePackageRecipe({
        $schema: 'https://raw.githubusercontent.com/lucques/eskuel-suite/master/spec/game-package-recipe/v1/recipe.schema.json',
        name: 'example-game',
        title: 'Example game',
        version: '1.0.0',
        contributors: [{ title: 'Example author', roles: ['creator'] }],
        licenses: [{
            name: 'Example',
            path: 'LICENSES/Example.txt',
            inputPath: 'Example.txt',
        }],
    });
}

function readDatabaseExampleArchive(filename = 'initial-sql-script.eskueldb'): Uint8Array {
    return new Uint8Array(readFileSync(new URL(
        `../../spec/database-package/v1/examples/${filename}`,
        import.meta.url,
    )));
}

function readJson(relativePath: string): Record<string, unknown> {
    return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as Record<string, unknown>;
}
