import { unzipSync } from 'fflate';

import type { Fail, FileSizeTooLargeFail, Success } from '../util';

export type PackageParseFail<K extends string> = {
    kind: K;
    details: string;
};

export type ZipEntry = {
    name: string;
    compressedSize: number;
    uncompressedSize: number;
    compression: 0 | 8;
    directory: boolean;
};

const MAX_ZIP_ENTRIES = 32;
const MAX_ZIP_ENTRY_NAME_BYTES = 1024;

export function inspectZipEntries<K extends string>(
    archive: Uint8Array,
    failureKind: K,
): Success<ZipEntry[]> | Fail<PackageParseFail<K>> {
    const endOffset = findEndOfCentralDirectory(archive);
    if (endOffset === null) {
        return fail(failureKind, 'File is not a supported ZIP archive');
    }

    const diskNumber = readUint16(archive, endOffset + 4);
    const centralDirectoryDisk = readUint16(archive, endOffset + 6);
    const entriesOnDisk = readUint16(archive, endOffset + 8);
    const entryCount = readUint16(archive, endOffset + 10);
    const centralDirectorySize = readUint32(archive, endOffset + 12);
    const centralDirectoryOffset = readUint32(archive, endOffset + 16);
    const commentLength = readUint16(archive, endOffset + 20);
    if (diskNumber === null || centralDirectoryDisk === null || entriesOnDisk === null || entryCount === null
        || centralDirectorySize === null || centralDirectoryOffset === null || commentLength === null) {
        return fail(failureKind, 'ZIP end-of-central-directory record is truncated');
    }
    else if (endOffset + 22 + commentLength !== archive.byteLength) {
        return fail(failureKind, 'ZIP archive has an invalid trailing record');
    }
    else if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
        return fail(failureKind, 'Split ZIP archives are not supported');
    }
    else if (entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
        return fail(failureKind, 'ZIP64 archives are not supported');
    }
    else if (entryCount > MAX_ZIP_ENTRIES) {
        return fail(failureKind, `ZIP archive contains more than ${MAX_ZIP_ENTRIES} entries`);
    }
    else if (centralDirectoryOffset + centralDirectorySize !== endOffset) {
        return fail(failureKind, 'ZIP central directory has an invalid location');
    }

    const entries: ZipEntry[] = [];
    const names = new Set<string>();
    const foldedNames = new Set<string>();
    const ranges: Array<{ start: number, end: number }> = [];
    let cursor = centralDirectoryOffset;
    for (let index = 0; index < entryCount; index++) {
        if (readUint32(archive, cursor) !== 0x02014b50) {
            return fail(failureKind, `ZIP central-directory entry ${index + 1} is invalid`);
        }
        const versionMadeBy = readUint16(archive, cursor + 4);
        const flags = readUint16(archive, cursor + 8);
        const compression = readUint16(archive, cursor + 10);
        const compressedSize = readUint32(archive, cursor + 20);
        const uncompressedSize = readUint32(archive, cursor + 24);
        const nameLength = readUint16(archive, cursor + 28);
        const extraLength = readUint16(archive, cursor + 30);
        const entryCommentLength = readUint16(archive, cursor + 32);
        const diskStart = readUint16(archive, cursor + 34);
        const externalAttributes = readUint32(archive, cursor + 38);
        const localHeaderOffset = readUint32(archive, cursor + 42);
        if (versionMadeBy === null || flags === null || compression === null || compressedSize === null
            || uncompressedSize === null || nameLength === null || extraLength === null || entryCommentLength === null
            || diskStart === null || externalAttributes === null || localHeaderOffset === null) {
            return fail(failureKind, `ZIP central-directory entry ${index + 1} is truncated`);
        }
        else if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
            return fail(failureKind, 'ZIP64 entries are not supported');
        }
        else if (diskStart !== 0) {
            return fail(failureKind, 'Split ZIP archives are not supported');
        }
        else if ((flags & 0x2041) !== 0) {
            return fail(failureKind, 'Encrypted ZIP entries are not supported');
        }
        else if (compression !== 0 && compression !== 8) {
            return fail(failureKind, `ZIP compression method ${compression} is not supported`);
        }
        else if (nameLength === 0 || nameLength > MAX_ZIP_ENTRY_NAME_BYTES) {
            return fail(failureKind, `ZIP entry ${index + 1} has an invalid name length`);
        }

        const nameStart = cursor + 46;
        const nextCursor = nameStart + nameLength + extraLength + entryCommentLength;
        if (nextCursor > centralDirectoryOffset + centralDirectorySize) {
            return fail(failureKind, `ZIP central-directory entry ${index + 1} is truncated`);
        }
        const nameResult = decodeZipEntryName(
            archive.subarray(nameStart, nameStart + nameLength),
            flags,
            failureKind,
        );
        if (!nameResult.ok) {
            return nameResult;
        }
        const name = nameResult.data;
        const directory = name.endsWith('/');
        const pathResult = validateArchiveEntryName(name, directory, failureKind);
        if (!pathResult.ok) {
            return pathResult;
        }
        else if (names.has(name) || foldedNames.has(name.toLocaleLowerCase('en-US'))) {
            return fail(failureKind, `ZIP archive contains a duplicate entry name: ${name}`);
        }
        names.add(name);
        foldedNames.add(name.toLocaleLowerCase('en-US'));

        const hostSystem = versionMadeBy >>> 8;
        const unixFileType = (externalAttributes >>> 16) & 0xf000;
        if (hostSystem === 3 && unixFileType === 0xa000) {
            return fail(failureKind, `ZIP archive contains a symbolic link: ${name}`);
        }
        else if (hostSystem === 3 && unixFileType !== 0 && unixFileType !== 0x4000 && unixFileType !== 0x8000) {
            return fail(failureKind, `ZIP archive entry is not a regular file or directory: ${name}`);
        }
        else if (directory && (compressedSize !== 0 || uncompressedSize !== 0)) {
            return fail(failureKind, `ZIP directory entry is not empty: ${name}`);
        }

        const localResult = inspectLocalFileRecord(
            archive,
            localHeaderOffset,
            name,
            flags,
            compression,
            compressedSize,
            centralDirectoryOffset,
            failureKind,
        );
        if (!localResult.ok) {
            return localResult;
        }
        ranges.push(localResult.data);
        entries.push({
            name,
            compressedSize,
            uncompressedSize,
            compression,
            directory,
        });
        cursor = nextCursor;
    }

    if (cursor !== centralDirectoryOffset + centralDirectorySize) {
        return fail(failureKind, 'ZIP central directory contains unexpected data');
    }
    ranges.sort((left, right) => left.start - right.start);
    for (let index = 1; index < ranges.length; index++) {
        if (ranges[index].start < ranges[index - 1].end) {
            return fail(failureKind, 'ZIP file entries overlap');
        }
    }
    return { ok: true, data: entries };
}

