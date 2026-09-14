import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import type { GameEditorSession, GameEditorSnapshot } from '../../../src/apps/game-editor/session';
import { Game } from '../../../src/game/model';
import { createNodeGameEditorSession } from '../../../src/platform/node/create-game-editor-session';
import replacementDatabaseSql from '../fixtures/databases/minimal.sqlite.sql?raw';
import minimalSelectXml from '../fixtures/games/valid/minimal-select.xml?raw';
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

describe('GameEditorSession with the real sql.js database', () => {
    it.scopedLive('loads an XML game, exposes its schema, and replaces its database', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => createNodeGameEditorSession('minimal-select', {
            type: 'xml',
            source: { type: 'inline', content: minimalSelectXml },
        }));

        yield* session.resolve();
        const loaded = getReadySnapshot(session);
        expect(loaded.document.game.title).toBe('Minimal Select');
        expect(loaded.databaseStatus.kind).toBe('loaded');

        yield* session.dispatch({
            type: 'set-database-source',
            source: {
                type: 'initial-sql-script',
                source: { type: 'inline', content: replacementDatabaseSql },
            },
        });

        const replaced = getReadySnapshot(session);
        expect(replaced.databaseStatus.kind === 'loaded'
            && replaced.databaseStatus.schema.map(table => table.name)).toEqual(['marker']);
        expect(replaced.commandStatus).toEqual({ kind: 'idle' });
    }));

    it.scopedLive('classifies manipulation checks by comparing the real result before and after the solution', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => createNodeGameEditorSession('manipulation-testing', {
            type: 'object',
            source: new Game(
                'Manipulation testing',
                'Teaser',
                'Copyright',
                {
                    type: 'initial-sql-script',
                    system: 'sqlite',
                    systemMinVersion: '3.0.0',
                    sql: 'CREATE TABLE example (value INTEGER); INSERT INTO example VALUES (0);',
                },
                [
                    {
                        type: 'manipulate',
                        text: 'Change the value',
                        sqlSol: 'UPDATE example SET value = 1',
                        sqlCheck: 'SELECT value FROM example',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                    },
                    {
                        type: 'manipulate',
                        text: 'Do not change the value',
                        sqlSol: 'UPDATE example SET value = value',
                        sqlCheck: 'SELECT value FROM example',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                    },
                ],
            ),
        }));
        yield* session.resolve();

        yield* session.dispatch({ type: 'test-scenes-up-to', index: 1 });

        expect(getReadySnapshot(session).sceneTestStatuses.map(status => (
            status.kind === 'manipulate-result' ? status.outcome : status.kind
        ))).toEqual(['success', 'sql-check-no-witness']);
    }));
});
