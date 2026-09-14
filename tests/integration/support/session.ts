import { expect } from '@effect/vitest';
import { Effect } from 'effect';

import { getCurScene, isFinished } from '../../../src/apps/game-console/game-progress';
import { GameConsoleSession } from '../../../src/apps/game-console/session';
import type { GameConsoleSessionSnapshot, GameResult } from '../../../src/apps/game-console/session';

export function getReadySnapshot(session: GameConsoleSession): Extract<GameConsoleSessionSnapshot, { kind: 'ready' }> {
    const snapshot = session.getSnapshot();
    if (snapshot.kind !== 'ready') {
        throw new Error(`Expected a ready session, received ${snapshot.kind}`);
    }
    return snapshot;
}

export function getLatestResult(session: GameConsoleSession): GameResult {
    const entry = getReadySnapshot(session).results[0];
    if (entry === undefined) {
        throw new Error('Expected a game result');
    }
    else if (entry.type === 'database-reset-notice') {
        throw new Error('Expected a game result, received a database-reset notice');
    }
    else {
        return entry;
    }
}

export function playWithReferenceSolutions(session: GameConsoleSession) {
    return Effect.gen(function* () {
        const initialSnapshot = getReadySnapshot(session);
        // Keep a progress-transition bug from making this test loop forever when the game never finishes.
        const maximumCommands = initialSnapshot.game.scenes.length * 3;
        let commandCount = 0;
        let snapshot = initialSnapshot;

        while (commandCount < maximumCommands && !isFinished(snapshot.game, snapshot.progress)) {
            const scene = getCurScene(snapshot.game, snapshot.progress);
            switch (scene.type) {
                case 'text':
                case 'image':
                    yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
                    break;
                case 'select': {
                    yield* session.dispatch({ type: 'show-ordinary-hint' });
                    const ordinaryHint = getLatestResult(session);
                    
                    // The solution and therefore the ordinary hint may return an SQL
                    // result that failed (e.g. incorrect SQL). This is valid.
                    expect(ordinaryHint).toMatchObject({ type: 'ordinary-hint-select' });

                    yield* session.dispatch({ type: 'submit-sql', sql: scene.sqlSol });
                    const result = getLatestResult(session);
                    expect(result).toMatchObject({ type: 'correct' });
                    break;
                }
                case 'manipulate': {
                    yield* session.dispatch({ type: 'show-ordinary-hint' });
                    const ordinaryHint = getLatestResult(session);

                    // The solution and therefore the ordinary hint may return an SQL
                    // result that failed (e.g. incorrect SQL). This is valid.
                    expect(ordinaryHint).toMatchObject({ type: 'ordinary-hint-manipulate' });

                    yield* session.dispatch({ type: 'submit-sql', sql: scene.sqlSol });
                    const result = getLatestResult(session);
                    expect(result).toMatchObject({ type: 'correct' });
                    break;
                }
                default: { const _n: never = scene; return _n; }
            }
            commandCount++;
            snapshot = getReadySnapshot(session);
        }

        if (isFinished(snapshot.game, snapshot.progress)) {
            return;
        }
        else {
            return yield* Effect.dieMessage('Game did not finish within the expected number of commands');
        }
    });
}
