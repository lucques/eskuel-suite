import { describe, expect, it } from 'vitest';

import { Game, createBlankGame } from './model';

describe('Game model', () => {
    it('rejects games without scenes', () => {
        expect(() => new Game('Empty', '', '', null, [])).toThrow(
            'Assertion failed: There must be at least one scene',
        );
    });

    it('creates a blank game with one initial text scene', () => {
        expect(createBlankGame('New game', {
            teaser: 'A teaser',
            copyright: 'An author',
            firstSceneText: 'Welcome',
        })).toEqual(new Game(
            'New game',
            'A teaser',
            'An author',
            null,
            [{ type: 'text', text: 'Welcome' }],
        ));
    });

    it('requires game and database systems to agree', () => {
        expect(() => new Game(
            'Mismatch',
            '',
            '',
            {
                type: 'initial-sql-script',
                system: 'postgresql',
                systemMinVersion: '14.0.0',
                sql: 'SELECT TRUE;',
            },
            [{ type: 'text', text: 'Introduction' }],
            'sqlite',
        )).toThrow('Assertion failed: The game and its initial SQL script must use the same database system');
    });
});
