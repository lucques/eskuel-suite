import { describe, expect, it } from 'vitest';

import { createGameUrlSource } from './url-source';

describe('game URL sources', () => {
    it('creates an XML source from an XML URL', () => {
        expect(createGameUrlSource('/games/example.xml')).toEqual({
            filename: 'example.xml',
            type: 'xml',
            source: { type: 'fetch', url: '/games/example.xml' },
        });
    });

    it('creates a binary package source from an Eskuel game URL', () => {
        expect(createGameUrlSource('/games/example.eskuelgame?version=1')).toEqual({
            filename: 'example.eskuelgame',
            type: 'eskuel-game-package',
            source: { type: 'fetch', url: '/games/example.eskuelgame?version=1' },
        });
    });

    it('rejects unsupported extensions', () => {
        expect(() => createGameUrlSource('/games/example.zip')).toThrowError(/Unsupported game filename extension/);
    });
});
