import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import type { DatabaseEngine, DbData } from '../../../src/database/api';
import {
    DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS,
    type DatabaseSystem,
} from '../../../src/database/system';
import { createSettingsStore } from '../../../src/settings/store';
import type { SettingsStore } from '../../../src/settings/store';
import { acquireDisposable } from './effect';

type DatabaseEngineFactory = (settingsStore: SettingsStore) => DatabaseEngine;

function acquireConnection(engine: DatabaseEngine, source: DbData | null, system: DatabaseSystem) {
    return Effect.acquireRelease(
        engine.open(source, system, DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS[system]),
        connection => connection.close().pipe(Effect.orDie),
    );
}

export function describeDatabaseEngineContract(
    name: string,
    system: DatabaseSystem,
    createEngine: DatabaseEngineFactory,
): void {
    const timeout = system === 'postgresql' ? 20_000 : undefined;
    describe(name, () => {
        it.scopedLive('keeps connections isolated and normalizes query results', () => Effect.gen(function* () {
            const engine = yield* acquireDisposable(() => createEngine(createSettingsStore()));
            const first = yield* acquireConnection(engine, {
                type: 'initial-sql-script',
                system,
                systemMinVersion: DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS[system],
                sql: 'CREATE TABLE values_a (value TEXT); INSERT INTO values_a VALUES (\'first\');',
            }, system);
            const second = yield* acquireConnection(engine, {
                type: 'initial-sql-script',
                system,
                systemMinVersion: DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS[system],
                sql: 'CREATE TABLE values_b (value TEXT); INSERT INTO values_b VALUES (\'second\');',
            }, system);

            const firstResult = yield* first.exec('SELECT value FROM values_a');
            const secondResult = yield* second.exec('SELECT value FROM values_b');
            const firstSchema = yield* first.querySchema();

            expect(firstResult).toMatchObject({
                type: 'succ',
                result: [{ columns: ['value'], values: [['first']] }],
            });
            expect(secondResult).toMatchObject({
                type: 'succ',
                result: [{ columns: ['value'], values: [['second']] }],
            });
            expect(firstSchema).toMatchObject([{ name: 'values_a' }]);
        }), timeout);

        it.scopedLive('reports SQL errors as query results and initialization errors as engine failures', () => Effect.gen(function* () {
            const engine = yield* acquireDisposable(() => createEngine(createSettingsStore()));
            const connection = yield* acquireConnection(engine, null, system);

            const query = yield* connection.exec('NOT VALID SQL');
            expect(query.type).toBe('error');

            const invalidDatabaseError = yield* Effect.flip(engine.open({
                type: 'initial-sql-script',
                system,
                systemMinVersion: DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS[system],
                sql: 'NOT VALID SQL',
            }, system, DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS[system]));
            expect(invalidDatabaseError).toMatchObject({ kind: 'run-init-script' });

            yield* connection.close();
            const closedConnectionQuery = yield* connection.exec('SELECT 1').pipe(
                Effect.match({
                    onFailure: error => ({ ok: false as const, error }),
                    onSuccess: data => ({ ok: true as const, data }),
                }),
            );
            expect(closedConnectionQuery).toMatchObject({
                ok: false,
                error: { kind: 'database-engine', details: 'Database connection is closed' },
            });
        }), timeout);

        it.scopedLive('truncates query results at the configured row limit', () => Effect.gen(function* () {
            const store = createSettingsStore();
            store.update({ maxQueryResultRows: 2 });
            const engine = yield* acquireDisposable(() => createEngine(store));
            const connection = yield* acquireConnection(engine, null, system);

            const query = yield* connection.exec('SELECT 1 AS value UNION ALL SELECT 2 UNION ALL SELECT 3');
            expect(query).toMatchObject({
                type: 'succ',
                result: [{ columns: ['value'], values: [[1], [2]], truncated: true }],
            });
        }), timeout);

        it.scopedLive('enforces configured database size and open database limits', () => Effect.gen(function* () {
            const store = createSettingsStore();
            store.update({ maxOpenDatabases: 1 });
            const engine = yield* acquireDisposable(() => createEngine(store));
            const first = yield* acquireConnection(engine, null, system);

            const tooManyError = yield* Effect.flip(engine.open(
                null,
                system,
                DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS[system],
            ));
            expect(tooManyError).toMatchObject({ kind: 'database-engine' });

            yield* first.close();
            store.update({ maxDatabaseFileBytes: 8 });
            const tooLargeError = yield* Effect.flip(engine.open({
                type: 'initial-sql-script',
                system,
                systemMinVersion: DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS[system],
                sql: 'CREATE TABLE a (value TEXT);',
            }, system, DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS[system]));
            expect(tooLargeError).toMatchObject({ kind: 'run-init-script' });
        }), timeout);
    });
}
