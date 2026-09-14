import { zipSync } from 'fflate';
import type { Zippable, ZipOptions } from 'fflate';

import databasePackageSchema from '../../spec/database-package/v1/datapackage.schema.json';
import databasePackageRecipeSchema from '../../spec/database-package-recipe/v1/recipe.schema.json';

import {
    ESKUEL_DATABASE_PACKAGE_PROFILE,
    readDatabasePackage,
} from './package';
import type {
    DatabaseArtifactType,
    DatabasePackageDescriptor,
    DatabaseResource,
    PackageNotice,
    PackageProvenance,
} from './package';
import type { DatabaseSystem } from './system';
import { sqlScriptWithSystemMetadata } from './system';
import { sha256 } from '../package/archive';
import { compileJsonSchema, requireJsonSchema } from '../package/json-schema';
import { requireDistinctPaths } from '../package/profile';
import type { Contributor, License, PackageSource } from '../package/profile';

export const ESKUEL_DATABASE_PACKAGE_RECIPE_PROFILE = databasePackageRecipeSchema.$id;
export const DEFAULT_DATABASE_PACKAGE_BYTES = 100 * 1024 * 1024;
export const DEFAULT_DATABASE_RESOURCE_BYTES = 100 * 1024 * 1024;

const ZIP_ENTRY_OPTIONS = {
    attrs: 0o100644 << 16,
    level: 9,
    mtime: new Date(1980, 0, 1, 0, 0, 0),
    os: 3,
} as const satisfies ZipOptions;
const validateDatabasePackageRecipe = compileJsonSchema(
    databasePackageRecipeSchema,
    [databasePackageSchema],
);

export type DatabasePackageRecipeLicense = License & {
    inputPath: string;
};

export type DatabasePackageRecipeNotice = PackageNotice & {
    inputPath: string;
};

export type DatabasePackageRecipeProvenance = PackageProvenance & {
    inputPath: string;
};

export type DatabasePackageRecipeResource = {
    name: string;
    path: string;
    artifactType: DatabaseArtifactType;
    system: DatabaseSystem;
    systemMinVersion: string;
};

export type DatabasePackageRecipe = {
    $schema: typeof ESKUEL_DATABASE_PACKAGE_RECIPE_PROFILE;
    name: string;
    title: string;
    version: string;
    contributors: Contributor[];
    licenses: DatabasePackageRecipeLicense[];
    notices?: DatabasePackageRecipeNotice[];
    provenance?: DatabasePackageRecipeProvenance;
    sources?: PackageSource[];
    resource: DatabasePackageRecipeResource;
};

export function parseDatabasePackageRecipe(candidate: unknown): DatabasePackageRecipe {
    const recipe = requireJsonSchema<DatabasePackageRecipe>(
        candidate,
        validateDatabasePackageRecipe,
        'recipe',
    );
    const packagePaths = [
        'datapackage.json',
        recipe.resource.path,
        ...recipe.licenses.map(license => license.path),
        ...(recipe.notices ?? []).map(notice => notice.path),
        ...(recipe.provenance === undefined ? [] : [recipe.provenance.path]),
    ];
    requireDistinctPaths(packagePaths, 'recipe package paths');
    return recipe;
}

