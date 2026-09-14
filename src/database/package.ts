import databasePackageSchema from '../../spec/database-package/v1/datapackage.schema.json';

import type { DbData } from './api';
import { parseSqlScriptMetadata } from './system';
import type { DatabaseSystem } from './system';
import {
    extractZipEntry,
    inspectZipEntries,
    sha256,
    validateArchiveLayout,
    validateBundledLicenseFiles,
    validateBundledTextFiles,
} from '../package/archive';
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

export type { PackageNotice, PackageProvenance } from '../package/profile';

export const ESKUEL_DATABASE_PACKAGE_PROFILE = databasePackageSchema.$id;
export const MAX_DATABASE_PACKAGE_DESCRIPTOR_BYTES = MAX_PACKAGE_DESCRIPTOR_BYTES;
export const MAX_DATABASE_PACKAGE_LICENSE_BYTES = MAX_PACKAGE_LICENSE_BYTES;
export const MAX_DATABASE_PACKAGE_AUXILIARY_FILE_BYTES = MAX_PACKAGE_AUXILIARY_FILE_BYTES;

export type ParseDatabasePackageFail = {
    kind: 'parse-database-package';
    details: string;
};

export type DatabaseArtifactType = 'initial-sql-script' | 'database-file';

export type DatabasePackageDescriptor = {
    $schema: typeof ESKUEL_DATABASE_PACKAGE_PROFILE;
    name: string;
    title: string;
    version: string;
    contributors: Contributor[];
    licenses: License[];
    notices?: PackageNotice[];
    provenance?: PackageProvenance;
    sources?: PackageSource[];
    resources: [DatabaseResource];
};

export type DatabaseResource = {
    name: string;
    path: string;
    format: 'sql' | 'sqlite';
    mediatype: 'application/sql' | 'application/vnd.sqlite3';
    bytes: number;
    hash: string;
    'eskuel:database': {
        artifactType: DatabaseArtifactType;
        system: DatabaseSystem;
        systemMinVersion: string;
    };
};

export type DatabasePackageContents = DatabasePackageInfo & {
    data: DbData;
};

export type DatabasePackageInfo = {
    descriptor: DatabasePackageDescriptor;
    licenses: DatabasePackageLicense[];
    notices: DatabasePackageNotice[];
    provenance?: DatabasePackageProvenance;
};

export type DatabasePackageLicense = BundledPackageLicense;

export type DatabasePackageNotice = BundledPackageNotice;

export type DatabasePackageProvenance = BundledPackageProvenance;

export function validateDatabasePackageInfo(candidate: unknown): DatabasePackageInfo {
    if (!isRecord(candidate)) {
        throw new TypeError('Database package information must be an object');
    }
    else {
        const descriptor = validateDescriptor(candidate.descriptor);
        const licenses = validateBundledPackageTexts(
            candidate.licenses,
            descriptor.licenses,
            'Database package licenses',
        );
        const notices = validateBundledPackageTexts(
            candidate.notices,
            descriptor.notices ?? [],
            'Database package notices',
        );
        const provenance = validateOptionalBundledPackageText(
            candidate.provenance,
            descriptor.provenance,
            'Database package provenance',
        );
        return {
            descriptor,
            licenses,
            notices,
            ...(provenance === undefined ? {} : { provenance }),
        };
    }
}

type PackageParseResult = Success<DbData> | Fail<ParseDatabasePackageFail | FileSizeTooLargeFail>;
type PackageReadResult = Success<DatabasePackageContents> | Fail<ParseDatabasePackageFail | FileSizeTooLargeFail>;

const DESCRIPTOR_PATH = 'datapackage.json';
const FAILURE_KIND = 'parse-database-package';
const SQLITE_HEADER = new TextEncoder().encode('SQLite format 3\0');
const validateDatabasePackageDescriptor = compileJsonSchema(databasePackageSchema);

export async function parseDatabasePackage(
    archive: Uint8Array,
    maxResourceBytes: number,
): Promise<PackageParseResult> {
    const result = await readDatabasePackage(archive, maxResourceBytes);
    return result.ok
        ? { ok: true, data: result.data.data }
        : result;
}

