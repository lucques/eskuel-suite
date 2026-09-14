import { describe, expect, it, vi } from 'vitest';

import { GAME_FINGERPRINT_VERSION, fingerprintGame } from '../../game/fingerprint';
import { Game } from '../../game/model';
import type { GameCheckpoint } from './checkpoint';
import { createGameCheckpointStore, getGameLocator, normalizeGameUrl } from './checkpoint';

const checkpointStorageKey = 'eskuel-suite:game-console-checkpoints:v1';

describe('SQL game checkpoints', () => {
    it('fingerprints the canonical game content', async () => {
        const first = createGame('First scene');
        const equivalent = createGame('First scene');
        const different = createGame('Changed scene');

        await expect(fingerprintGame(first)).resolves.toBe(await fingerprintGame(equivalent));
        await expect(fingerprintGame(first)).resolves.not.toBe(await fingerprintGame(different));
    });

    it('keeps one checkpoint per URL and retains checkpoints for other games', () => {
        const storage = createMemoryStorage();
        const store = createGameCheckpointStore(storage);
        const original = checkpoint('a', { kind: 'url', url: 'https://example.com/game.xml' }, 1);
        const replacement = checkpoint('b', { kind: 'url', url: 'https://example.com/game.xml' }, 2);
        const other = checkpoint('c', { kind: 'url', url: 'https://example.com/other.xml' }, 3);

        store.save(original);
        store.save(replacement);
        store.save(other);

        expect(store.findByFingerprint(original.gameFingerprint)).toBeNull();
        expect(store.findByFingerprint(replacement.gameFingerprint)).toEqual(replacement);
        expect(store.findByFingerprint(other.gameFingerprint)).toEqual(other);
        expect(store.getLastCheckpoint()).toEqual(other);
    });

    it('observes writes from another store instance using the same storage', () => {
        const storage = createMemoryStorage();
        const firstStore = createGameCheckpointStore(storage);
        const secondStore = createGameCheckpointStore(storage);
        const first = checkpoint('a', { kind: 'url', url: 'https://example.com/game.xml' }, 1);
        const second = checkpoint('b', { kind: 'url', url: 'https://example.com/game.xml' }, 2);

        firstStore.save(first);
        expect(secondStore.findByFingerprint(first.gameFingerprint)).toEqual(first);

        secondStore.save(second);
        expect(firstStore.findByFingerprint(first.gameFingerprint)).toBeNull();
        expect(firstStore.findByFingerprint(second.gameFingerprint)).toEqual(second);
    });

    it('retains only the 50 most recently updated checkpoints', () => {
        const store = createGameCheckpointStore(createMemoryStorage());
        const checkpoints = Array.from({ length: 51 }, (_, index) => ({
            ...checkpoint('a', { kind: 'object' }, index),
            gameFingerprint: `sha256:${index.toString(16).padStart(64, '0')}`,
        }));

        for (const candidate of checkpoints) {
            store.save(candidate);
        }

        expect(store.findByFingerprint(checkpoints[0].gameFingerprint)).toBeNull();
        expect(store.findByFingerprint(checkpoints[1].gameFingerprint)).toEqual(checkpoints[1]);
        expect(store.getLastCheckpoint()).toEqual(checkpoints[50]);
    });

    it('ignores malformed checkpoint entries while retaining valid entries', () => {
        const storage = createMemoryStorage();
        const valid = checkpoint('c', { kind: 'object' }, 5);
        storage.setItem(checkpointStorageKey, JSON.stringify([
            null,
            { ...checkpoint('a', { kind: 'object' }, 1), checkpointVersion: 2 },
            { ...checkpoint('b', { kind: 'object' }, 2), gameFingerprint: 'not-a-fingerprint' },
            {
                ...checkpoint('d', { kind: 'object' }, 3),
                progress: { curSceneIndex: 0, sceneStatuses: ['invalid-status'] },
            },
            valid,
        ]));

        const store = createGameCheckpointStore(storage);

        expect(store.getLastCheckpoint()).toEqual(valid);
    });

    it('treats corrupt or inaccessible storage as empty and does not throw on writes', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const corruptStorage = createMemoryStorage();
        corruptStorage.setItem(checkpointStorageKey, '{');
        const inaccessibleStorage = {
            getItem(): string | null {
                throw new Error('read denied');
            },
            setItem(): void {
                throw new Error('write denied');
            },
        };

        expect(createGameCheckpointStore(corruptStorage).getLastCheckpoint()).toBeNull();
        expect(createGameCheckpointStore(inaccessibleStorage).getLastCheckpoint()).toBeNull();
        expect(() => createGameCheckpointStore(inaccessibleStorage).save(
            checkpoint('a', { kind: 'object' }, 1),
        )).not.toThrow();
        expect(consoleError).toHaveBeenCalledTimes(4);
        consoleError.mockRestore();
    });

    it('uses a locator without an ID for object and inline sources', () => {
        const game = createGame('Scene');

        expect(getGameLocator({ type: 'object', source: game }, 'https://example.com/console')).toEqual({ kind: 'object' });
        expect(getGameLocator({
            type: 'xml',
            source: { type: 'inline', content: '<game />' },
        }, 'https://example.com/console')).toEqual({ kind: 'object' });
    });

    it('normalizes fetch URLs and removes fragments', () => {
        expect(normalizeGameUrl('../game.xml?edition=2#scene', 'https://example.com/tools/console/')).toBe(
            'https://example.com/tools/game.xml?edition=2',
        );
        expect(getGameLocator({
            type: 'eskuel-game-package',
            source: { type: 'fetch', url: '../game.eskuelgame#scene' },
        }, 'https://example.com/tools/console/')).toEqual({
            kind: 'url',
            url: 'https://example.com/tools/game.eskuelgame',
        });
    });

});

function createGame(text: string): Game {
    return new Game('Game', '', '', null, [{ type: 'text', text }]);
}

function checkpoint(
    fingerprintCharacter: string,
    gameLocator: GameCheckpoint['gameLocator'],
    updatedAt: number,
): GameCheckpoint {
    return {
        checkpointVersion: 1,
        fingerprintVersion: GAME_FINGERPRINT_VERSION,
        gameFingerprint: `sha256:${fingerprintCharacter.repeat(64)}`,
        gameLocator,
        gameTitle: `Game ${fingerprintCharacter}`,
        progress: {
            curSceneIndex: 0,
            sceneStatuses: ['nontask-seen'],
        },
        updatedAt,
    };
}

function createMemoryStorage() {
    const values = new Map<string, string>();
    return {
        getItem(key: string) {
            return values.get(key) ?? null;
        },
        setItem(key: string, value: string) {
            values.set(key, value);
        },
    };
}