export async function createDatabasePackage(
    recipe: DatabasePackageRecipe,
    artifactBytes: Uint8Array,
    packageFiles: ReadonlyMap<string, Uint8Array>,
): Promise<Uint8Array> {
    const resourceBytes = databaseResourceBytes(recipe.resource, artifactBytes);
    if (resourceBytes.byteLength > DEFAULT_DATABASE_RESOURCE_BYTES) {
        throw new Error(`Database resource exceeds the ${DEFAULT_DATABASE_RESOURCE_BYTES}-byte authoring limit`);
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

    const digestResult = await sha256(resourceBytes, 'create-database-package');
    if (!digestResult.ok) {
        throw new Error(digestResult.error.details);
    }
    const resource = createResource(recipe.resource, resourceBytes.byteLength, digestResult.data);
    const descriptor: DatabasePackageDescriptor = {
        $schema: ESKUEL_DATABASE_PACKAGE_PROFILE,
        name: recipe.name,
        title: recipe.title,
        version: recipe.version,
        contributors: recipe.contributors,
        licenses: recipe.licenses.map(toDescriptorLicense),
        ...(recipe.notices === undefined ? {} : { notices: recipe.notices.map(toDescriptorNotice) }),
        ...(recipe.provenance === undefined ? {} : { provenance: toDescriptorProvenance(recipe.provenance) }),
        ...(recipe.sources === undefined ? {} : { sources: recipe.sources }),
        resources: [resource],
    };
    const descriptorBytes = new TextEncoder().encode(`${JSON.stringify(descriptor, null, 4)}\n`);
    const entries: Zippable = {
        'datapackage.json': [descriptorBytes, ZIP_ENTRY_OPTIONS],
        [resource.path]: [resourceBytes, ZIP_ENTRY_OPTIONS],
    };
    for (const file of declaredPackageFiles) {
        entries[file.path] = [packageFiles.get(file.path)!, ZIP_ENTRY_OPTIONS];
    }

    const archive = zipSync(entries);
    if (archive.byteLength > DEFAULT_DATABASE_PACKAGE_BYTES) {
        throw new Error(`Database package exceeds the ${DEFAULT_DATABASE_PACKAGE_BYTES}-byte authoring limit`);
    }
    const result = await readDatabasePackage(archive, DEFAULT_DATABASE_RESOURCE_BYTES);
    if (!result.ok) {
        throw new Error(result.error.kind === 'file-size-too-large'
            ? 'Generated package exceeds an Eskuel Suite implementation limit'
            : `Generated package is invalid: ${result.error.details}`);
    }
    return archive;
}

function databaseResourceBytes(
    recipe: DatabasePackageRecipeResource,
    artifactBytes: Uint8Array,
): Uint8Array {
    if (recipe.artifactType === 'initial-sql-script') {
        let sql: string;
        try {
            sql = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(artifactBytes);
        }
        catch (_error: unknown) {
            throw new Error('Initial SQL script is not valid UTF-8');
        }
        if (sql.startsWith('\uFEFF')) {
            throw new Error('Initial SQL script must not contain a UTF-8 byte-order mark');
        }
        return new TextEncoder().encode(sqlScriptWithSystemMetadata(
            sql,
            recipe.system,
            recipe.systemMinVersion,
        ));
    }
    else if (recipe.artifactType === 'database-file') {
        return artifactBytes;
    }
    else { const _n: never = recipe.artifactType; return _n; }
}

function createResource(
    recipe: DatabasePackageRecipeResource,
    bytes: number,
    digest: string,
): DatabaseResource {
    const database = {
        artifactType: recipe.artifactType,
        system: recipe.system,
        systemMinVersion: recipe.systemMinVersion,
    };
    if (recipe.artifactType === 'initial-sql-script') {
        return {
            name: recipe.name,
            path: recipe.path,
            format: 'sql',
            mediatype: 'application/sql',
            bytes,
            hash: `sha256:${digest}`,
            'eskuel:database': database,
        };
    }
    else if (recipe.artifactType === 'database-file') {
        return {
            name: recipe.name,
            path: recipe.path,
            format: 'sqlite',
            mediatype: 'application/vnd.sqlite3',
            bytes,
            hash: `sha256:${digest}`,
            'eskuel:database': database,
        };
    }
    else { const _n: never = recipe.artifactType; return _n; }
}

function toDescriptorLicense(license: DatabasePackageRecipeLicense): License {
    return {
        ...(license.name === undefined ? {} : { name: license.name }),
        path: license.path,
        ...(license.title === undefined ? {} : { title: license.title }),
    };
}

function toDescriptorNotice(notice: DatabasePackageRecipeNotice): PackageNotice {
    return {
        path: notice.path,
        ...(notice.title === undefined ? {} : { title: notice.title }),
    };
}

function toDescriptorProvenance(provenance: DatabasePackageRecipeProvenance): PackageProvenance {
    return {
        path: provenance.path,
        mediatype: provenance.mediatype,
    };
}
