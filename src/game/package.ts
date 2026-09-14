import gamePackageSchema from '../../spec/game-package/v1/datapackage.schema.json';

import type { DbData } from '../database/api';
import { readDatabasePackage, validateDatabasePackageInfo } from '../database/package';
import type { DatabasePackageInfo } from '../database/package';
import {
    extractZipEntry,
    inspectZipEntries,
    sha256,
    validateArchiveLayout,
    validateBundledLicenseFiles,
    validateBundledTextFiles,
} from '../package/archive';
import type { ZipEntry } from '../package/archive';
import {
    MAX_PACKAGE_AUXILIARY_FILE_BYTES,
    MAX_PACKAGE_DESCRIPTOR_BYTES,
    MAX_PACKAGE_LICENSE_BYTES,
    requireDistinctPaths,
    validateBundledPackageTexts,
    validateOptionalBundledPackageText,
} from '../package/profile';
import { compileJsonSchema, requireJsonSchema } from '../package/json-schema';
import type {
    BundledPackageLicense,
    BundledPackageNotice,
    BundledPackageProvenance,
    Contributor,
    License,
    PackageNotice,
    PackageProvenance,
    PackageSource,
} from '../package/profile';
import type { Fail, FileSizeTooLargeFail, Success } from '../util';

export const ESKUEL_GAME_PACKAGE_PROFILE = gamePackageSchema.$id;
export const MAX_GAME_PACKAGE_DESCRIPTOR_BYTES = MAX_PACKAGE_DESCRIPTOR_BYTES;
export const MAX_GAME_PACKAGE_LICENSE_BYTES = MAX_PACKAGE_LICENSE_BYTES;
export const MAX_GAME_PACKAGE_AUXILIARY_FILE_BYTES = MAX_PACKAGE_AUXILIARY_FILE_BYTES;

export type ParseGamePackageFail = {
    kind: 'parse-game-package';
    details: string;
};

export type GamePackageData = {
    xml: string;
    dbData: DbData;
};

export type GamePackageDescriptor = {
    $schema: typeof ESKUEL_GAME_PACKAGE_PROFILE;
    name: string;
    title: string;
    version: string;
    contributors: Contributor[];
    licenses: License[];
    notices?: PackageNotice[];
    provenance?: PackageProvenance;
    sources?: PackageSource[];
    resources: [GameXmlResource, DatabaseDependencyResource] | [DatabaseDependencyResource, GameXmlResource];
};

export type GamePackageInfo = {
    descriptor: GamePackageDescriptor;
    licenses: BundledPackageLicense[];
    notices: BundledPackageNotice[];
    provenance?: BundledPackageProvenance;
    database: DatabasePackageInfo;
};

export function validateGamePackageInfo(candidate: unknown): GamePackageInfo {
    if (!isRecord(candidate)) {
        throw new TypeError('Game package information must be an object');
    }
    else {
        const descriptor = validateDescriptor(candidate.descriptor);
        const licenses = validateBundledPackageTexts(
            candidate.licenses,
            descriptor.licenses,
            'Game package licenses',
        );
        const notices = validateBundledPackageTexts(
            candidate.notices,
            descriptor.notices ?? [],
            'Game package notices',
        );
        const provenance = validateOptionalBundledPackageText(
            candidate.provenance,
            descriptor.provenance,
            'Game package provenance',
        );
        return {
            descriptor,
            licenses,
            notices,
            ...(provenance === undefined ? {} : { provenance }),
            database: validateDatabasePackageInfo(candidate.database),
        };
    }
}

export type GamePackageContents = GamePackageData & GamePackageInfo;

type GameXmlResource = ResourceBase & {
    name: 'game';
    format: 'xml';
    mediatype: 'application/xml';
};

type DatabaseDependencyResource = ResourceBase & {
    name: 'database';
    format: 'eskueldb';
    mediatype: 'application/zip';
};

type ResourceBase = {
    name: string;
    path: string;
    bytes: number;
    hash: string;
};

type GamePackageParseResult = Success<GamePackageData>
    | Fail<ParseGamePackageFail | FileSizeTooLargeFail>;

type GamePackageReadResult = Success<GamePackageContents>
    | Fail<ParseGamePackageFail | FileSizeTooLargeFail>;

export type GamePackageLimits = {
    maxGameXmlBytes: number;
    maxDatabasePackageBytes: number;
    maxDatabaseResourceBytes: number;
};

const DESCRIPTOR_PATH = 'datapackage.json';
const FAILURE_KIND = 'parse-game-package';
const validateGamePackageDescriptor = compileJsonSchema(gamePackageSchema);

