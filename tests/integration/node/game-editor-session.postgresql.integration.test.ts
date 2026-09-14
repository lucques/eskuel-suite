import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import type { GameEditorSession, GameEditorSnapshot } from '../../../src/apps/game-editor/session';
import { Game } from '../../../src/game/model';
import { createNodeGameEditorSession } from '../../../src/platform/node/create-game-editor-session';
import replacementDatabaseSql from '../fixtures/databases/minimal.postgresql.sql?raw';
import { acquireDisposable } from '../support/effect';

function getReadySnapshot(session: GameEditorSession): Extract<GameEditorSnapshot, { kind: 'ready' }> {
    const snapshot = session.getSnapshot();
    if (snapshot.kind !== 'ready') {
        throw new Error('Game editor session is not ready');
    }
    else {
        return snapshot;
    }
}

describe('GameEditorSession with the real PGlite database', () => {
    it.scopedLive('switches an SQLite game to PostgreSQL when opening an explicitly marked script', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => createNodeGameEditorSession('system-switch', {
            type: 'object',
            source: new Game(
                'System switch',
                'Teaser',
                'Copyright',
                null,
                [{ type: 'text', text: 'Scene' }],
            ),
        }));
        yield* session.resolve();

        yield* session.dispatch({
            type: 'set-database-source',
            source: {
                type: 'initial-sql-script',
                source: { type: 'inline', content: replacementDatabaseSql },
            },
        });

        const snapshot = getReadySnapshot(session);
        expect(snapshot.document.game.dbSystem).toBe('postgresql');
        expect(snapshot.databaseStatus).toMatchObject({
            kind: 'loaded',
            schema: [{ name: 'marker', cols: [{ name: 'value', type: 'integer' }] }],
        });
    }), 20_000);
});