export function validateArchiveLayout<K extends string>(
    entries: ZipEntry[],
    filePaths: string[],
    failureKind: K,
): Success<void> | Fail<PackageParseFail<K>> {
    const allowedNames = new Set(filePaths);
    for (const filePath of filePaths) {
        const segments = filePath.split('/');
        for (let index = 1; index < segments.length; index++) {
            allowedNames.add(`${segments.slice(0, index).join('/')}/`);
        }
    }
    const unexpected = entries.find(entry => !allowedNames.has(entry.name));
    return unexpected === undefined
        ? { ok: true, data: undefined }
        : fail(failureKind, `Archive contains undeclared entry '${unexpected.name}'`);
}

export function validateBundledLicenseFiles<K extends string>(
    archive: Uint8Array,
    regularEntries: ZipEntry[],
    licensePaths: string[],
    maxLicenseBytes: number,
    failureKind: K,
): Success<string[]> | Fail<PackageParseFail<K> | FileSizeTooLargeFail> {
    return validateBundledTextFiles(
        archive,
        regularEntries,
        licensePaths.map(path => ({ path, kind: 'License' })),
        maxLicenseBytes,
        failureKind,
    );
}

export function validateBundledTextFiles<K extends string>(
    archive: Uint8Array,
    regularEntries: ZipEntry[],
    files: { path: string; kind: 'License' | 'Notice' | 'Provenance' }[],
    maxFileBytes: number,
    failureKind: K,
): Success<string[]> | Fail<PackageParseFail<K> | FileSizeTooLargeFail> {
    const contents: string[] = [];
    for (const file of files) {
        const { path, kind } = file;
        const entry = regularEntries.find(candidate => candidate.name === path);
        if (entry === undefined) {
            return fail(failureKind, `Archive does not contain declared ${kind.toLowerCase()} file '${path}'`);
        }
        else if (entry.uncompressedSize > maxFileBytes) {
            return { ok: false, error: { kind: 'file-size-too-large' } };
        }

        const bytesResult = extractZipEntry(archive, entry, failureKind);
        if (!bytesResult.ok) {
            return bytesResult;
        }
        else if (bytesResult.data.byteLength !== entry.uncompressedSize) {
            return fail(
                failureKind,
                `${kind} file '${path}' has ${entry.uncompressedSize} declared bytes, but decompression produced ${bytesResult.data.byteLength} bytes`,
            );
        }

        let content: string;
        try {
            content = new TextDecoder('utf-8', { fatal: true }).decode(bytesResult.data);
        }
        catch (_error: unknown) {
            return fail(failureKind, `${kind} file '${path}' is not valid UTF-8`);
        }
        if (content.trim() === '') {
            return fail(failureKind, `${kind} file '${path}' must not be empty`);
        }
        else if (content.includes('\0')) {
            return fail(failureKind, `${kind} file '${path}' must be plain text`);
        }
        else {
            contents.push(content);
        }
    }
    return { ok: true, data: contents };
}