export async function readDatabasePackage(
    archive: Uint8Array,
    maxResourceBytes: number,
): Promise<PackageReadResult> {
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
        else if (descriptorEntry.uncompressedSize > MAX_DATABASE_PACKAGE_DESCRIPTOR_BYTES) {
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

        const resource = descriptorResult.data.resources[0];
        const licenses = descriptorResult.data.licenses;
        const notices = descriptorResult.data.notices ?? [];
        const provenance = descriptorResult.data.provenance;
        const packageFilePaths = [
            ...notices.map(notice => notice.path),
            ...(provenance === undefined ? [] : [provenance.path]),
        ];
        const archiveLayoutResult = validateArchiveLayout(
            entries,
            [DESCRIPTOR_PATH, resource.path, ...licenses.map(license => license.path), ...packageFilePaths],
            FAILURE_KIND,
        );
        if (!archiveLayoutResult.ok) {
            return archiveLayoutResult;
        }

        const licensesResult = validateBundledLicenseFiles(
            archive,
            regularEntries,
            licenses.map(license => license.path),
            MAX_DATABASE_PACKAGE_LICENSE_BYTES,
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
            MAX_DATABASE_PACKAGE_AUXILIARY_FILE_BYTES,
            FAILURE_KIND,
        );
        if (!auxiliaryTextResult.ok) {
            return auxiliaryTextResult;
        }

        const resourceEntry = regularEntries.find(entry => entry.name === resource.path);
        if (resourceEntry === undefined) {
            return fail(`Archive does not contain declared resource '${resource.path}'`);
        }
        else if (resourceEntry.uncompressedSize !== resource.bytes) {
            return fail(
                `Resource bytes is ${resource.bytes}, but the archive entry has ${resourceEntry.uncompressedSize} bytes`,
            );
        }
        else if (resource.bytes > maxResourceBytes) {
            return { ok: false, error: { kind: 'file-size-too-large' } };
        }

        const resourceBytesResult = extractZipEntry(archive, resourceEntry, FAILURE_KIND);
        if (!resourceBytesResult.ok) {
            return resourceBytesResult;
        }
        else if (resourceBytesResult.data.byteLength !== resource.bytes) {
            return fail(
                `Resource bytes is ${resource.bytes}, but decompression produced ${resourceBytesResult.data.byteLength} bytes`,
            );
        }

        const expectedHash = resource.hash.slice('sha256:'.length);
        const actualHashResult = await sha256(resourceBytesResult.data, FAILURE_KIND);
        if (!actualHashResult.ok) {
            return actualHashResult;
        }
        else if (actualHashResult.data !== expectedHash) {
            return fail(`Resource SHA-256 hash does not match descriptor: expected ${expectedHash}, got ${actualHashResult.data}`);
        }

        const dataResult = databaseDataFromResource(resource, resourceBytesResult.data);
        return dataResult.ok
            ? {
                ok: true,
                data: {
                    descriptor: descriptorResult.data,
                    licenses: licenses.map((metadata, index) => ({
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
                    data: dataResult.data,
                },
            }
            : dataResult;
    }
}

function parseDescriptor(bytes: Uint8Array): Success<DatabasePackageDescriptor> | Fail<ParseDatabasePackageFail> {
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

function validateDescriptor(candidate: unknown): DatabasePackageDescriptor {
    const descriptor = requireJsonSchema<DatabasePackageDescriptor>(
        candidate,
        validateDatabasePackageDescriptor,
        'datapackage.json',
    );
    const declaredPaths = [
        DESCRIPTOR_PATH,
        descriptor.resources[0].path,
        ...descriptor.licenses.map(license => license.path),
        ...(descriptor.notices ?? []).map(notice => notice.path),
        ...(descriptor.provenance === undefined ? [] : [descriptor.provenance.path]),
    ];
    requireDistinctPaths(declaredPaths, 'datapackage.json file paths');
    return descriptor;
}

function databaseDataFromResource(
    resource: DatabaseResource,
    bytes: Uint8Array,
): Success<DbData> | Fail<ParseDatabasePackageFail> {
    const metadata = resource['eskuel:database'];
    if (metadata.artifactType === 'initial-sql-script') {
        let sql: string;
        try {
            sql = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        }
        catch (_error: unknown) {
            return fail('Initial SQL script resource is not valid UTF-8');
        }
        if (sql.startsWith('\uFEFF')) {
            return fail('Initial SQL script resource must not contain a UTF-8 byte-order mark');
        }
        const sqlMetadata = parseSqlScriptMetadata(sql);
        if (!sqlMetadata.ok) {
            return fail(`Initial SQL script metadata is invalid: ${sqlMetadata.error.details}`);
        }
        else if (sqlMetadata.data.hasExplicitMetadata && sqlMetadata.data.system !== metadata.system) {
            return fail(
                `Initial SQL script declares ${sqlMetadata.data.system}, but the package declares ${metadata.system}`,
            );
        }
        else if (sqlMetadata.data.hasExplicitMetadata
            && sqlMetadata.data.systemMinVersion !== metadata.systemMinVersion) {
            return fail(
                `Initial SQL script declares systemMinVersion ${sqlMetadata.data.systemMinVersion}, `
                + `but the package declares ${metadata.systemMinVersion}`,
            );
        }
        return {
            ok: true,
            data: {
                type: 'initial-sql-script',
                system: metadata.system,
                sql,
                systemMinVersion: metadata.systemMinVersion,
            },
        };
    }
    else if (metadata.artifactType === 'database-file') {
        if (bytes.byteLength < SQLITE_HEADER.byteLength
            || !SQLITE_HEADER.every((value, index) => bytes[index] === value)) {
            return fail('Database resource does not have a SQLite 3 file header');
        }
        return {
            ok: true,
            data: {
                type: 'sqlite-db',
                system: 'sqlite',
                data: bytes,
                systemMinVersion: metadata.systemMinVersion,
            },
        };
    }
    else { const _n: never = metadata.artifactType; return _n; }
}

function fail(details: string): Fail<ParseDatabasePackageFail> {
    return { ok: false, error: { kind: FAILURE_KIND, details } };
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
    return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}
