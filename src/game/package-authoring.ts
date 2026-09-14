import { zipSync } from 'fflate';
import type { Zippable, ZipOptions } from 'fflate';
import { Effect } from 'effect';

import gamePackageSchema from '../../spec/game-package/v1/datapackage.schema.json';
import gamePackageRecipeSchema from '../../spec/game-package-recipe/v1/recipe.schema.json';

import {
    ESKUEL_GAME_PACKAGE_PROFILE,
    readGamePackage,
} from './package';
import type { GamePackageDescriptor } from './package';
import { loadGameWithInfo } from './loader';
import { fastXmlParser } from './xml/fast-parser';
import { sha256 } from '../package/archive';
import { compileJsonSchema, requireJsonSchema } from '../package/json-schema';
import { requireDistinctPaths } from '../package/profile';
import type {
    Contributor,
    License,
    PackageNotice,
    PackageProvenance,
    PackageSource,
} from '../package/profile';

export const ESKUEL_GAME_PACKAGE_RECIPE_PROFILE = gamePackageRecipeSchema.$id;
export const DEFAULT_GAME_PACKAGE_BYTES = 128 * 1024 * 1024;
export const DEFAULT_GAME_XML_BYTES = 20 * 1024 * 1024;
export const DEFAULT_GAME_DATABASE_PACKAGE_BYTES = 100 * 1024 * 1024;
export const DEFAULT_GAME_DATABASE_RESOURCE_BYTES = 100 * 1024 * 1024;

const COMPRESSED_ZIP_ENTRY_OPTIONS = {
    attrs: 0o100644 << 16,
    level: 9,
    mtime: new Date(1980, 0, 1, 0, 0, 0),
    os: 3,
} as const satisfies ZipOptions;
const STORED_ZIP_ENTRY_OPTIONS = {
    ...COMPRESSED_ZIP_ENTRY_OPTIONS,
    level: 0,
} as const satisfies ZipOptions;
const validateGamePackageRecipe = compileJsonSchema(
    gamePackageRecipeSchema,
    [gamePackageSchema],
);

export type GamePackageRecipeLicense = License & {
    inputPath: string;
};

export type GamePackageRecipeNotice = PackageNotice & {
    inputPath: string;
};

export type GamePackageRecipeProvenance = PackageProvenance & {
    inputPath: string;
};

export type GamePackageRecipe = {
    $schema: typeof ESKUEL_GAME_PACKAGE_RECIPE_PROFILE;
    name: string;
    title: string;
    version: string;
    contributors: Contributor[];
    licenses: GamePackageRecipeLicense[];
    notices?: GamePackageRecipeNotice[];
    provenance?: GamePackageRecipeProvenance;
    sources?: PackageSource[];
};

export function parseGamePackageRecipe(candidate: unknown): GamePackageRecipe {
    const recipe = requireJsonSchema<GamePackageRecipe>(
        candidate,
        validateGamePackageRecipe,
        'recipe',
    );
    requireDistinctPaths([
        'datapackage.json',
        `data/${recipe.name}.xml`,
        'dependencies/database.eskueldb',
        ...recipe.licenses.map(license => license.path),
        ...(recipe.notices ?? []).map(notice => notice.path),
        ...(recipe.provenance === undefined ? [] : [recipe.provenance.path]),
    ], 'recipe package paths');
    return recipe;
}

