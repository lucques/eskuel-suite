import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { isFinished } from '../../../src/apps/game-console/game-progress';
import { createNodeGameSession } from '../../../src/platform/node/create-game-session';
import { createInventoryGame } from '../support/game-builder';
import { acquireDisposable } from '../support/effect';
import { getReadySnapshot, playWithReferenceSolutions } from '../support/session';

describe('GameSession with the real sql.js database', () => {
    it.scopedLive('plays select and manipulate scenes and reconstructs solved progress', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => createNodeGameSession({ type: 'object', source: createInventoryGame() }));

        yield* session.resolve();
        yield* playWithReferenceSolutions(session);

        const finished = getReadySnapshot(session);
        expect(isFinished(finished.game, finished.progress)).toBe(true);
        expect(finished.progress).toEqual({
            curSceneIndex: 4,
            sceneStatuses: [
                'nontask-seen',
                'task-solved-by-user',
                'task-solved-by-user',
                'task-solved-by-user',
                'nontask-unseen',
            ],
        });
        expect(finished.results.filter(entry => entry.type === 'correct')).toHaveLength(3);

        yield* session.dispatch({ type: 'previous-scene' });
        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        expect(getReadySnapshot(session).progress.curSceneIndex).toBe(4);
    }));

    it.scopedLive('creates a fresh database and clears results when restarted', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => createNodeGameSession({ type: 'object', source: createInventoryGame() }));
        yield* session.resolve();
        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        yield* session.dispatch({ type: 'submit-sql', sql: 'SELECT name FROM items ORDER BY id' });

        expect(getReadySnapshot(session).results).toHaveLength(1);
        yield* session.dispatch({ type: 'restart' });

        const restarted = getReadySnapshot(session);
        expect(restarted.progress.curSceneIndex).toBe(0);
        expect(restarted.results).toEqual([]);
    }));
});
