import { describe, expect, it, vi } from 'vitest';

import { decodeFromBase64, encodeToBase64, getFilename, materializeBinarySource, materializeTextSource } from './util';

describe('filenames', () => {
    it('keeps the extension when extracting a filename', () => {
        expect(getFilename('../games/sql-jungle.xml')).toBe('sql-jungle.xml');
    });

    it('excludes URL query parameters and fragments from the filename', () => {
        expect(getFilename('https://example.com/game.xml?edition=2#scene')).toBe('game.xml');
    });
});

describe('source size limits', () => {
    it('measures inline text as UTF-8 bytes', async () => {
        const withinLimit = await materializeTextSource({ type: 'inline', content: '€' }, 3);
        const overLimit = await materializeTextSource({ type: 'inline', content: '€' }, 2);

        expect(withinLimit).toEqual({ ok: true, data: '€' });
        expect(overLimit).toEqual({ ok: false, error: { kind: 'file-size-too-large' } });
    });

    it('rejects inline binary data before it is passed to a consumer', async () => {
        const result = await materializeBinarySource({ type: 'inline', content: new Uint8Array(3) }, 2);

        expect(result).toEqual({ ok: false, error: { kind: 'file-size-too-large' } });
    });

    it('stops fetched data at the configured byte limit', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3])),
        );

        const result = await materializeBinarySource({ type: 'fetch', url: '/large.db' }, 2);

        expect(result).toEqual({ ok: false, error: { kind: 'file-size-too-large' } });
        fetchMock.mockRestore();
    });
});

describe('base64 encoding', () => {
    it.each([
        { bytes: [], expected: '' },
        { bytes: [0], expected: 'AA==' },
        { bytes: [0, 255], expected: 'AP8=' },
        { bytes: [0, 127, 128, 255], expected: 'AH+A/w==' },
    ])('encodes $bytes', ({ bytes, expected }) => {
        expect(encodeToBase64(new Uint8Array(bytes))).toBe(expected);
    });

    it.each([
        3 * 4096 - 1,
        3 * 4096,
        3 * 4096 + 1,
    ])('preserves data across the chunk boundary at length %i', length => {
        const bytes = new Uint8Array(length);
        for (let index = 0; index < bytes.length; index++) {
            bytes[index] = index % 256;
        }

        expect(decodeFromBase64(encodeToBase64(bytes))).toEqual(bytes);
    });

    it('uses native Uint8Array encoding when available', () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const toBase64 = vi.fn(() => 'native-base64');
        Object.defineProperty(bytes, 'toBase64', { value: toBase64 });

        expect(encodeToBase64(bytes)).toBe('native-base64');
        expect(toBase64).toHaveBeenCalledOnce();
    });
});
