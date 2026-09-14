import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { isFinished } from '../../../src/apps/game-console/game-progress';
import { createNodeGameSession } from '../../../src/platform/node/create-game-session';
import { createInventoryGame } from '../support/game-builder';
import { acquireDisposable } from '../support/effect';
import { getReadySnapshot, playWithReferenceSolutions } from '../support/session';

describe('GameSession with the real PGlite database', () => {
    it.scopedLive('plays a PostgreSQL game against isolated player and reference databases', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => createNodeGameSession({
            type: 'object',
            source: createInventoryGame('postgresql'),
        }));

        yield* session.resolve();
        yield* playWithReferenceSolutions(session);

        const finished = getReadySnapshot(session);
        expect(isFinished(finished.game, finished.progress)).toBe(true);
        expect(finished.results.filter(entry => entry.type === 'correct')).toHaveLength(3);
        expect(finished.schemaStatus).toMatchObject({
            kind: 'loaded',
            data: [{ name: 'items' }],
        });
    }), 20_000);
});
