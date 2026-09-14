import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import type { BrowserSessionSnapshot } from '../../../src/apps/browser/session';
import { BrowserSession } from '../../../src/apps/browser/session';
import { acquireDisposable } from '../support/effect';

function getReadySnapshot(session: BrowserSession): Extract<BrowserSessionSnapshot, { kind: 'ready' }> {
    const snapshot = session.getSnapshot();
    if (snapshot.kind !== 'ready') {
        throw new Error('Browser session is not ready');
    }
    return snapshot;
}

describe('BrowserSession with the real sql.js database', () => {
    it.scopedLive('initializes, exposes its schema, and executes queries', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => new BrowserSession('inventory', {
            type: 'initial-sql-script',
            source: {
                type: 'inline',
                content: `
                    CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
                    INSERT INTO items VALUES (1, 'hammer'), (2, 'key');
                `,
            },
        }));
        const commandStatuses: string[] = [];
        const unsubscribe = session.subscribe(() => {
            const snapshot = session.getSnapshot();
            if (snapshot.kind === 'ready') {
                commandStatuses.push(snapshot.commandStatus.kind);
            }
            else if (snapshot.kind === 'loading' || snapshot.kind === 'failed') {
                // This test only records command states once the session is ready.
            }
            else { const _n: never = snapshot; }
        });
        yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));

        yield* session.resolve();
        const initialized = getReadySnapshot(session);
        expect(initialized.schemaStatus.kind === 'loaded'
            && initialized.schemaStatus.data.map(table => table.name)).toEqual(['items']);

        yield* session.dispatch({ type: 'execute-sql', sql: 'SELECT name FROM items ORDER BY id' });
        const entry = getReadySnapshot(session).results[0];
        if (entry.type === 'sql') {
            expect(entry.result).toMatchObject({
                type: 'succ',
                result: [{ columns: ['name'], values: [['hammer'], ['key']] }],
            });
        }
        else if (entry.type === 'database-reset-notice') {
            throw new Error('Expected a SQL result, received a database-reset notice');
        }
        else { const _n: never = entry; return _n; }
        expect(getReadySnapshot(session).commandStatus).toEqual({ kind: 'idle' });
        expect(commandStatuses).toContain('running');
    }));

    it.scopedLive('publishes initialization failures through its snapshot', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => new BrowserSession('broken', {
            type: 'initial-sql-script',
            source: { type: 'inline', content: 'THIS IS NOT SQL;' },
        }));

        const error = yield* Effect.flip(session.resolve());
        expect(error.kind).toBe('run-init-script');
        expect(session.getSnapshot()).toMatchObject({
            kind: 'failed',
            error: { kind: 'run-init-script' },
        });
    }));
});