export async function parseGamePackage(
    archive: Uint8Array,
    limits: GamePackageLimits,
): Promise<GamePackageParseResult> {
    const result = await readGamePackage(archive, limits);
    return result.ok
        ? { ok: true, data: { xml: result.data.xml, dbData: result.data.dbData } }
        : result;
}

export async function readGamePackage(
    archive: Uint8Array,
    limits: GamePackageLimits,
): Promise<GamePackageReadResult> {
    const entriesResult = inspectZipEntries(archive, FAILURE_KIND);
    if (!entriesResult.ok) {
        return entriesResult;
    }
    else {
        const entries = entriesResult.data;
        const regularEntries = entries.filter(entry => !entry.directory);
        const descriptorEntry = regularEntries.find(entry => entry.name === DESCRIPTOR_PATH);
        if (descriptorEntry === undefined) {
            return fail('Archive root does not contain datapackage.json');
        }
        else if (descriptorEntry.uncompressedSize > MAX_GAME_PACKAGE_DESCRIPTOR_BYTES) {
            return { ok: false, error: { kind: 'file-size-too-large' } };
        }

        const descriptorBytesResult = extractZipEntry(archive, descriptorEntry, FAILURE_KIND);
        if (!descriptorBytesResult.ok) {
            return descriptorBytesResult;
        }
        const descriptorResult = parseDescriptor(descriptorBytesResult.data);
        if (!descriptorResult.ok) {
            return descriptorResult;
        }

        const descriptor = descriptorResult.data;
        const notices = descriptor.notices ?? [];
        const provenance = descriptor.provenance;
        const archiveLayoutResult = validateArchiveLayout(
            entries,
            [
                DESCRIPTOR_PATH,
                ...descriptor.resources.map(resource => resource.path),
                ...descriptor.licenses.map(license => license.path),
                ...notices.map(notice => notice.path),
                ...(provenance === undefined ? [] : [provenance.path]),
            ],
            FAILURE_KIND,
        );
        if (!archiveLayoutResult.ok) {
            return archiveLayoutResult;
        }

        const licensesResult = validateBundledLicenseFiles(
            archive,
            regularEntries,
            descriptor.licenses.map(license => license.path),
            MAX_GAME_PACKAGE_LICENSE_BYTES,
            FAILURE_KIND,
        );
        if (!licensesResult.ok) {
            return licensesResult;
        }

        const auxiliaryTextResult = validateBundledTextFiles(
            archive,
            regularEntries,
            [
                ...notices.map(notice => ({ path: notice.path, kind: 'Notice' as const })),
                ...(provenance === undefined
                    ? []
                    : [{ path: provenance.path, kind: 'Provenance' as const }]),
            ],
            MAX_GAME_PACKAGE_AUXILIARY_FILE_BYTES,
            FAILURE_KIND,
        );
        if (!auxiliaryTextResult.ok) {
            return auxiliaryTextResult;
        }

        const gameResource = descriptor.resources.find(
            (resource): resource is GameXmlResource => resource.format === 'xml',
        );
        const databaseResource = descriptor.resources.find(
            (resource): resource is DatabaseDependencyResource => resource.format === 'eskueldb',
        );
        if (gameResource === undefined || databaseResource === undefined) {
            return fail('Package resources do not identify one game XML and one database dependency');
        }

        const gameBytesResult = await readVerifiedResource(
            archive,
            regularEntries,
            gameResource,
            limits.maxGameXmlBytes,
        );
        if (!gameBytesResult.ok) {
            return gameBytesResult;
        }
        const databaseBytesResult = await readVerifiedResource(
            archive,
            regularEntries,
            databaseResource,
            limits.maxDatabasePackageBytes,
        );
        if (!databaseBytesResult.ok) {
            return databaseBytesResult;
        }

        let xml: string;
        try {
            xml = new TextDecoder('utf-8', { fatal: true }).decode(gameBytesResult.data);
        }
        catch (_error: unknown) {
            return fail(`Game resource '${gameResource.path}' is not valid UTF-8`);
        }

        const databaseResult = await readDatabasePackage(
            databaseBytesResult.data,
            limits.maxDatabaseResourceBytes,
        );
        if (!databaseResult.ok) {
            return databaseResult.error.kind === 'file-size-too-large'
                ? { ok: false, error: databaseResult.error }
                : fail(`Database dependency '${databaseResource.path}' is invalid: ${databaseResult.error.details}`);
        }
        return {
            ok: true,
            data: {
                descriptor,
                licenses: descriptor.licenses.map((metadata, index) => ({
                    metadata,
                    text: licensesResult.data[index],
                })),
                notices: notices.map((metadata, index) => ({
                    metadata,
                    text: auxiliaryTextResult.data[index],
                })),
                ...(provenance === undefined
                    ? {}
                    : {
                        provenance: {
                            metadata: provenance,
                            text: auxiliaryTextResult.data[notices.length],
                        },
                    }),
                database: {
                    descriptor: databaseResult.data.descriptor,
                    licenses: databaseResult.data.licenses,
                    notices: databaseResult.data.notices,
                    ...(databaseResult.data.provenance === undefined
                        ? {}
                        : { provenance: databaseResult.data.provenance }),
                },
                xml,
                dbData: databaseResult.data.data,
            },
        };
    }
}

