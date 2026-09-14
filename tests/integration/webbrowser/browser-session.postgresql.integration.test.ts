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

describe('BrowserSession with the real PGlite database', () => {
    it.scopedLive('selects PostgreSQL from SQL metadata and executes its syntax', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => new BrowserSession('postgresql.sql', {
            type: 'initial-sql-script',
            source: {
                type: 'inline',
                content: `
                    -- eskuel:system=postgresql
                    -- eskuel:systemMinVersion=14.0.0
                    CREATE TABLE flags (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, enabled BOOLEAN);
                    INSERT INTO flags (enabled) VALUES (TRUE), (FALSE);
                `,
            },
        }));

        yield* session.resolve();
        expect(getReadySnapshot(session).schemaStatus).toMatchObject({
            kind: 'loaded',
            data: [{ name: 'flags' }],
        });

        yield* session.dispatch({
            type: 'execute-sql',
            sql: 'SELECT id, enabled FROM flags ORDER BY id',
        });
        const entry = getReadySnapshot(session).results[0];
        if (entry.type === 'sql') {
            expect(entry.result).toMatchObject({
                type: 'succ',
                result: [{
                    columns: ['id', 'enabled'],
                    values: [[1, true], [2, false]],
                }],
            });
        }
        else if (entry.type === 'database-reset-notice') {
            throw new Error('Expected a SQL result, received a database-reset notice');
        }
        else { const _n: never = entry; return _n; }
    }), 20_000);
});
