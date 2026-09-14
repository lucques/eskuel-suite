import { describe, expect, it } from 'vitest';

import { getGameEditorFilename, getGameFileSourceType } from './source';

describe('game file sources', () => {
    it('recognizes XML and Eskuel game packages case-insensitively', () => {
        expect(getGameFileSourceType('game.xml')).toBe('xml');
        expect(getGameFileSourceType('game.ESKUELGAME')).toBe('eskuel-game-package');
        expect(getGameFileSourceType('game.sql')).toBeUndefined();
    });

    it('changes a package filename to XML for editor saving', () => {
        expect(getGameEditorFilename('pokemon-adventure.eskuelgame', {
            type: 'eskuel-game-package',
            source: { type: 'inline', content: new Uint8Array() },
        })).toBe('pokemon-adventure.xml');
    });

    it('preserves a standalone XML filename for editor saving', () => {
        expect(getGameEditorFilename('pokemon-adventure.xml', {
            type: 'xml',
            source: { type: 'inline', content: '<game />' },
        })).toBe('pokemon-adventure.xml');
    });
});