function parseDescriptor(bytes: Uint8Array): Success<GamePackageDescriptor> | Fail<ParseGamePackageFail> {
    let text: string;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch (_error: unknown) {
        return fail('datapackage.json is not valid UTF-8');
    }

    let candidate: unknown;
    try {
        candidate = JSON.parse(text);
    }
    catch (error: unknown) {
        return fail(`datapackage.json is not valid JSON: ${String(error)}`);
    }

    try {
        return { ok: true, data: validateDescriptor(candidate) };
    }
    catch (error: unknown) {
        return fail(error instanceof Error ? error.message : String(error));
    }
}

function validateDescriptor(candidate: unknown): GamePackageDescriptor {
    const descriptor = requireJsonSchema<GamePackageDescriptor>(
        candidate,
        validateGamePackageDescriptor,
        'datapackage.json',
    );
    const gameResource = descriptor.resources.find(
        (resource): resource is GameXmlResource => resource.format === 'xml',
    );
    const databaseResource = descriptor.resources.find(
        (resource): resource is DatabaseDependencyResource => resource.format === 'eskueldb',
    );
    if (gameResource === undefined || databaseResource === undefined) {
        throw new Error('datapackage.json.resources must contain one game XML and one database dependency');
    }
    else if (gameResource.path !== `data/${descriptor.name}.xml`) {
        throw new Error(`datapackage.json.resources game path must be 'data/${descriptor.name}.xml' for this package`);
    }
    else if (databaseResource.path !== 'dependencies/database.eskueldb') {
        throw new Error("datapackage.json.resources database path must be 'dependencies/database.eskueldb'");
    }
    requireDistinctPaths([
        DESCRIPTOR_PATH,
        ...descriptor.resources.map(resource => resource.path),
        ...descriptor.licenses.map(license => license.path),
        ...(descriptor.notices ?? []).map(notice => notice.path),
        ...(descriptor.provenance === undefined ? [] : [descriptor.provenance.path]),
    ], 'datapackage.json file paths');
    return descriptor;
}

async function readVerifiedResource(
    archive: Uint8Array,
    regularEntries: ZipEntry[],
    resource: GameXmlResource | DatabaseDependencyResource,
    maxBytes: number,
): Promise<Success<Uint8Array> | Fail<ParseGamePackageFail | FileSizeTooLargeFail>> {
    const entry = regularEntries.find(candidate => candidate.name === resource.path);
    if (entry === undefined) {
        return fail(`Archive does not contain declared resource '${resource.path}'`);
    }
    else if (entry.uncompressedSize !== resource.bytes) {
        return fail(
            `Resource '${resource.name}' bytes is ${resource.bytes}, but the archive entry has ${entry.uncompressedSize} bytes`,
        );
    }
    else if (resource.bytes > maxBytes) {
        return { ok: false, error: { kind: 'file-size-too-large' } };
    }

    const bytesResult = extractZipEntry(archive, entry, FAILURE_KIND);
    if (!bytesResult.ok) {
        return bytesResult;
    }
    else if (bytesResult.data.byteLength !== resource.bytes) {
        return fail(
            `Resource '${resource.name}' bytes is ${resource.bytes}, but decompression produced ${bytesResult.data.byteLength} bytes`,
        );
    }

    const expectedHash = resource.hash.slice('sha256:'.length);
    const actualHashResult = await sha256(bytesResult.data, FAILURE_KIND);
    if (!actualHashResult.ok) {
        return actualHashResult;
    }
    else if (actualHashResult.data !== expectedHash) {
        return fail(
            `Resource '${resource.name}' SHA-256 hash does not match descriptor: expected ${expectedHash}, got ${actualHashResult.data}`,
        );
    }
    return bytesResult;
}

function fail(details: string): Fail<ParseGamePackageFail> {
    return { ok: false, error: { kind: FAILURE_KIND, details } };
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
    return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}
