import type { Fail, Success } from './util';

const sqliteHeader = new TextEncoder().encode('SQLite format 3\0');

export function detectSourceContentType(bytes: Uint8Array): 'zip' | 'sqlite' | 'text' {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b
        && ((bytes[2] === 0x03 && bytes[3] === 0x04)
            || (bytes[2] === 0x05 && bytes[3] === 0x06)
            || (bytes[2] === 0x07 && bytes[3] === 0x08))) {
        return 'zip';
    }
    else if (sqliteHeader.every((byte, index) => bytes[index] === byte)) {
        return 'sqlite';
    }
    else {
        return 'text';
    }
}

export function decodeSourceText(bytes: Uint8Array): Success<string> | Fail<string> {
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return text.includes('\0')
            ? { ok: false, error: 'The file contains NUL bytes and is not supported text.' }
            : { ok: true, data: text };
    }
    catch {
        return { ok: false, error: 'The file is not valid UTF-8 text.' };
    }
}