export function extractZipEntry<K extends string>(
    archive: Uint8Array,
    entry: ZipEntry,
    failureKind: K,
): Success<Uint8Array> | Fail<PackageParseFail<K>> {
    try {
        const extracted = unzipSync(archive, {
            filter: candidate => candidate.name === entry.name,
        });
        const data = extracted[entry.name];
        if (data === undefined || Object.keys(extracted).length !== 1) {
            return fail(failureKind, `Could not extract ZIP entry '${entry.name}'`);
        }
        else if (data.byteLength > entry.uncompressedSize) {
            return fail(failureKind, `ZIP entry '${entry.name}' expands beyond its declared size`);
        }
        return { ok: true, data };
    }
    catch (error: unknown) {
        return fail(failureKind, `Could not decompress ZIP entry '${entry.name}': ${String(error)}`);
    }
}

export async function sha256<K extends string>(
    bytes: Uint8Array,
    failureKind: K,
): Promise<Success<string> | Fail<PackageParseFail<K>>> {
    if (globalThis.crypto?.subtle === undefined) {
        return fail(failureKind, 'SHA-256 verification is unavailable in this environment');
    }
    try {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
        return {
            ok: true,
            data: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
        };
    }
    catch (error: unknown) {
        return fail(failureKind, `Could not calculate resource SHA-256 hash: ${String(error)}`);
    }
}

export function validateRelativeArchivePath(path: string, context: string, directory: boolean): void {
    if (path === '' || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes('\\') || path.includes('\0')) {
        throw new Error(`${context} must be a relative POSIX path`);
    }
    const segments = path.split('/');
    if (segments.some(segment => segment === '' || segment === '.' || segment === '..' || segment.startsWith('.'))) {
        throw new Error(`${context} contains an unsafe or hidden path segment`);
    }
    if (!directory && path.endsWith('/')) {
        throw new Error(`${context} must name a file`);
    }
}

