import { DockviewTheme, themeLight } from "dockview-core";

// Generic Success/Fail for return types
export type Success<T> = { ok: true,  data: T }
export type Fail<E>    = { ok: false, error: E }

// Type guard to check if a result is a Success/Fail
export function isSuccess<T,A>(result: Success<T> | Fail<A>): result is Success<T> {
    return result.ok;
}
export function isFail<E,A>(result: Success<A> | Fail<E>): result is Fail<E> {
    return !result.ok;
}

// Standard assert
export function assert(condition: boolean, message?: string): asserts condition {
    if (!condition) {
        throw new Error(`Assertion failed: ${message ?? ''}`);
    }
}

export function unknownErrorToString(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'details' in error && typeof error.details === 'string') {
        return error.details;
    }
    else {
        return String(error);
    }
}

// Reorder a list
export function reorder<T,>(list: T[], startIndex: number, endIndex: number): T[] {
    const result: T[] = Array.from(list);
    const [removed]: T[] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
  
    return result;
};

// Generate unique ids
let nextId = 0;
export function generateId(): number {
    return nextId++;
}


////////////
// Source //
////////////

export type Source<T> =
  | { type: 'fetch';  url: string; }
  | { type: 'inline'; content: T };
export type WithFilename<T> = T & { filename: string };

export type FetchFail            = { kind: 'fetch', url: string }
export type FileSizeTooLargeFail = { kind: 'file-size-too-large' }

export async function materializeTextSource(
    source: Source<string>,
    maxBytes: number = Number.MAX_SAFE_INTEGER,
    signal?: AbortSignal,
): Promise<Success<string> | Fail<FetchFail | FileSizeTooLargeFail>> {
    if (source.type === 'fetch') {
        const result = await fetchBytes(source.url, maxBytes, signal);
        return result.ok
            ? { ok: true, data: new TextDecoder().decode(result.data) }
            : result;
    }
    else {
        return utf8ByteLength(source.content) <= maxBytes
            ? { ok: true, data: source.content }
            : { ok: false, error: { kind: 'file-size-too-large' } };
    }
}

export function materializeBinarySource(
    source: Source<Uint8Array>,
    maxBytes: number = Number.MAX_SAFE_INTEGER,
    signal?: AbortSignal,
): Promise<Success<Uint8Array> | Fail<FetchFail | FileSizeTooLargeFail>> {
    if (source.type === 'fetch') {
        return fetchBytes(source.url, maxBytes, signal);
    }
    else {
        return Promise.resolve(source.content.byteLength <= maxBytes
            ? { ok: true, data: source.content }
            : { ok: false, error: { kind: 'file-size-too-large' } });
    }
}

async function fetchBytes(
    url: string,
    maxBytes: number,
    signal?: AbortSignal,
): Promise<Success<Uint8Array> | Fail<FetchFail | FileSizeTooLargeFail>> {
    try {
        const response = await fetch(url, { signal });
        if (!response.ok) {
            return { ok: false, error: { kind: 'fetch', url } };
        }

        const contentLengthHeader = response.headers.get('content-length');
        const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
        if (contentLength !== null && Number.isFinite(contentLength) && contentLength > maxBytes) {
            await response.body?.cancel();
            return { ok: false, error: { kind: 'file-size-too-large' } };
        }

        if (response.body === null) {
            const data = new Uint8Array(await response.arrayBuffer());
            return data.byteLength <= maxBytes
                ? { ok: true, data }
                : { ok: false, error: { kind: 'file-size-too-large' } };
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) {
                break;
            }

            totalBytes += chunk.value.byteLength;
            if (totalBytes > maxBytes) {
                await reader.cancel();
                return { ok: false, error: { kind: 'file-size-too-large' } };
            }
            chunks.push(chunk.value);
        }

        const data = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return { ok: true, data };
    }
    catch (_error: unknown) {
        return { ok: false, error: { kind: 'fetch', url } };
    }
}

function utf8ByteLength(value: string): number {
    let bytes = 0;
    for (const character of value) {
        const codePoint = character.codePointAt(0);
        assert(codePoint !== undefined);
        bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    }
    return bytes;
}

export function getFilename(path: string): string {
    const pathWithoutQueryOrFragment = path.split(/[?#]/, 1)[0];
    return pathWithoutQueryOrFragment.split('/').reverse()[0];
}

// Return `null` if filename has no extension
export function getFilenameExtension(path: string): string | null {
    const filename = getFilename(path);
    const tokens = filename.split('.');
    return tokens.length > 1 ? tokens[tokens.length - 1] : null;
}


//////////////////////////////
// Base64 encoding/decoding //
//////////////////////////////

type Uint8ArrayWithOptionalBase64 = Uint8Array & {
    toBase64?: () => string;
};

const BASE64_CHUNK_BYTES = 3 * 4096;

export function encodeToBase64(uint8Array: Uint8Array): string {
    const bytes = uint8Array as Uint8ArrayWithOptionalBase64;

    if (typeof bytes.toBase64 === 'function') {
        return bytes.toBase64();
    }
    else {
        let encoded = '';
        for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
            const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_BYTES);
            encoded += btoa(String.fromCharCode(...chunk));
        }
        return encoded;
    }
}

export function decodeFromBase64(base64String: string): Uint8Array {
    // Decode the Base64 string to a binary string
    const binaryString = atob(base64String);
    
    // Convert the binary string to a Uint8Array
    const uint8Array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
    }
    
    return uint8Array;
}


////////////
// Images //
////////////

export type ImageSource = Source<Uint8Array>

export type ImageFileInvalidFail = { kind: 'image-file-invalid' }
export type UserImageFail = FetchFail | FileSizeTooLargeFail | ImageFileInvalidFail
