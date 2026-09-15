import { describe, expect, it } from 'vitest';

import { getGameEditorFilename, getGameFileSourceType } from './source';

describe('game file sources', () => {
    it('recognizes XML and Eskuel game packages case-insensitively', () => {
        expect(getGameFileSourceType('game.xml')).toBe('xml');
        expect(getGameFileSourceType('game.ESKUELGAME')).toBe('eskuel-game-package');
        expect(getGameFileSourceType('game.sql')).toBeUndefined();
    });

    it('changes an imported package filename to XML for editor saving', () => {
        expect(getGameEditorFilename('pokemon-adventure.eskuelgame', true)).toBe('pokemon-adventure.xml');
        expect(getGameEditorFilename('download', true)).toBe('download.xml');
        expect(getGameEditorFilename('download.txt', true)).toBe('download.txt.xml');
        expect(getGameEditorFilename('game.xml', true)).toBe('game.xml');
    });

    it('preserves standalone XML filenames independently of their extensions', () => {
        expect(getGameEditorFilename('game.xml', false)).toBe('game.xml');
        expect(getGameEditorFilename('game.txt', false)).toBe('game.txt');
        expect(getGameEditorFilename('game.eskuelgame', false)).toBe('game.eskuelgame');
    });
});