function inspectLocalFileRecord<K extends string>(
    archive: Uint8Array,
    offset: number,
    centralName: string,
    centralFlags: number,
    centralCompression: number,
    compressedSize: number,
    centralDirectoryOffset: number,
    failureKind: K,
): Success<{ start: number, end: number }> | Fail<PackageParseFail<K>> {
    if (readUint32(archive, offset) !== 0x04034b50) {
        return fail(failureKind, `ZIP entry '${centralName}' has an invalid local header`);
    }
    const flags = readUint16(archive, offset + 6);
    const compression = readUint16(archive, offset + 8);
    const nameLength = readUint16(archive, offset + 26);
    const extraLength = readUint16(archive, offset + 28);
    if (flags === null || compression === null || nameLength === null || extraLength === null) {
        return fail(failureKind, `ZIP entry '${centralName}' has a truncated local header`);
    }
    else if (flags !== centralFlags || compression !== centralCompression) {
        return fail(failureKind, `ZIP entry '${centralName}' has inconsistent local metadata`);
    }

    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralDirectoryOffset) {
        return fail(failureKind, `ZIP entry '${centralName}' has invalid data bounds`);
    }
    const localNameResult = decodeZipEntryName(
        archive.subarray(nameStart, nameStart + nameLength),
        flags,
        failureKind,
    );
    if (!localNameResult.ok) {
        return localNameResult;
    }
    else if (localNameResult.data !== centralName) {
        return fail(failureKind, `ZIP entry '${centralName}' has a different local name`);
    }
    return { ok: true, data: { start: offset, end: dataEnd } };
}

function findEndOfCentralDirectory(archive: Uint8Array): number | null {
    const minimumOffset = Math.max(0, archive.byteLength - 22 - 0xffff);
    for (let offset = archive.byteLength - 22; offset >= minimumOffset; offset--) {
        if (readUint32(archive, offset) === 0x06054b50) {
            const commentLength = readUint16(archive, offset + 20);
            if (commentLength !== null && offset + 22 + commentLength === archive.byteLength) {
                return offset;
            }
        }
    }
    return null;
}

function decodeZipEntryName<K extends string>(
    bytes: Uint8Array,
    flags: number,
    failureKind: K,
): Success<string> | Fail<PackageParseFail<K>> {
    const isUtf8 = (flags & 0x0800) !== 0;
    if (!isUtf8 && bytes.some(byte => byte > 0x7f)) {
        return fail(failureKind, 'Non-ASCII ZIP entry names must be marked as UTF-8');
    }
    try {
        return { ok: true, data: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
    }
    catch (_error: unknown) {
        return fail(failureKind, 'ZIP archive contains an invalid UTF-8 entry name');
    }
}

function validateArchiveEntryName<K extends string>(
    name: string,
    directory: boolean,
    failureKind: K,
): Success<void> | Fail<PackageParseFail<K>> {
    const path = directory ? name.slice(0, -1) : name;
    try {
        validateRelativeArchivePath(path, `ZIP entry '${name}'`, directory);
        return { ok: true, data: undefined };
    }
    catch (error: unknown) {
        return fail(failureKind, error instanceof Error ? error.message : String(error));
    }
}

function readUint16(bytes: Uint8Array, offset: number): number | null {
    return offset >= 0 && offset + 2 <= bytes.byteLength
        ? bytes[offset] | (bytes[offset + 1] << 8)
        : null;
}

function readUint32(bytes: Uint8Array, offset: number): number | null {
    return offset >= 0 && offset + 4 <= bytes.byteLength
        ? (bytes[offset]
            | (bytes[offset + 1] << 8)
            | (bytes[offset + 2] << 16)
            | (bytes[offset + 3] << 24)) >>> 0
        : null;
}

function fail<K extends string>(failureKind: K, details: string): Fail<PackageParseFail<K>> {
    return { ok: false, error: { kind: failureKind, details } };
}