export async function createGamePackage(
    recipe: GamePackageRecipe,
    gameXmlBytes: Uint8Array,
    databasePackageBytes: Uint8Array,
    packageFiles: ReadonlyMap<string, Uint8Array>,
): Promise<Uint8Array> {
    if (gameXmlBytes.byteLength > DEFAULT_GAME_XML_BYTES) {
        throw new Error(`Game XML exceeds the ${DEFAULT_GAME_XML_BYTES}-byte authoring limit`);
    }
    else if (databasePackageBytes.byteLength > DEFAULT_GAME_DATABASE_PACKAGE_BYTES) {
        throw new Error(
            `Database package exceeds the ${DEFAULT_GAME_DATABASE_PACKAGE_BYTES}-byte authoring limit`,
        );
    }

    const declaredPackageFiles = [
        ...recipe.licenses,
        ...(recipe.notices ?? []),
        ...(recipe.provenance === undefined ? [] : [recipe.provenance]),
    ];
    const declaredPaths = new Set(declaredPackageFiles.map(file => file.path));
    const unexpectedFile = Array.from(packageFiles.keys()).find(path => !declaredPaths.has(path));
    if (unexpectedFile !== undefined) {
        throw new Error(`No recipe file declares package path '${unexpectedFile}'`);
    }
    const missingFile = declaredPackageFiles.find(file => !packageFiles.has(file.path));
    if (missingFile !== undefined) {
        throw new Error(`No input was supplied for package path '${missingFile.path}'`);
    }

    const gameDigest = await requireDigest(gameXmlBytes);
    const databaseDigest = await requireDigest(databasePackageBytes);
    const descriptor: GamePackageDescriptor = {
        $schema: ESKUEL_GAME_PACKAGE_PROFILE,
        name: recipe.name,
        title: recipe.title,
        version: recipe.version,
        contributors: recipe.contributors,
        licenses: recipe.licenses.map(toDescriptorLicense),
        ...(recipe.notices === undefined ? {} : { notices: recipe.notices.map(toDescriptorNotice) }),
        ...(recipe.provenance === undefined ? {} : { provenance: toDescriptorProvenance(recipe.provenance) }),
        ...(recipe.sources === undefined ? {} : { sources: recipe.sources }),
        resources: [{
            name: 'game',
            path: `data/${recipe.name}.xml`,
            format: 'xml',
            mediatype: 'application/xml',
            bytes: gameXmlBytes.byteLength,
            hash: `sha256:${gameDigest}`,
        }, {
            name: 'database',
            path: 'dependencies/database.eskueldb',
            format: 'eskueldb',
            mediatype: 'application/zip',
            bytes: databasePackageBytes.byteLength,
            hash: `sha256:${databaseDigest}`,
        }],
    };
    const descriptorBytes = new TextEncoder().encode(`${JSON.stringify(descriptor, null, 4)}\n`);
    const entries: Zippable = {
        'datapackage.json': [descriptorBytes, COMPRESSED_ZIP_ENTRY_OPTIONS],
        [`data/${recipe.name}.xml`]: [gameXmlBytes, COMPRESSED_ZIP_ENTRY_OPTIONS],
        'dependencies/database.eskueldb': [databasePackageBytes, STORED_ZIP_ENTRY_OPTIONS],
    };
    for (const file of declaredPackageFiles) {
        entries[file.path] = [packageFiles.get(file.path)!, COMPRESSED_ZIP_ENTRY_OPTIONS];
    }

    const archive = zipSync(entries);
    if (archive.byteLength > DEFAULT_GAME_PACKAGE_BYTES) {
        throw new Error(`Game package exceeds the ${DEFAULT_GAME_PACKAGE_BYTES}-byte authoring limit`);
    }
    const result = await readGamePackage(archive, {
        maxGameXmlBytes: DEFAULT_GAME_XML_BYTES,
        maxDatabasePackageBytes: DEFAULT_GAME_DATABASE_PACKAGE_BYTES,
        maxDatabaseResourceBytes: DEFAULT_GAME_DATABASE_RESOURCE_BYTES,
    });
    if (!result.ok) {
        throw new Error(result.error.kind === 'file-size-too-large'
            ? 'Generated package exceeds an Eskuel Suite implementation limit'
            : `Generated package is invalid: ${result.error.details}`);
    }
    try {
        await Effect.runPromise(loadGameWithInfo({
            type: 'eskuel-game-package',
            source: { type: 'inline', content: archive },
        }, fastXmlParser));
    }
    catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'kind' in error && error.kind === 'file-size-too-large') {
            throw new Error('Generated package exceeds an Eskuel Suite implementation limit');
        }
        else if (typeof error === 'object' && error !== null && 'details' in error && typeof error.details === 'string') {
            throw new Error(`Generated package is invalid: ${error.details}`);
        }
        else {
            throw new Error(`Generated package is invalid: ${String(error)}`);
        }
    }
    return archive;
}

async function requireDigest(bytes: Uint8Array): Promise<string> {
    const result = await sha256(bytes, 'create-game-package');
    if (!result.ok) {
        throw new Error(result.error.details);
    }
    return result.data;
}

function toDescriptorLicense(license: GamePackageRecipeLicense): License {
    return {
        ...(license.name === undefined ? {} : { name: license.name }),
        path: license.path,
        ...(license.title === undefined ? {} : { title: license.title }),
    };
}

function toDescriptorNotice(notice: GamePackageRecipeNotice): PackageNotice {
    return {
        path: notice.path,
        ...(notice.title === undefined ? {} : { title: notice.title }),
    };
}

function toDescriptorProvenance(provenance: GamePackageRecipeProvenance): PackageProvenance {
    return {
        path: provenance.path,
        mediatype: provenance.mediatype,
    };
}
