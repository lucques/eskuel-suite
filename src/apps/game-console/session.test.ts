import { describe, expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import { vi } from 'vitest';

import type { DatabaseEngineFactory } from '../../database/api';
import { registerCodeEditorModel } from '../../gui-helpers/code-editor/uri';
import type { GamePlatformAdapters } from '../../platform/game';
import { createSettingsStore } from '../../settings/store';

// GameSession tests use the engine contract rather than a specific database implementation.
const createTestDatabaseEngine: DatabaseEngineFactory = () => ({
    open() {
        return Effect.succeed({
            exec(sql: string) {
                return Effect.succeed({
                    type: 'succ' as const,
                    sql,
                    result: sql === 'WRONG'
                        ? [{ columns: ['wrong'], values: [[1]] }]
                        : [],
                });
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() {
                return Effect.void;
            },
        });
    },
    dispose() {},
});

const testGamePlatformAdapters = {
    databaseEngineFactory: createTestDatabaseEngine,
    supportedDatabaseSystems: ['sqlite'],
    xmlParser: {
        parse() {
            throw new Error('XML parsing is not used by these tests');
        },
    },
} satisfies GamePlatformAdapters;

import { Game } from '../../game/model';
import { getSkippedTaskCount } from './game-progress';
import { GameConsoleSession } from './session';

const createSession = (initiallySkipFirstScenes?: number) => {
    const game = new Game(
        'Test game',
        '',
        '',
        null,
        [
            { type: 'text', text: 'Introduction' },
            {
                type: 'select',
                text: 'Select one',
                sqlSol: 'SELECT 1 AS value',
                sqlPlaceholder: 'SELECT',
                ordinaryHints: [],
                hasSolHint: false,
                isRowOrderRelevant: true,
                isColOrderRelevant: true,
                areColNamesRelevant: true,
            },
            { type: 'text', text: 'Finished' },
        ],
    );

    return new GameConsoleSession({ type: 'object', source: game }, initiallySkipFirstScenes, testGamePlatformAdapters);
};

const getProgress = (session: GameConsoleSession) => {
    return session.getGameProgress();
};

const getReadySnapshot = (session: GameConsoleSession) => {
    const snapshot = session.getSnapshot();
    if (snapshot.kind !== 'ready') {
        throw new Error('Game session is not ready');
    }
    return snapshot;
};

const getLatestResultType = (session: GameConsoleSession) => {
    const entry = getReadySnapshot(session).results[0];
    if (entry === undefined) {
        throw new Error('Game session has no result');
    }
    return entry.type;
};

describe('GameSession database-system selection', () => {
    it.effect('rejects a PostgreSQL game even when it has no initialization source', () => Effect.gen(function* () {
        const game = new Game(
            'PostgreSQL game',
            '',
            '',
            null,
            [{ type: 'text', text: 'Introduction' }],
            'postgresql',
        );
        const session = new GameConsoleSession(
            { type: 'object', source: game },
            undefined,
            testGamePlatformAdapters,
        );

        const error = yield* Effect.flip(session.resolve());
        expect(error).toMatchObject({
            kind: 'unsupported-database-system',
            system: 'postgresql',
        });
        session.dispose();
    }));
});

describe('GameSession navigation', () => {
    it.effect('turns a skipped task back into an unsolved task when navigating back', () => Effect.gen(function* () {
        const session = createSession();
        yield* session.resolve();

        expect(yield* getProgress(session)).toEqual({
            curSceneIndex: 0,
            sceneStatuses: ['nontask-unseen', 'task-unsolved', 'nontask-unseen'],
        });

        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        expect(yield* getProgress(session)).toEqual({
            curSceneIndex: 1,
            sceneStatuses: ['nontask-seen', 'task-unsolved', 'nontask-unseen'],
        });

        yield* session.dispatch({ type: 'skip-scene' });
        expect(yield* getProgress(session)).toEqual({
            curSceneIndex: 2,
            sceneStatuses: ['nontask-seen', 'task-skipped', 'nontask-unseen'],
        });
        expect(getSkippedTaskCount(yield* getProgress(session))).toBe(1);

        yield* session.dispatch({ type: 'previous-scene' });
        expect(yield* getProgress(session)).toEqual({
            curSceneIndex: 1,
            sceneStatuses: ['nontask-seen', 'task-unsolved', 'nontask-unseen'],
        });
        expect(getSkippedTaskCount(yield* getProgress(session))).toBe(0);

        yield* session.dispatch({ type: 'submit-sql', sql: 'SELECT 1 AS value' });
        expect(getLatestResultType(session)).toBe('correct');
        expect(yield* getProgress(session)).toEqual({
            curSceneIndex: 2,
            sceneStatuses: ['nontask-seen', 'task-solved-by-user', 'nontask-unseen'],
        });

        yield* session.dispatch({ type: 'previous-scene' });
        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        expect(yield* getProgress(session)).toEqual({
            curSceneIndex: 2,
            sceneStatuses: ['nontask-seen', 'task-solved-by-user', 'nontask-unseen'],
        });
    }));

    it.effect('makes an invalid Next command a fatal session failure', () => Effect.gen(function* () {
        const session = createSession();
        yield* session.resolve();
        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });

        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        const failedSnapshot = session.getSnapshot();
        expect(failedSnapshot.kind).toBe('failed');
        expect(String(failedSnapshot.kind === 'failed' && failedSnapshot.error.kind === 'unexpected'
            ? failedSnapshot.error.details
            : '')).toContain('Cannot advance from a non-solved task');
    }));

    it.effect('executes neutral queries outside a non-solved task without changing progress', () => Effect.gen(function* () {
        const session = createSession();
        yield* session.resolve();

        const initialProgress = yield* getProgress(session);
        yield* session.dispatch({ type: 'submit-sql', sql: 'SELECT outside_task' });
        expect(getLatestResultType(session)).toBe('sql');
        expect(yield* getProgress(session)).toEqual(initialProgress);

        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        yield* session.dispatch({ type: 'submit-sql', sql: 'SELECT 1 AS value' });
        yield* session.dispatch({ type: 'previous-scene' });

        const solvedTaskProgress = yield* getProgress(session);
        yield* session.dispatch({ type: 'submit-sql', sql: 'SELECT after_solving' });
        expect(getLatestResultType(session)).toBe('sql');
        expect(yield* getProgress(session)).toEqual(solvedTaskProgress);
    }));

    it.effect('shows the reference solution for a solved select task', () => Effect.gen(function* () {
        const session = createSession();
        yield* session.resolve();
        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        yield* session.dispatch({ type: 'submit-sql', sql: 'SELECT 1 AS value' });
        yield* session.dispatch({ type: 'previous-scene' });

        yield* session.dispatch({ type: 'show-solution' });

        expect(getReadySnapshot(session).results[0]).toEqual({
            id: 1,
            type: 'sample-sol',
            res: {
                type: 'succ',
                sql: 'SELECT 1 AS value',
                result: [],
            },
        });
        session.dispose();
    }));

    it.effect('shows the reference check result for a solved manipulation task', () => Effect.gen(function* () {
        const game = new Game('Manipulation game', '', '', null, [
            { type: 'text', text: 'Introduction' },
            {
                type: 'manipulate',
                text: 'Change the value',
                sqlSol: 'UPDATE items SET value = 1',
                sqlCheck: 'SELECT value FROM items',
                sqlPlaceholder: 'UPDATE',
                ordinaryHints: [],
                hasSolHint: false,
            },
            { type: 'text', text: 'Finished' },
        ]);
        const session = new GameConsoleSession(
            { type: 'object', source: game },
            undefined,
            testGamePlatformAdapters,
        );
        yield* session.resolve();
        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        yield* session.dispatch({ type: 'submit-sql', sql: 'UPDATE items SET value = 1' });
        yield* session.dispatch({ type: 'previous-scene' });

        yield* session.dispatch({ type: 'show-solution' });

        expect(getReadySnapshot(session).results[0]).toEqual({
            id: 1,
            type: 'sample-sol',
            res: {
                type: 'succ',
                sql: 'SELECT value FROM items',
                result: [],
            },
        });
        session.dispose();
    }));

    it.effect('shows a select solution hint from the reference cache and resets its progress without removing the result', () => Effect.gen(function* () {
        const executedSql: string[][] = [[], []];
        let openCount = 0;
        const engineFactory: DatabaseEngineFactory = () => ({
            open() {
                return Effect.sync(() => {
                    const databaseNumber = openCount++;
                    executedSql[databaseNumber] = [];
                    return {
                        exec(sql: string) {
                            executedSql[databaseNumber].push(sql);
                            return Effect.succeed(successfulSqlResult(sql, databaseNumber));
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
        const game = new Game('Select solution hint', '', '', null, [{
            type: 'select',
            text: 'Select a value',
            sqlSol: 'SELECT solution',
            sqlPlaceholder: 'SELECT',
            ordinaryHints: [{ type: 'expected-result' }],
            hasSolHint: true,
            isRowOrderRelevant: true,
            isColOrderRelevant: true,
            areColNamesRelevant: true,
        }]);
        const session = new GameConsoleSession(
            { type: 'object', source: game },
            undefined,
            createTestGamePlatformAdapters(engineFactory),
        );
        yield* session.resolve();

        yield* session.dispatch({ type: 'show-ordinary-hint' });
        expect(executedSql[0]).toEqual([]);
        expect(executedSql[1]).toEqual(['SELECT solution']);
        yield* session.dispatch({ type: 'show-solution-hint' });

        expect(executedSql[0]).toEqual([]);
        expect(executedSql[1]).toEqual(['SELECT solution']);
        expect((yield* getProgress(session)).sceneStatuses).toEqual(['task-solved-by-sol-hint']);
        expect(getReadySnapshot(session).results[0]).toMatchObject({
            type: 'sol-hint',
            res: { sql: 'SELECT solution' },
        });

        yield* session.dispatch({ type: 'reset-solution-hint' });

        expect((yield* getProgress(session)).sceneStatuses).toEqual(['task-unsolved']);
        expect(getReadySnapshot(session).results[0]).toMatchObject({ type: 'sol-hint' });
        session.dispose();
    }));

    it.effect('reuses the captured manipulate solution result and applies the solution to the user database only when advancing', () => Effect.gen(function* () {
        const executedSql: string[][] = [[], []];
        let openCount = 0;
        const engineFactory: DatabaseEngineFactory = () => ({
            open() {
                return Effect.sync(() => {
                    const databaseNumber = openCount++;
                    executedSql[databaseNumber] = [];
                    return {
                        exec(sql: string) {
                            executedSql[databaseNumber].push(sql);
                            return Effect.succeed(successfulSqlResult(sql, databaseNumber));
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
        const game = new Game('Manipulate solution hint', '', '', null, [
            {
                type: 'manipulate',
                text: 'Change a value',
                sqlSol: 'APPLY solution',
                sqlCheck: 'CHECK solution',
                sqlPlaceholder: 'APPLY',
                ordinaryHints: [],
                hasSolHint: true,
            },
            { type: 'text', text: 'Finished' },
        ]);
        const session = new GameConsoleSession(
            { type: 'object', source: game },
            undefined,
            createTestGamePlatformAdapters(engineFactory),
        );
        yield* session.resolve();

        expect(executedSql[0]).toEqual([]);
        expect(executedSql[1]).toEqual(['APPLY solution']);
        yield* session.dispatch({ type: 'show-solution-hint' });
        expect(executedSql[0]).toEqual([]);
        expect(executedSql[1]).toEqual(['APPLY solution']);
        expect(getReadySnapshot(session).results[0]).toMatchObject({
            type: 'sol-hint',
            res: { sql: 'APPLY solution' },
        });

        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        expect(executedSql[0]).toEqual(['APPLY solution']);
        expect((yield* getProgress(session)).sceneStatuses[0]).toBe('task-solved-by-sol-hint');
        session.dispose();
    }));

    it.effect('retains only the configured displayed rows in every SQL result entry', () => Effect.gen(function* () {
        const values = Array.from({ length: 60 }, (_, index) => [index]);
        const settingsStore = createSettingsStore();
        settingsStore.update({ maxDisplayedResultRowsPerTable: 7 });
        const engineFactory: DatabaseEngineFactory = () => ({
            open() {
                return Effect.succeed({
                    exec(sql: string) {
                        return Effect.succeed({
                            type: 'succ' as const,
                            sql,
                            result: [{ columns: ['value'], values }],
                        });
                    },
                    querySchema() {
                        return Effect.succeed([]);
                    },
                    close() {
                        return Effect.void;
                    },
                });
            },
            dispose() {},
        });
        const game = new Game('Result limits', '', '', null, [{
            type: 'select',
            text: 'Select values',
            sqlSol: 'SELECT value',
            sqlPlaceholder: 'SELECT',
            ordinaryHints: [],
            hasSolHint: false,
            isRowOrderRelevant: true,
            isColOrderRelevant: true,
            areColNamesRelevant: true,
        }]);
        const session = new GameConsoleSession(
            { type: 'object', source: game },
            undefined,
            createTestGamePlatformAdapters(engineFactory),
            settingsStore,
        );
        yield* session.resolve();

        yield* session.dispatch({ type: 'show-ordinary-hint' });
        const ordinaryHint = getReadySnapshot(session).results[0];
        expect(ordinaryHint).toMatchObject({
            type: 'ordinary-hint-select',
            expectedResult: {
                result: [{ values: values.slice(0, 7), truncated: true }],
            },
        });

        yield* session.dispatch({ type: 'submit-sql', sql: 'SELECT value' });
        const submittedResult = getReadySnapshot(session).results[0];
        expect(submittedResult).toMatchObject({
            type: 'correct',
            res: {
                result: [{ values: values.slice(0, 7), truncated: true }],
            },
        });

        yield* session.dispatch({ type: 'show-solution' });
        const solution = getReadySnapshot(session).results[0];
        expect(solution).toMatchObject({
            type: 'sample-sol',
            res: {
                result: [{ values: values.slice(0, 7), truncated: true }],
            },
        });
        session.dispose();
    }));

    it.effect('resets the database from a non-task scene and publishes a notice', () => Effect.gen(function* () {
        const session = createSession();
        yield* session.resolve();

        const initialProgress = yield* getProgress(session);
        yield* session.dispatch({ type: 'reset-db-in-current-scene' });

        expect(getReadySnapshot(session).commandStatus).toEqual({ kind: 'idle' });
        expect(yield* getProgress(session)).toEqual(initialProgress);
        expect(getReadySnapshot(session).results[0]).toEqual({
            id: 0,
            type: 'database-reset-notice',
            sceneIndex: 0,
            trigger: 'manual',
        });
    }));

    it.effect('preserves the SQL editor when resetting the database', () => Effect.gen(function* () {
        const session = createSession();
        yield* session.resolve();
        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        const editor = getReadySnapshot(session).editor;

        yield* session.dispatch({ type: 'reset-db-in-current-scene' });

        expect(getReadySnapshot(session).editor).toBe(editor);
    }));

    it.effect('uses the same transitions for runtime and initial multi-scene skipping', () => Effect.gen(function* () {
        const runtimeSkipSession = createSession();
        yield* runtimeSkipSession.resolve();
        yield* runtimeSkipSession.dispatch({ type: 'next-scene', origin: 'navbar' });
        yield* runtimeSkipSession.dispatch({ type: 'skip-scene' });

        const expectedProgress = {
            curSceneIndex: 2,
            sceneStatuses: ['nontask-seen', 'task-skipped', 'nontask-unseen'],
        };
        expect(yield* getProgress(runtimeSkipSession)).toEqual(expectedProgress);

        const initialSkipSession = createSession(2);
        yield* initialSkipSession.resolve();
        expect(yield* getProgress(initialSkipSession)).toEqual(expectedProgress);

        yield* runtimeSkipSession.dispatch({ type: 'restart' });
        expect(yield* getProgress(runtimeSkipSession)).toEqual({
            curSceneIndex: 0,
            sceneStatuses: ['nontask-unseen', 'task-unsolved', 'nontask-unseen'],
        });
    }));

    it.effect('returns a copy of scene statuses', () => Effect.gen(function* () {
        const session = createSession();
        yield* session.resolve();

        const progress = yield* getProgress(session);
        progress.sceneStatuses[1] = 'task-skipped';

        expect((yield* getProgress(session)).sceneStatuses[1]).toBe('task-unsolved');
    }));

    it.effect('restores a compatible saved progress', () => Effect.gen(function* () {
        const session = createSession();
        yield* session.resolve();
        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        yield* session.dispatch({ type: 'skip-scene' });
        const savedProgress = yield* getProgress(session);

        yield* session.dispatch({ type: 'restart' });
        expect((yield* getProgress(session)).curSceneIndex).toBe(0);

        yield* session.restoreProgress(savedProgress);
        expect(yield* getProgress(session)).toEqual(savedProgress);
        session.dispose();
    }));

    it.effect.each([
        'task-solved-by-user',
        'task-solved-by-sol-hint',
    ] as const)('replays a %s manipulation into both databases when restoring progress', status => Effect.gen(function* () {
        const databaseValues: number[] = [];
        let openCount = 0;
        const engineFactory: DatabaseEngineFactory = () => ({
            open() {
                return Effect.sync(() => {
                    const databaseNumber = openCount++;
                    databaseValues[databaseNumber] = 0;
                    return {
                        exec(sql: string) {
                            if (sql === 'APPLY SOLUTION') {
                                databaseValues[databaseNumber] = 1;
                                return Effect.succeed({ type: 'succ' as const, sql, result: [] });
                            }
                            else if (sql === 'CHECK VALUE') {
                                return Effect.succeed(successfulSqlResult(sql, databaseValues[databaseNumber]));
                            }
                            else {
                                return Effect.succeed({
                                    type: 'error' as const,
                                    sql,
                                    message: `Unexpected SQL: ${sql}`,
                                });
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
        const game = new Game('Manipulation restore', '', '', null, [{
            type: 'manipulate',
            text: 'Change the value',
            sqlSol: 'APPLY SOLUTION',
            sqlCheck: 'CHECK VALUE',
            sqlPlaceholder: 'APPLY',
            ordinaryHints: [],
            hasSolHint: true,
        }]);
        const session = new GameConsoleSession(
            { type: 'object', source: game },
            undefined,
            createTestGamePlatformAdapters(engineFactory),
        );
        yield* session.resolve();
        if (status === 'task-solved-by-user') {
            yield* session.dispatch({ type: 'submit-sql', sql: 'APPLY SOLUTION' });
        }
        else if (status === 'task-solved-by-sol-hint') {
            yield* session.dispatch({ type: 'show-solution-hint' });
        }
        else { const _n: never = status; return _n; }
        const savedProgress = yield* getProgress(session);
        expect(savedProgress.sceneStatuses).toEqual([status]);

        yield* session.dispatch({ type: 'restart' });
        expect((yield* getProgress(session)).sceneStatuses).toEqual(['task-unsolved']);
        yield* session.restoreProgress(savedProgress);

        expect(databaseValues[4]).toBe(1);
        expect(databaseValues[5]).toBe(1);
        yield* session.dispatch({ type: 'submit-sql', sql: 'CHECK VALUE' });
        expect(getReadySnapshot(session).results[0]).toMatchObject({
            type: 'sql',
            res: { result: [{ values: [[1]] }] },
        });
        session.dispose();
    }));

    it.effect('publishes an erroneous reference query as a sample-solution result', () => Effect.gen(function* () {
        const engineFactory: DatabaseEngineFactory = () => ({
            open() {
                return Effect.succeed({
                    exec(sql: string) {
                        return Effect.succeed(sql === 'BROKEN SOLUTION'
                            ? { type: 'error' as const, sql, message: 'Invalid reference SQL' }
                            : successfulSqlResult(sql));
                    },
                    querySchema() {
                        return Effect.succeed([]);
                    },
                    close() {
                        return Effect.void;
                    },
                });
            },
            dispose() {},
        });
        const game = new Game('Broken sample solution', '', '', null, [{
            type: 'select',
            text: 'Select a value',
            sqlSol: 'BROKEN SOLUTION',
            sqlPlaceholder: 'SELECT',
            ordinaryHints: [],
            hasSolHint: false,
            isRowOrderRelevant: true,
            isColOrderRelevant: true,
            areColNamesRelevant: true,
        }]);
        const session = new GameConsoleSession(
            { type: 'object', source: game },
            undefined,
            createTestGamePlatformAdapters(engineFactory),
        );
        yield* session.resolve();
        yield* session.restoreProgress({ curSceneIndex: 0, sceneStatuses: ['task-solved-by-user'] });

        yield* session.dispatch({ type: 'show-solution' });

        expect(getReadySnapshot(session).results[0]).toEqual({
            id: 0,
            type: 'sample-sol',
            res: {
                type: 'error',
                sql: 'BROKEN SOLUTION',
                message: 'Invalid reference SQL',
            },
        });
        session.dispose();
    }));

    it.effect('cancels a sample-solution query and rebuilds at the solved progress', () => Effect.gen(function* () {
        const solutionStarted = yield* Deferred.make<void>();
        const solutionResult = yield* Deferred.make<ReturnType<typeof successfulSqlResult>>();
        let openCount = 0;
        const engineFactory: DatabaseEngineFactory = () => ({
            open() {
                return Effect.sync(() => {
                    const databaseNumber = openCount++;
                    return {
                        exec(sql: string) {
                            if (databaseNumber === 3 && sql === 'SLOW SOLUTION') {
                                return Deferred.succeed(solutionStarted, undefined).pipe(
                                    Effect.zipRight(Deferred.await(solutionResult)),
                                );
                            }
                            else {
                                return Effect.succeed(successfulSqlResult(sql, databaseNumber));
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
        const game = new Game('Cancellable sample solution', '', '', null, [{
            type: 'select',
            text: 'Select a value',
            sqlSol: 'SLOW SOLUTION',
            sqlPlaceholder: 'SELECT',
            ordinaryHints: [],
            hasSolHint: false,
            isRowOrderRelevant: true,
            isColOrderRelevant: true,
            areColNamesRelevant: true,
        }]);
        const session = new GameConsoleSession(
            { type: 'object', source: game },
            undefined,
            createTestGamePlatformAdapters(engineFactory),
        );
        yield* session.resolve();
        const solvedProgress = { curSceneIndex: 0, sceneStatuses: ['task-solved-by-user'] as const };
        yield* session.restoreProgress({
            curSceneIndex: solvedProgress.curSceneIndex,
            sceneStatuses: [...solvedProgress.sceneStatuses],
        });

        const command = yield* Effect.fork(session.dispatch({ type: 'show-solution' }));
        yield* Deferred.await(solutionStarted);
        expect(getReadySnapshot(session).commandStatus).toEqual({
            kind: 'running',
            command: { type: 'show-solution' },
        });
        session.cancelRunningCommand();
        yield* Fiber.join(command);

        const snapshot = getReadySnapshot(session);
        expect(snapshot.progress).toEqual(solvedProgress);
        expect(snapshot.results).toHaveLength(1);
        expect(snapshot.results[0]).toMatchObject({
            type: 'database-reset-notice',
            sceneIndex: 0,
            trigger: 'cancellation',
        });
        expect(openCount).toBe(6);
        session.dispose();
    }));

    it.effect('drops a concurrent command while another command holds the session permit', () => Effect.gen(function* () {
        const session = createSession();
        yield* session.resolve();

        const firstNext = yield* Effect.fork(session.dispatch({ type: 'next-scene', origin: 'navbar' }));
        yield* Effect.yieldNow();
        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        yield* Fiber.join(firstNext);

        expect(yield* getProgress(session)).toEqual({
            curSceneIndex: 1,
            sceneStatuses: ['nontask-seen', 'task-unsolved', 'nontask-unseen'],
        });
        expect(getReadySnapshot(session).commandStatus).toEqual({ kind: 'idle' });
    }));

    it.effect('publishes running and idle states around a command', () => Effect.gen(function* () {
        const session = createSession();
        yield* session.resolve();
        const statuses: string[] = [];
        const unsubscribe = session.subscribe(() => {
            statuses.push(getReadySnapshot(session).commandStatus.kind);
        });

        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        unsubscribe();

        expect(statuses[0]).toBe('running');
        expect(statuses.at(-1)).toBe('idle');
    }));

    it.effect('cancels SQL by rebuilding both databases at the pre-command progress', () => Effect.gen(function* () {
        // Coordinate the outer test body with the forked SQL execution without relying on real-time delays:
        // sqlStarted is a one-shot signal from the fake exec('LONG') call to the outer test body.
        // sqlResult is a gate that the forked execution awaits; the outer test intentionally never opens it.
        const sqlStarted = yield* Deferred.make<void>();
        const sqlResult = yield* Deferred.make<ReturnType<typeof successfulSqlResult>>();

        // Number every opened connection so the assertions can distinguish the original databases from the rebuilt ones.
        // The game console opens a player database and a reference database for each runtime.
        let openCount = 0;
        const engineFactory: DatabaseEngineFactory = () => ({
            open() {
                return Effect.sync(() => {
                    const databaseNumber = openCount++;
                    return {
                        exec(sql: string) {
                            // This code runs as part of the session command forked below. Hold LONG open only on the original
                            // player database (number 0): first notify the outer test body that execution has definitely
                            // started, then wait for a result which the outer test intentionally never supplies.
                            if (databaseNumber === 0 && sql === 'LONG') {
                                return Deferred.succeed(sqlStarted, undefined).pipe(
                                    Effect.zipRight(Deferred.await(sqlResult)),
                                );
                            }
                            else {
                                // Include the connection number in successful results so the final assertion can prove that
                                // the later AFTER command runs against the rebuilt player database (number 2).
                                return Effect.succeed(successfulSqlResult(sql, databaseNumber));
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
        const game = new Game('Cancellation', '', '', null, [{ type: 'text', text: 'Scene' }]);
        const session = new GameConsoleSession(
            { type: 'object', source: game },
            undefined,
            createTestGamePlatformAdapters(engineFactory),
        );
        yield* session.resolve();
        yield* session.dispatch({ type: 'submit-sql', sql: 'HISTORY' });
        const progressBeforeCommand = getReadySnapshot(session).progress;

        // Run the session command in a separate fiber so the outer test body can act while exec('LONG') is pending.
        const command = yield* Effect.fork(session.dispatch(
            { type: 'submit-sql', sql: 'LONG' },
        ));
        // Wait for the signal sent inside exec('LONG'), then cancel the still-pending forked command.
        yield* Deferred.await(sqlStarted);
        session.cancelRunningCommand();
        yield* Fiber.join(command);

        const snapshot = getReadySnapshot(session);
        expect(snapshot.progress).toEqual(progressBeforeCommand);
        expect(snapshot.results).toHaveLength(2);
        expect(snapshot.results[0]).toMatchObject({
            type: 'database-reset-notice',
            sceneIndex: 0,
            trigger: 'cancellation',
        });
        expect(snapshot.results[1]).toMatchObject({ type: 'sql', res: { sql: 'HISTORY' } });
        expect(openCount).toBe(4);

        yield* session.dispatch({ type: 'submit-sql', sql: 'AFTER' });
        expect(getReadySnapshot(session).results[0]).toMatchObject({
            type: 'sql',
            res: { result: [{ values: [[2]] }] },
        });
        session.dispose();
    }));

    it('disposes its retained SQL editor model', () => {
        const session = createSession();
        const disposeModel = vi.fn();
        registerCodeEditorModel(session.sqlEditorURI, disposeModel);

        session.dispose();
        session.dispose();

        expect(disposeModel).toHaveBeenCalledOnce();
    });
});

function successfulSqlResult(sql: string, value: number = 1) {
    return {
        type: 'succ' as const,
        sql,
        result: [{ columns: ['value'], values: [[value]] }],
    };
}

function createTestGamePlatformAdapters(databaseEngineFactory: DatabaseEngineFactory): GamePlatformAdapters {
    return {
        databaseEngineFactory,
        supportedDatabaseSystems: ['sqlite'],
        xmlParser: testGamePlatformAdapters.xmlParser,
    };
}
