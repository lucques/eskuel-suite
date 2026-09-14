import { afterEach, describe, expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import { readFileSync } from 'node:fs';
import { vi } from 'vitest';

import type {
    DatabaseConnection,
    DatabaseEngineFactory,
    DatabaseEngineFail,
    SqlResult,
} from '../../database/api';
import { registerCodeEditorModel } from '../../gui-helpers/code-editor/uri';
import { createSettingsStore } from '../../settings/store';
import type { BrowserSessionSnapshot } from './session';
import { BrowserSession } from './session';

afterEach(() => {
    vi.restoreAllMocks();
});

function getReadySnapshot(session: BrowserSession): Extract<BrowserSessionSnapshot, { kind: 'ready' }> {
    const snapshot = session.getSnapshot();
    if (snapshot.kind !== 'ready') {
        throw new Error('Browser session is not ready');
    }
    return snapshot;
}

function createSessionWithExec(
    exec: (sql: string) => Effect.Effect<SqlResult, DatabaseEngineFail>,
): BrowserSession {
    const connection: DatabaseConnection = {
        exec,
        querySchema() {
            return Effect.succeed([]);
        },
        close() { return Effect.void; },
    };
    const engineFactory: DatabaseEngineFactory = () => ({
        open() {
            return Effect.succeed(connection);
        },
        dispose() {},
    });

    return new BrowserSession('test', {
        type: 'initial-sql-script',
        source: { type: 'inline', content: '' },
    }, engineFactory);
}

function successfulResult(sql: string): SqlResult {
    return {
        type: 'succ',
        sql,
        result: [{ columns: ['value'], values: [[1]] }],
    };
}

describe('BrowserSession commands', () => {
    it.effect('retains package attribution metadata for the browser UI', () => Effect.gen(function* () {
        const archive = new Uint8Array(readFileSync(new URL(
            '../../../spec/database-package/v1/examples/initial-sql-script.eskueldb',
            import.meta.url,
        )));
        const connection: DatabaseConnection = {
            exec(sql) {
                return Effect.succeed(successfulResult(sql));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() {
                return Effect.void;
            },
        };
        const engineFactory: DatabaseEngineFactory = () => ({
            open() {
                return Effect.succeed(connection);
            },
            dispose() {},
        });
        const session = new BrowserSession('example.eskueldb', {
            type: 'eskuel-database-package',
            source: { type: 'inline', content: archive },
        }, engineFactory);

        yield* session.resolve();

        expect(session.getDatabasePackageInfo()).toMatchObject({
            descriptor: {
                title: 'Example school database initialization script',
                version: '1.0.0',
            },
            licenses: [{
                metadata: { name: 'MIT', title: 'MIT License' },
                text: expect.stringContaining('MIT License'),
            }],
        });
        session.dispose();
    }));

    it.effect('rejects invalid SQL metadata before creating a database engine', () => Effect.gen(function* () {
        const databaseEngineFactory = vi.fn<DatabaseEngineFactory>();
        const session = new BrowserSession('invalid metadata', {
            type: 'initial-sql-script',
            source: {
                type: 'inline',
                content: '-- eskuel:engine=sqlite\nSELECT 1;',
            },
        }, databaseEngineFactory);

        const error = yield* Effect.flip(session.resolve());
        expect(error).toEqual({
            kind: 'parse-sql-metadata',
            details: 'Unknown Eskuel SQL metadata key: engine',
        });
        expect(databaseEngineFactory).not.toHaveBeenCalled();
        session.dispose();
    }));

    it.effect('publishes running and idle states around successful SQL execution', () => Effect.gen(function* () {
        const session = createSessionWithExec(sql => Effect.succeed(successfulResult(sql)));
        yield* session.resolve();
        const statuses: string[] = [];
        const unsubscribe = session.subscribe(() => {
            statuses.push(getReadySnapshot(session).commandStatus.kind);
        });

        yield* session.dispatch({ type: 'execute-sql', sql: 'SELECT 1' });

        expect(statuses).toContain('running');
        expect(statuses.at(-1)).toBe('idle');
        expect(getReadySnapshot(session).results).toHaveLength(1);
        unsubscribe();
    }));

    it.effect('retains only the configured number of rows per result table', () => Effect.gen(function* () {
        const settingsStore = createSettingsStore();
        settingsStore.update({ maxDisplayedResultRowsPerTable: 2 });
        const connection: DatabaseConnection = {
            exec(sql) {
                return Effect.succeed({
                    type: 'succ',
                    sql,
                    result: [{ columns: ['value'], values: [[1], [2], [3]] }],
                });
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() {
                return Effect.void;
            },
        };
        const session = new BrowserSession(
            'test',
            {
                type: 'initial-sql-script',
                source: { type: 'inline', content: '' },
            },
            () => ({
                open() {
                    return Effect.succeed(connection);
                },
                dispose() {},
            }),
            settingsStore,
        );
        yield* session.resolve();

        yield* session.dispatch({ type: 'execute-sql', sql: 'SELECT value' });

        expect(getReadySnapshot(session).results[0]).toMatchObject({
            type: 'sql',
            result: {
                result: [{ values: [[1], [2]], truncated: true }],
            },
        });
        session.dispose();
    }));

    it.effect('drops concurrent SQL execution while another command holds the permit', () => Effect.gen(function* () {
        const sqlStarted = yield* Deferred.make<void>();
        const sqlResult = yield* Deferred.make<SqlResult>();
        const exec = vi.fn((_sql: string) => Deferred.succeed(sqlStarted, undefined).pipe(
            Effect.zipRight(Deferred.await(sqlResult)),
        ));
        const session = createSessionWithExec(exec);
        yield* session.resolve();

        const first = yield* Effect.fork(session.dispatch({ type: 'execute-sql', sql: 'SELECT first' }));
        yield* Deferred.await(sqlStarted);
        expect(getReadySnapshot(session).commandStatus.kind).toBe('running');
        expect(exec).toHaveBeenCalledTimes(1);
        yield* session.dispatch({ type: 'execute-sql', sql: 'SELECT second' });
        yield* Deferred.succeed(sqlResult, successfulResult('SELECT first'));
        yield* Fiber.join(first);

        expect(exec).toHaveBeenCalledTimes(1);
        expect(getReadySnapshot(session).results).toHaveLength(1);
        expect(getReadySnapshot(session).commandStatus).toEqual({ kind: 'idle' });
    }));

    it.effect('cancels SQL execution and reports the initial-database reset', () => Effect.gen(function* () {
        const sqlStarted = yield* Deferred.make<void>();
        const sqlResult = yield* Deferred.make<SqlResult>();
        const session = createSessionWithExec(() => Deferred.succeed(sqlStarted, undefined).pipe(
            Effect.zipRight(Deferred.await(sqlResult)),
        ));
        yield* session.resolve();

        const command = yield* Effect.fork(session.dispatch(
            { type: 'execute-sql', sql: 'SELECT forever' },
        ));
        yield* Deferred.await(sqlStarted);

        expect(getReadySnapshot(session).commandStatus).toEqual({
            kind: 'running',
            command: { type: 'execute-sql', sql: 'SELECT forever' },
        });
        session.cancelRunningCommand();
        yield* Fiber.join(command);

        expect(getReadySnapshot(session).commandStatus).toEqual({ kind: 'idle' });
        expect(getReadySnapshot(session).results).toEqual([
            { id: 0, type: 'database-reset-notice' },
        ]);
    }));

    it.effect('reopens a cached fetched source and discards mutations made since opening', () => Effect.gen(function* () {
        const sqlStarted = yield* Deferred.make<void>();
        const sqlResult = yield* Deferred.make<SqlResult>();
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
            'CREATE TABLE marker (value INTEGER); INSERT INTO marker VALUES (0);',
        ));
        let openCount = 0;
        const engineFactory: DatabaseEngineFactory = () => ({
            open(source) {
                return Effect.sync(() => {
                    expect(source).toEqual({
                        type: 'initial-sql-script',
                        system: 'sqlite',
                        systemMinVersion: '3.0.0',
                        sql: 'CREATE TABLE marker (value INTEGER); INSERT INTO marker VALUES (0);',
                    });
                    openCount++;
                    let value = 0;
                    return {
                        exec(sql: string) {
                            if (sql === 'UPDATE marker SET value = 1') {
                                value = 1;
                                return Effect.succeed({ type: 'succ' as const, sql, result: [] });
                            }
                            else if (sql === 'LONG') {
                                value = 2;
                                return Deferred.succeed(sqlStarted, undefined).pipe(
                                    Effect.zipRight(Deferred.await(sqlResult)),
                                );
                            }
                            else if (sql === 'SELECT value FROM marker') {
                                return Effect.succeed({
                                    type: 'succ' as const,
                                    sql,
                                    result: [{ columns: ['value'], values: [[value]] }],
                                });
                            }
                            else {
                                return Effect.succeed({ type: 'error' as const, sql, message: 'Unexpected SQL' });
                            }
                        },
                        querySchema() {
                            return Effect.succeed([]);
                        },
                        close() {
                            return Effect.void;
                        },
                    };
                });
            },
            dispose() {},
        });
        const session = new BrowserSession('test', {
            type: 'initial-sql-script',
            source: { type: 'fetch', url: '/initial.sql' },
        }, engineFactory);
        yield* session.resolve();
        yield* session.dispatch({ type: 'execute-sql', sql: 'UPDATE marker SET value = 1' });

        const command = yield* Effect.fork(session.dispatch({ type: 'execute-sql', sql: 'LONG' }));
        yield* Deferred.await(sqlStarted);
        session.cancelRunningCommand();
        yield* Fiber.join(command);

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(openCount).toBe(2);
        expect(getReadySnapshot(session).results).toHaveLength(2);

        yield* session.dispatch({ type: 'execute-sql', sql: 'SELECT value FROM marker' });
        const entry = getReadySnapshot(session).results[0];
        if (entry.type === 'sql') {
            expect(entry.result.type).toBe('succ');
            expect(entry.result.type === 'succ' ? entry.result.result[0].values : []).toEqual([[0]]);
        }
        else if (entry.type === 'database-reset-notice') {
            throw new Error('Expected a SQL result, received a database-reset notice');
        }
        else { const _n: never = entry; return _n; }
    }));

    it.effect('keeps the cancellation-requested state until reconstruction finishes', () => Effect.gen(function* () {
        const sqlStarted = yield* Deferred.make<void>();
        const sqlResult = yield* Deferred.make<SqlResult>();
        const reconstructionStarted = yield* Deferred.make<void>();
        const reconstructionMayFinish = yield* Deferred.make<DatabaseConnection>();
        const initialConnection: DatabaseConnection = {
            exec() {
                return Deferred.succeed(sqlStarted, undefined).pipe(
                    Effect.zipRight(Deferred.await(sqlResult)),
                );
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() {
                return Effect.void;
            },
        };
        const restoredConnection: DatabaseConnection = {
            exec(sql) {
                return Effect.succeed(successfulResult(sql));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() {
                return Effect.void;
            },
        };
        let factoryCalls = 0;
        const engineFactory: DatabaseEngineFactory = () => {
            const engineNumber = factoryCalls++;
            return {
                open() {
                    return engineNumber === 0
                        ? Effect.succeed(initialConnection)
                        : Deferred.succeed(reconstructionStarted, undefined).pipe(
                            Effect.zipRight(Deferred.await(reconstructionMayFinish)),
                        );
                },
                dispose() {},
            };
        };
        const session = new BrowserSession('test', {
            type: 'initial-sql-script',
            source: { type: 'inline', content: '' },
        }, engineFactory);
        yield* session.resolve();

        const command = yield* Effect.fork(session.dispatch({ type: 'execute-sql', sql: 'LONG' }));
        yield* Deferred.await(sqlStarted);
        session.cancelRunningCommand();
        yield* Deferred.await(reconstructionStarted);

        expect(getReadySnapshot(session).commandStatus).toEqual({
            kind: 'rebuilding-after-cancellation',
            cancelledCommand: { type: 'execute-sql', sql: 'LONG' },
        });

        yield* Deferred.succeed(reconstructionMayFinish, restoredConnection);
        yield* Fiber.join(command);
        expect(getReadySnapshot(session).commandStatus).toEqual({ kind: 'idle' });
    }));

    it.effect('makes reconstruction failure fatal', () => Effect.gen(function* () {
        const sqlStarted = yield* Deferred.make<void>();
        const sqlResult = yield* Deferred.make<SqlResult>();
        const connection: DatabaseConnection = {
            exec() {
                return Deferred.succeed(sqlStarted, undefined).pipe(
                    Effect.zipRight(Deferred.await(sqlResult)),
                );
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() {
                return Effect.void;
            },
        };
        let factoryCalls = 0;
        const engineFactory: DatabaseEngineFactory = () => {
            const engineNumber = factoryCalls++;
            return {
                open() {
                    return engineNumber === 0
                        ? Effect.succeed(connection)
                        : Effect.fail({
                            kind: 'database-engine' as const,
                            details: 'reconstruction failed',
                        });
                },
                dispose() {},
            };
        };
        const session = new BrowserSession('test', {
            type: 'initial-sql-script',
            source: { type: 'inline', content: '' },
        }, engineFactory);
        yield* session.resolve();

        const command = yield* Effect.fork(session.dispatch({ type: 'execute-sql', sql: 'LONG' }));
        yield* Deferred.await(sqlStarted);
        session.cancelRunningCommand();
        yield* Fiber.join(command);

        const snapshot = session.getSnapshot();
        expect(snapshot.kind).toBe('failed');
        expect(snapshot.kind === 'failed' && snapshot.error).toMatchObject({
            kind: 'unexpected',
            details: 'reconstruction failed',
        });
    }));

    it.effect('publishes an infrastructure failure without throwing from dispatch', () => Effect.gen(function* () {
        const session = createSessionWithExec(() => Effect.fail({
            kind: 'database-engine',
            details: 'worker crashed',
        }));
        yield* session.resolve();

        const result = yield* session.dispatch({ type: 'execute-sql', sql: 'SELECT 1' });
        expect(result).toBeUndefined();

        const snapshot = session.getSnapshot();
        expect(snapshot.kind).toBe('failed');
        expect(snapshot.kind === 'failed' && snapshot.error).toMatchObject({
            kind: 'unexpected',
            details: 'worker crashed',
        });
    }));

    it('disposes its retained SQL editor model', () => {
        const session = createSessionWithExec(() => Effect.succeed(successfulResult('SELECT 1')));
        const disposeModel = vi.fn();
        registerCodeEditorModel(session.sqlEditorURI, disposeModel);

        session.dispose();
        session.dispose();

        expect(disposeModel).toHaveBeenCalledOnce();
    });
});
