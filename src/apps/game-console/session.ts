import { Deferred, Effect, Option } from 'effect';

import { loadGameWithInfo } from '../../game/loader';
import type { GameSource, LoadGameFail } from '../../game/loader';
import type { GamePackageInfo } from '../../game/package';
import { Game } from '../../game/model';
import { fingerprintGame } from '../../game/fingerprint';
import { areSqlTablesEquivalent } from '../../game/result-equivalence';
import type { DatabaseConnection, DatabaseEngine, DatabaseEngineFail, DatabaseEngineFactory, InitDbFail, SqlResult } from '../../database/api';
import { truncateSqlResultRowsPerTable } from '../../database/result';
import { assert, unknownErrorToString } from '../../util';
import type { Schema } from '../../schema/model';
import type { ParseSchemaFail, SchemaStatus } from '../../schema/status';
import { disposeCodeEditorModel, makeCodeEditorURI } from '../../gui-helpers/code-editor/uri';
import type { CodeEditorURI } from '../../gui-helpers/code-editor/uri';
import {
    createInitialSceneStatuses,
    createReplayEffects,
    getCurScene,
    getCurSceneStatus,
    hasNextScene,
    isGameProgressCompatible,
    isCurSceneUnsolvedTask,
    isFinished,
    transitionToNextScene,
    transitionToPreviousScene,
    transitionToResetSolutionHint,
    transitionToSkippedScene,
    transitionToSolvedScene,
    transitionToSolutionHintedScene,
} from './game-progress';
import type { GameProgress, GameProgressEffect, GameProgressTransition } from './game-progress';
import type { XmlParser } from '../../game/xml/model';
import type { GamePlatformAdapters } from '../../platform/game';
import type { CommandStatus } from '../../session-command';
import type { DatabaseSystem } from '../../database/system';
import { defaultSettingsStore } from '../../settings/store';
import type { SettingsStore } from '../../settings/store';


// A user-requested operation for the game console session to perform.
export type GameConsoleCommand =
    | { type: 'restart' }
    | { type: 'previous-scene' }
    | { type: 'next-scene', origin: 'navbar' | 'scene-content' }
    | { type: 'skip-scene' }
    | { type: 'submit-sql', sql: string }
    | { type: 'reset-db-in-current-scene' }
    | { type: 'show-ordinary-hint' }
    | { type: 'show-solution-hint' }
    | { type: 'reset-solution-hint' }
    | { type: 'show-solution' };

// The current command-execution state of the session.
// This will trigger spinner / block further commands in the UI
export type GameConsoleCommandStatus = CommandStatus<GameConsoleCommand>;

export type GameResultCorrect = { type: 'correct', res: SqlResult };
export type GameResultMiss = { type: 'miss', res: SqlResult };
export type GameResultSql = { type: 'sql', res: SqlResult };
export type GameResultSampleSol = { type: 'sample-sol', res: SqlResult };
export type GameResultSolHint = { type: 'sol-hint', res: SqlResult };
export type GameResultOrdinaryHintSelect = { type: 'ordinary-hint-select', expectedResult: SqlResult };
export type GameResultOrdinaryHintManipulate = { type: 'ordinary-hint-manipulate', checkResult: SqlResult };

export type GameResult =
    | GameResultCorrect
    | GameResultMiss
    | GameResultSql
    | GameResultSampleSol
    | GameResultSolHint
    | GameResultOrdinaryHintSelect
    | GameResultOrdinaryHintManipulate;

export type DatabaseResetNotice = {
    type: 'database-reset-notice',
    sceneIndex: number,
    trigger: 'manual' | 'cancellation',
};

type ResultEntryContent =
    | GameResult
    | DatabaseResetNotice;

export type ResultEntry = { id: number } & ResultEntryContent;

// A failure that prevents the session from being usable. Fatal and unrecoverable.
export type GameConsoleSessionError =
    | LoadGameFail
    | InitDbFail
    | {
        kind: 'unexpected',
        details: string,
    };
    
// The complete UI-facing session state at one point in time.
export type GameConsoleSessionSnapshot =
    | { kind: 'loading' }
    | { kind: 'failed', error: GameConsoleSessionError }
    | {
        kind: 'ready',
        game: Game,
        packageInfo?: GamePackageInfo,
        gameFingerprint: string | null,
        progress: GameProgress,
        schemaStatus: SchemaStatus,
        results: ResultEntry[],
        // Requests a programmatic SQL editor update; revision distinguishes repeated requests for the same value.
        editor: {
            value: string,
            revision: number,
        },
        commandStatus: GameConsoleCommandStatus,
    };

// The private operational state: player progress, live databases, and result caches.
type GameRuntime = {
    engine: DatabaseEngine,
    progress: GameProgress,
    userDb: DatabaseConnection,
    refDb: DatabaseConnection,
    // Cache for solutions
    curReferenceSolutionResults: SqlResult | null,
    curReferenceCheckResults: SqlResult | null,
};

// Tracks the runtime while its database is being opened, allowing the engine
// to be disposed even before construction completes.
type GameRuntimeState =
    | { kind: 'empty' }
    | { kind: 'preparing', engine: DatabaseEngine }
    | { kind: 'ready', runtime: GameRuntime };

// Cancellation bookkeeping for the command currently executing, including
// its signal and pre-command restore point.
type ActiveGameConsoleCommandCancellation = {
    signal: Deferred.Deferred<void>,
    restorePoint: Extract<GameConsoleSessionSnapshot, { kind: 'ready' }>,
    requested: boolean,
};

// A callback invoked whenever the published session snapshot changes.
type Listener = () => void;

// Instructions for publishing the result and editor changes of a successful command.
type CommandOutcome = {
    result?: ResultEntryContent,
    clearResults?: boolean,
    editor: 'unchanged' | 'current-scene' | 'clear',
};

export class GameConsoleSession {
    readonly sqlEditorURI: CodeEditorURI

    private readonly source: GameSource;
    private readonly initiallySkipFirstScenes: number | undefined;
    private readonly databaseEngineFactory: DatabaseEngineFactory;
    private readonly supportedDatabaseSystems: readonly DatabaseSystem[];
    private readonly xmlParser: XmlParser;
    private readonly settingsStore: SettingsStore;
    private readonly commandSemaphore = Effect.unsafeMakeSemaphore(1);
    // The cached initialization effect runs at most once; all resolve() calls share
    // its completion instead of rebuilding the session.
    private readonly resolution: Effect.Effect<void, GameConsoleSessionError>;
    // Internal game runtime
    private game!: Game;
    private runtimeState: GameRuntimeState = { kind: 'empty' };
    // Records that cleanup has begun so no further session work is performed.
    private disposed = false;

    private snapshot: GameConsoleSessionSnapshot = { kind: 'loading' };
    private readonly listeners = new Set<Listener>();
    private nextResultId = 0;
    // Needed to restore the session after cancelling a command; null unless a
    // cancellable command is currently running or rebuilding after cancellation.
    private activeCancellation: ActiveGameConsoleCommandCancellation | null = null;

    constructor(
        source: GameSource,
        initiallySkipFirstScenes: number | undefined,
        adapters: GamePlatformAdapters,
        settingsStore: SettingsStore = defaultSettingsStore,
    ) {
        this.sqlEditorURI = makeCodeEditorURI();

        this.source = source;
        this.initiallySkipFirstScenes = initiallySkipFirstScenes;
        this.databaseEngineFactory = adapters.databaseEngineFactory;
        this.supportedDatabaseSystems = adapters.supportedDatabaseSystems;
        this.xmlParser = adapters.xmlParser;
        this.settingsStore = settingsStore;
        this.resolution = Effect.runSync(Effect.cached(this.resolveAndPublishSnapshot()));
    }

    ///////////////////////////////////////////
    // Database requests and object mutation //
    ///////////////////////////////////////////

    /**
     * Loads the game and publishes either a ready or failed snapshot.
     */
    resolve(): Effect.Effect<void, GameConsoleSessionError> {
        return this.resolution;
    }

    getGame(): Effect.Effect<Game, GameConsoleSessionError> {
        return this.resolve().pipe(Effect.map(() => this.game));
    }

    getGameProgress(): Effect.Effect<GameProgress, GameConsoleSessionError> {
        return this.resolve().pipe(Effect.map(() => copyGameProgress(this.runtime.progress)));
    }

    restoreProgress(progress: GameProgress): Effect.Effect<void> {
        return Effect.gen(this, function* () {
            yield* this.resolve();
            if (this.snapshot.kind === 'ready'
                && !this.disposed
                && isGameProgressCompatible(this.game, progress)) {
                yield* this.navigateToProgress(copyGameProgress(progress));
                const schemaStatus = yield* this.querySchemaStatus(this.runtime.refDb);
                const restoredProgress = copyGameProgress(this.runtime.progress);
                this.publishSnapshot({
                    ...this.snapshot,
                    progress: restoredProgress,
                    schemaStatus,
                    results: [],
                    editor: {
                        value: getEditorValueForCurrentScene(this.game, restoredProgress),
                        revision: this.snapshot.editor.revision + 1,
                    },
                    commandStatus: { kind: 'idle' },
                });
            }
        }).pipe(
            Effect.catchAllDefect(cause => Effect.fail({
                kind: 'unexpected' as const,
                details: unknownErrorToString(cause),
            })),
            Effect.tapError(error => Effect.sync(() => {
                this.publishSnapshot({ kind: 'failed', error });
            })),
            Effect.catchAll(() => Effect.void),
        );
    }

    getSchema(): Effect.Effect<Schema, GameConsoleSessionError | ParseSchemaFail> {
        return this.resolve().pipe(Effect.flatMap(() => {
            assert(this.snapshot.kind === 'ready', 'Game session is not ready');
            if (this.snapshot.schemaStatus.kind === 'loaded') {
                return Effect.succeed(this.snapshot.schemaStatus.data);
            }
            else if (this.snapshot.schemaStatus.kind === 'failed') {
                return Effect.fail(this.snapshot.schemaStatus.error);
            }
            else if (this.snapshot.schemaStatus.kind === 'pending') {
                return Effect.die(new Error('Game schema is still pending after session resolution'));
            }
            else { const _n: never = this.snapshot.schemaStatus; return _n; }
        }));
    }

    getSnapshot(): GameConsoleSessionSnapshot {
        return this.snapshot;
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    removeResult(id: number): void {
        this.updateReadySnapshot(snapshot => ({
            ...snapshot,
            results: snapshot.results.filter(entry => entry.id !== id),
        }));
    }

    dispatch(command: GameConsoleCommand): Effect.Effect<void> {
        return Effect.gen(this, function* () {
            yield* this.resolve().pipe(Effect.catchAll(() => Effect.void));
            if (this.snapshot.kind !== 'ready' || this.disposed) {
                return;
            }

            const previousSnapshot = this.snapshot;
            const commandCancellable = isGameSessionCommandCancellable(command);
            // Lifecycle: initialize cancellation if supported, publish running, execute, then settle.
            const operation = Effect.gen(this, function* () {
                // 1. Create the cancellation signal before publishing the running command.
                const cancellation = commandCancellable
                    ? yield* this.createCommandCancellation(previousSnapshot)
                    : null;
                // Only commands with a cancellation mechanism expose active cancellation.
                if (cancellation !== null) {
                    this.activeCancellation = cancellation;
                }

                // 2. Publish the running command.
                yield* Effect.sync(() => {
                    this.updateReadySnapshot(snapshot => ({
                        ...snapshot,
                        commandStatus: {
                            kind: 'running',
                            command,
                        },
                    }));
                });
                // Let subscribers render the running state before work begins.
                yield* Effect.yieldNow();

                // 3. Execute, optionally racing against the cancellation signal.
                const completed = this.executeCommand(command).pipe(
                    Effect.map(outcome => ({ kind: 'completed' as const, outcome })),
                    Effect.catchAllCause(cause => cancellation?.requested === true
                        ? Effect.succeed({ kind: 'cancelled' as const })
                        : Effect.failCause(cause)),
                );
                const execution = cancellation === null
                    ? yield* completed
                    : yield* Effect.raceFirst(
                        completed,
                        Deferred.await(cancellation.signal).pipe(
                            Effect.map(() => ({ kind: 'cancelled' as const })),
                        ),
                    );

                if (execution.kind === 'completed') {
                    // 4a. Publish the successful command outcome.
                    yield* Effect.sync(() => this.publishCommandOutcome(execution.outcome));
                }
                else if (execution.kind === 'cancelled') {
                    if (cancellation === null) {
                        return yield* Effect.die(new Error('A non-cancellable command was cancelled'));
                    }
                    else {
                        // 4b. Rebuild both databases from the game source at the pre-command progress.
                        const schemaStatus = yield* this.rebuildDatabasesAfterCancellation(cancellation.restorePoint);
                        yield* Effect.sync(() => {
                            this.publishSnapshot({
                                ...cancellation.restorePoint,
                                schemaStatus,
                                results: [
                                    {
                                        id: this.nextResultId++,
                                        type: 'database-reset-notice',
                                        sceneIndex: cancellation.restorePoint.progress.curSceneIndex,
                                        trigger: 'cancellation',
                                    },
                                    ...cancellation.restorePoint.results,
                                ],
                                commandStatus: { kind: 'idle' },
                            });
                        });
                    }
                }
                else { const _n: never = execution; return _n; }
            }).pipe(
                Effect.catchAllDefect(cause => Effect.fail(cause)),
                Effect.mapError(cause => ({
                    kind: 'unexpected' as const,
                    details: unknownErrorToString(cause),
                })),
                // Infrastructure and reconstruction failures make the whole session unusable.
                Effect.tapError(error => Effect.sync(() => {
                    this.publishSnapshot({ kind: 'failed', error });
                })),
                // Replace running with idle after success; a fatal snapshot is left untouched.
                Effect.ensuring(Effect.sync(() => {
                    this.activeCancellation = null;
                    this.updateReadySnapshot(snapshot => snapshot.commandStatus.kind === 'running'
                        ? { ...snapshot, commandStatus: { kind: 'idle' } }
                        : snapshot);
                })),
                // The snapshot now represents any failure, so dispatch itself completes successfully.
                Effect.catchAll(() => Effect.void),
            );

            // Run only if no other command holds the semaphore; otherwise discard this command.
            const result = yield* this.commandSemaphore.withPermitsIfAvailable(1)(operation);
            if (Option.isNone(result)) {
                return;
            }
        });
    }

    cancelRunningCommand(): void {
        const cancellation = this.activeCancellation;
        if (this.snapshot.kind === 'ready'
            && this.snapshot.commandStatus.kind === 'running'
            && isGameSessionCommandCancellable(this.snapshot.commandStatus.command)
            && cancellation !== null) {
            const cancelledCommand = this.snapshot.commandStatus.command;
            cancellation.requested = true;
            this.updateReadySnapshot(snapshot => snapshot.commandStatus.kind === 'running'
                ? {
                    ...snapshot,
                    commandStatus: {
                        kind: 'rebuilding-after-cancellation',
                        cancelledCommand,
                    },
                }
                : snapshot);
            this.runtime.engine.dispose();
            this.runtimeState = { kind: 'empty' };
            Effect.runSync(Deferred.succeed(cancellation.signal, undefined));
        }
    }

    private resolveAndPublishSnapshot(): Effect.Effect<void, GameConsoleSessionError> {
        return Effect.gen(this, function* () {
            const loaded = yield* loadGameWithInfo(this.source, this.xmlParser);
            const game = loaded.game;
            this.game = game;
            const gameFingerprint = yield* Effect.tryPromise({
                try: () => fingerprintGame(game),
                catch: error => error,
            }).pipe(Effect.catchAll(error => Effect.sync(() => {
                console.error('Failed to fingerprint SQL game:', error);
                return null;
            })));
            yield* this.createFreshRuntime(game);

            if (this.initiallySkipFirstScenes !== undefined) {
                yield* this.skipMultipleScenes(game, this.initiallySkipFirstScenes, this.runtime);
            }

            const schemaStatus: SchemaStatus = yield* this.runtime.refDb.querySchema().pipe(
                Effect.matchEffect({
                    onFailure: error => error.kind === 'parse-schema'
                        ? Effect.succeed({ kind: 'failed' as const, error })
                        : Effect.fail(error),
                    onSuccess: schema => Effect.succeed({ kind: 'loaded' as const, data: schema }),
                }),
            );

            const progress = copyGameProgress(this.runtime.progress);
            this.publishSnapshot({
                kind: 'ready',
                game,
                ...(loaded.packageInfo === undefined ? {} : { packageInfo: loaded.packageInfo }),
                gameFingerprint,
                progress,
                schemaStatus,
                results: [],
                editor: {
                    value: getEditorValueForCurrentScene(game, progress),
                    revision: 0,
                },
                commandStatus: { kind: 'idle' },
            });
        }).pipe(
            Effect.catchAllDefect(cause => Effect.fail({
                kind: 'unexpected' as const,
                details: String(cause),
            })),
            Effect.tapError(error => Effect.sync(() => {
                this.publishSnapshot({ kind: 'failed', error });
            })),
        );
    }

    private executeCommand(command: GameConsoleCommand): Effect.Effect<CommandOutcome, InitDbFail> {
        return Effect.gen(this, function* () {
            switch (command.type) {
                case 'restart':
                    yield* this.onRestart();
                    return { clearResults: true, editor: 'current-scene' };
                case 'previous-scene':
                    yield* this.onPreviousScene();
                    return { editor: 'current-scene' };
                case 'next-scene':
                    yield* this.onNextScene();
                    return { editor: 'current-scene' };
                case 'skip-scene':
                    yield* this.onSkipScene();
                    return { editor: 'current-scene' };
                case 'submit-sql': {
                    const result = yield* this.onSubmitSql(command.sql);
                    if (result.type !== 'correct') {
                        return { result, editor: 'unchanged' };
                    }

                    const progress = copyGameProgress(this.runtime.progress);

                    return {
                        result,
                        editor: isFinished(this.game, progress) ? 'clear' : 'current-scene',
                    };
                }
                case 'reset-db-in-current-scene':
                    yield* this.onResetDbInCurScene();
                    return {
                        result: {
                            type: 'database-reset-notice',
                            sceneIndex: this.runtime.progress.curSceneIndex,
                            trigger: 'manual',
                        },
                        editor: 'unchanged',
                    };
                case 'show-ordinary-hint':
                    return { result: yield* this.onShowOrdinaryHint(), editor: 'unchanged' };
                case 'show-solution-hint':
                    return { result: yield* this.onShowSolutionHint(), editor: 'unchanged' };
                case 'reset-solution-hint':
                    yield* this.onResetSolutionHint();
                    return { editor: 'unchanged' };
                case 'show-solution':
                    return { result: yield* this.onShowSolution(), editor: 'unchanged' };
                default: {
                    const _n: never = command;
                    return _n;
                }
            }
        });
    }

    private publishCommandOutcome(outcome: CommandOutcome): void {
        const progress = copyGameProgress(this.runtime.progress);
        const retainedResult = outcome.result === undefined
            ? undefined
            : truncateResultEntryContent(
                outcome.result,
                this.settingsStore.getSnapshot().maxDisplayedResultRowsPerTable,
            );

        this.updateReadySnapshot(snapshot => {
            const results: ResultEntry[] = outcome.clearResults ? [] : [...snapshot.results];
            if (retainedResult !== undefined) {
                results.unshift({ id: this.nextResultId++, ...retainedResult });
            }

            const editor = outcome.editor === 'unchanged'
                ? snapshot.editor
                : {
                    value: outcome.editor === 'clear'
                        ? ''
                        : getEditorValueForCurrentScene(this.game, progress),
                    revision: snapshot.editor.revision + 1,
                };

            return {
                ...snapshot,
                progress,
                results,
                editor,
            };
        });
    }

    private createCommandCancellation(
        snapshot: Extract<GameConsoleSessionSnapshot, { kind: 'ready' }>,
    ): Effect.Effect<ActiveGameConsoleCommandCancellation> {
        return Effect.gen(this, function* () {
            const signal = yield* Deferred.make<void>();
            return {
                signal,
                requested: false,
                restorePoint: snapshot,
            };
        });
    }

    private rebuildDatabasesAfterCancellation(
        restorePoint: Extract<GameConsoleSessionSnapshot, { kind: 'ready' }>,
    ): Effect.Effect<SchemaStatus, InitDbFail> {
        return Effect.gen(this, function* () {
            yield* this.createRuntimeAtProgressWithNewEngine(this.game, restorePoint.progress);
            return yield* this.querySchemaStatus(this.runtime.refDb);
        });
    }

    private querySchemaStatus(database: DatabaseConnection): Effect.Effect<SchemaStatus, DatabaseEngineFail> {
        return database.querySchema().pipe(
            Effect.matchEffect({
                onFailure: error => error.kind === 'parse-schema'
                    ? Effect.succeed({ kind: 'failed' as const, error })
                    : Effect.fail(error),
                onSuccess: schema => Effect.succeed({ kind: 'loaded' as const, data: schema }),
            }),
        );
    }

    private publishSnapshot(snapshot: GameConsoleSessionSnapshot): void {
        if (this.disposed) {
            return;
        }

        this.snapshot = snapshot;
        for (const listener of this.listeners) {
            listener();
        }
    }

    private updateReadySnapshot(update: (snapshot: Extract<GameConsoleSessionSnapshot, { kind: 'ready' }>) => Extract<GameConsoleSessionSnapshot, { kind: 'ready' }>): void {
        if (this.snapshot.kind !== 'ready') {
            return;
        }

        const nextSnapshot = update(this.snapshot);
        if (nextSnapshot !== this.snapshot) {
            this.publishSnapshot(nextSnapshot);
        }
    }


    /////////////////////////////
    // Command implementations //
    /////////////////////////////

    private onRestart(): Effect.Effect<void, InitDbFail> {
        return this.resetRuntime(this.game);
    }

    private onPreviousScene(): Effect.Effect<void, InitDbFail> {
        return Effect.gen(this, function* () {
            const transition = transitionToPreviousScene(this.game, this.runtime.progress);
            yield* this.navigateToProgress(transition.progress);
        });
    }

    private onNextScene(): Effect.Effect<void, DatabaseEngineFail> {
        return this.applyTransition(this.game, this.runtime, transitionToNextScene(this.game, this.runtime.progress));
    }

    private onSkipScene(): Effect.Effect<void, DatabaseEngineFail> {
        return this.applyTransition(this.game, this.runtime, transitionToSkippedScene(this.game, this.runtime.progress));
    }

    private onSubmitSql(sql: string): Effect.Effect<GameResultCorrect | GameResultMiss | GameResultSql, DatabaseEngineFail> {
        return Effect.gen(this, function* () {
            const game = this.game;
            const runtime = this.runtime;
            const userDb = runtime.userDb;

            // Execute SQL on `userDb`
            const userResults = yield* userDb.exec(sql);

            const sceneStatus = getCurSceneStatus(runtime.progress);
            switch (sceneStatus) {
                case 'task-unsolved':
                case 'task-skipped':
                    break;
                case 'task-solved-by-user':
                case 'task-solved-by-sol-hint':
                case 'nontask-unseen':
                case 'nontask-seen':
                    return { type: 'sql', res: userResults };
                default: {
                    const _n: never = sceneStatus; return _n;
                }
            }

            const curScene = getCurScene(game, runtime.progress);
            assert(curScene.type === 'select' || curScene.type === 'manipulate', 'A non-solved task must be a task scene');

            // Compare

            // "select": Check whether the user's solution matches the reference solution
            if (curScene.type === 'select') {
                // Query `referenceDb`
                const refResults = yield* this.getReferenceSolutionResults();

                // Case 1: User and db both failed. In which manner, does not matter.
                if (userResults.type === 'error' && refResults.type === 'error') {
                    // Solved
                    yield* this.markSceneSolved(game, runtime);

                    // Return result
                    return { type: 'correct', res: userResults };
                }
                // Case 2: Both succeeded
                else if (userResults.type === 'succ' && refResults.type === 'succ') {
                    const userTables = userResults.result;
                    const refTables = refResults.result;

                    // Case 2.1: Number of tables don't match
                    if (userTables.length != refTables.length) {
                        // Failed
                        // Return result
                        return { type: 'miss', res: userResults };
                    }

                    // Check each table
                    let correct = true;

                    for (let i = 0; i < userTables.length; i++) {
                        correct = correct && areSqlTablesEquivalent(userTables[i], refTables[i], {
                            isRowOrderRelevant: curScene.isRowOrderRelevant,
                            isColOrderRelevant: curScene.isColOrderRelevant,
                            areColNamesRelevant: curScene.areColNamesRelevant,
                        });
                    }

                    // Case 2.2: Not all tables match
                    if (!correct) {
                        // Return result
                        return { type: 'miss', res: userResults };
                    }

                    // Case 2.3: Match
                    // Solved
                    yield* this.markSceneSolved(game, runtime);
                    // Return result
                    return { type: 'correct', res: userResults };
                }
                // Case 3: User failed
                else if (userResults.type === 'error') {
                    // Return result
                    return { type: 'miss', res: userResults };
                }
                // Case 4: User succeeded
                else {
                    // Return result
                    return { type: 'miss', res: userResults };
                }
            }
            // "manipulate":
            else {
                // Query `userDb` to check
                const userCheckResults = yield* userDb.exec(curScene.sqlCheck);

                // Query `refDb` to check
                const refCheckResults = yield* this.getReferenceCheckResults();

                // Case 1: Check on both user db and ref db failed. In which manner, does not matter.
                if (userCheckResults.type === 'error' && refCheckResults.type === 'error') {
                    // Solved
                    yield* this.markSceneSolved(game, runtime);

                    // Return result
                    return { type: 'correct', res: userResults };
                }
                // Case 2: Check on both dbs succeeded
                else if (userCheckResults.type === 'succ' && refCheckResults.type === 'succ') {
                    const userCheckTables = userCheckResults.result;
                    const refCheckTables = refCheckResults.result;

                    // Case 2.1: Number of tables don't match
                    if (userCheckTables.length != refCheckTables.length) {
                        // Failed
                        // Return result
                        return { type: 'miss', res: userResults };
                    }

                    // Check each table
                    let correct = true;
                    for (let i = 0; i < userCheckTables.length; i++) {
                        correct = correct && areSqlTablesEquivalent(userCheckTables[i], refCheckTables[i], {
                            isRowOrderRelevant: false,
                            isColOrderRelevant: true,
                            areColNamesRelevant: true,
                        });
                    }

                    // Case 2.2: Not all tables match
                    if (!correct) {
                        // Return result
                        return { type: 'miss', res: userResults };
                    }

                    // Case 2.3: Match
                    // Solved
                    yield* this.markSceneSolved(game, runtime);
                    // Return result
                    return { type: 'correct', res: userResults };
                }
                // Case 3: User failed
                else if (userCheckResults.type === 'error') {
                    // Return result
                    return { type: 'miss', res: userResults };
                }
                // Case 4: User succeeded
                else {
                    // Return result
                    return { type: 'miss', res: userResults };
                }
            }
        });
    }

    private onResetDbInCurScene(): Effect.Effect<void, InitDbFail> {
        return this.navigateToProgress(copyGameProgress(this.runtime.progress));
    }

    private onShowOrdinaryHint(): Effect.Effect<GameResult, DatabaseEngineFail> {
        return Effect.gen(this, function* () {
            const game = this.game;

            assert(isCurSceneUnsolvedTask(game, this.runtime.progress), 'Current scene is not an unsolved task');

            // 'select' scene
            if (getCurScene(game, this.runtime.progress).type === 'select') {
                const refResults = yield* this.getReferenceSolutionResults();
                return {
                    type: 'ordinary-hint-select',
                    expectedResult: refResults,
                };
            }
            // 'manipulate' scene
            else {
                const refResults = yield* this.getReferenceCheckResults();
                return {
                    type: 'ordinary-hint-manipulate',
                    checkResult: refResults,
                };
            }
        });
    }

    private onShowSolution(): Effect.Effect<GameResultSampleSol, DatabaseEngineFail> {
        return Effect.gen(this, function* () {
            const game = this.game;
            const progress = this.runtime.progress;
            const scene = getCurScene(game, progress);

            assert(getCurSceneStatus(progress) === 'task-solved-by-user', 'Current scene is not a solved task');

            if (scene.type === 'select') {
                const result = yield* this.getReferenceSolutionResults();
                return {
                    type: 'sample-sol',
                    res: result,
                };
            }
            else if (scene.type === 'manipulate') {
                const result = yield* this.getReferenceCheckResults();
                return {
                    type: 'sample-sol',
                    res: result,
                };
            }
            else {
                return yield* Effect.die(new Error('A solved task must be a task scene'));
            }
        });
    }

    private onShowSolutionHint(): Effect.Effect<GameResultSolHint, DatabaseEngineFail> {
        return Effect.gen(this, function* () {
            const game = this.game;
            const progress = this.runtime.progress;
            const scene = getCurScene(game, progress);

            assert(isCurSceneUnsolvedTask(game, progress), 'Current scene is not an unsolved task');
            assert(scene.type === 'select' || scene.type === 'manipulate', 'A solution hint requires a task scene');
            assert(scene.hasSolHint, 'Current scene has no solution hint');

            const result = yield* this.getReferenceSolutionResults();
            yield* this.applyTransition(game, this.runtime, transitionToSolutionHintedScene(game, progress));
            return {
                type: 'sol-hint',
                res: result,
            };
        });
    }

    private onResetSolutionHint(): Effect.Effect<void, InitDbFail> {
        const transition = transitionToResetSolutionHint(this.game, this.runtime.progress);
        return this.navigateToProgress(transition.progress);
    }

    //////////////////////////////////////////////////////////////
    // Private: Manipulate progress and keep in sync with dbs //
    //////////////////////////////////////////////////////////////

    // These operations are only invoked while the session snapshot is ready.

    private getReferenceSolutionResults(): Effect.Effect<SqlResult, DatabaseEngineFail> {
        return Effect.gen(this, function* () {
            const game = this.game;
            const runtime = this.runtime;

            if (runtime.curReferenceSolutionResults === null) {
                const curScene = getCurScene(game, runtime.progress);

                if (curScene.type === 'select') {
                    const result = yield* runtime.refDb.exec(curScene.sqlSol);
                    runtime.curReferenceSolutionResults = result;
                }
                else if (curScene.type === 'manipulate') {
                    return yield* Effect.die(new Error('The current manipulate solution result was not cached while preparing its reference database'));
                }
                else {
                    return yield* Effect.die(new Error('A reference solution result requires a task scene'));
                }
            }

            assert(runtime.curReferenceSolutionResults !== null);
            return runtime.curReferenceSolutionResults;
        });
    }

    private getReferenceCheckResults(): Effect.Effect<SqlResult, DatabaseEngineFail> {
        return Effect.gen(this, function* () {
            const game = this.game;
            const runtime = this.runtime;

            if (runtime.curReferenceCheckResults === null) {
                const curScene = getCurScene(game, runtime.progress);

                // Assertions
                assert(curScene.type === 'manipulate');

                // Query `referenceDb`: Check.
                const result = yield* runtime.refDb.exec(curScene.sqlCheck);

                // Update cache
                runtime.curReferenceCheckResults = result;
            }

            assert(runtime.curReferenceCheckResults !== null);
            return runtime.curReferenceCheckResults;
        });
    }

    private skipMultipleScenes(game: Game, n: number, runtime: GameRuntime): Effect.Effect<void, DatabaseEngineFail> {
        return Effect.gen(this, function* () {
            for (let i = 0; i < n; i++) {
                assert(hasNextScene(game, runtime.progress), 'There is no next scene');

                const sceneStatus = getCurSceneStatus(runtime.progress);
                switch (sceneStatus) {
                    case 'task-unsolved':
                    case 'task-skipped':
                        yield* this.applyTransition(game, runtime, transitionToSkippedScene(game, runtime.progress));
                        break;
                    case 'task-solved-by-user':
                    case 'task-solved-by-sol-hint':
                    case 'nontask-unseen':
                    case 'nontask-seen':
                        yield* this.applyTransition(game, runtime, transitionToNextScene(game, runtime.progress));
                        break;
                    default: {
                        const _n: never = sceneStatus;
                        return _n;
                    }
                }
            }
        });
    }

    private markSceneSolved(game: Game, runtime: GameRuntime): Effect.Effect<void, DatabaseEngineFail> {
        return this.applyTransition(game, runtime, transitionToSolvedScene(game, runtime.progress));
    }

    private applyTransition(game: Game, runtime: GameRuntime, transition: GameProgressTransition): Effect.Effect<void, DatabaseEngineFail> {
        return Effect.gen(this, function* () {
            const sceneChanged = runtime.progress.curSceneIndex !== transition.progress.curSceneIndex;
            if (sceneChanged) {
                runtime.curReferenceSolutionResults = null;
                runtime.curReferenceCheckResults = null;
            }

            yield* this.applyProgressEffects(
                game,
                runtime,
                transition.effects,
                transition.progress.curSceneIndex,
            );
            runtime.progress = copyGameProgress(transition.progress);
        });
    }

    private applyProgressEffects(
        game: Game,
        runtime: GameRuntime,
        effects: GameProgressEffect[],
        cacheSceneIndex: number,
    ): Effect.Effect<void, DatabaseEngineFail> {
        return Effect.gen(function* () {
            for (const effect of effects) {
                const scene = game.scenes[effect.sceneIndex];
                assert(scene.type === 'manipulate', 'Only manipulate scenes have state-changing solutions');

                const database = effect.database === 'user' ? runtime.userDb : runtime.refDb;
                const result = yield* database.exec(scene.sqlSol);
                if (effect.database === 'reference' && effect.sceneIndex === cacheSceneIndex) {
                    runtime.curReferenceSolutionResults = result;
                }
            }
        });
    }

    // The following functions `resetRuntime` and `createFreshRuntime` are only split because `resetRuntime` cannot be used in constructor (limitation of TS's type system).
    private resetRuntime(game: Game): Effect.Effect<void, InitDbFail> {
        return Effect.gen(this, function* () {
            const engine = this.runtime.engine;
            yield* this.closeCurrentRuntime();
            yield* this.prepareRuntimeAtProgress(engine, game, {
                curSceneIndex: 0,
                sceneStatuses: createInitialSceneStatuses(game),
            });
        });
    }

    private navigateToProgress(progress: GameProgress): Effect.Effect<void, InitDbFail> {
        return Effect.gen(this, function* () {
            const engine = this.runtime.engine;
            yield* this.closeCurrentRuntime();
            yield* this.prepareRuntimeAtProgress(engine, this.game, progress);
        });
    }

    private createFreshRuntime(game: Game): Effect.Effect<GameRuntime, InitDbFail> {
        return this.createRuntimeAtProgressWithNewEngine(game, {
            curSceneIndex: 0,
            sceneStatuses: createInitialSceneStatuses(game),
        });
    }

    private createRuntimeAtProgressWithNewEngine(
        game: Game,
        progress: GameProgress,
    ): Effect.Effect<GameRuntime, InitDbFail> {
        if (this.disposed) {
            return Effect.die(new Error('Cannot create a runtime for a disposed game session'));
        }
        else if (!this.supportedDatabaseSystems.includes(game.dbSystem)) {
            return Effect.fail({
                kind: 'unsupported-database-system' as const,
                system: game.dbSystem,
                details: `The available game database engine does not support the ${game.dbSystem} database system`,
            });
        }
        else {
            const engine = this.databaseEngineFactory();
            return this.prepareRuntimeAtProgress(engine, game, progress).pipe(
                Effect.tapError(() => Effect.sync(() => {
                    engine.dispose();
                })),
            );
        }
    }

    private prepareRuntimeAtProgress(
        engine: DatabaseEngine,
        game: Game,
        progress: GameProgress,
    ): Effect.Effect<GameRuntime, InitDbFail> {
        if (this.disposed) {
            return Effect.die(new Error('Cannot prepare a runtime for a disposed game session'));
        }
        else {
            this.runtimeState = { kind: 'preparing', engine };
            return Effect.gen(this, function* () {
                const runtime = yield* this.createRuntimeAtProgress(engine, game, progress);
                if (this.disposed) {
                    engine.dispose();
                    this.runtimeState = { kind: 'empty' };
                    return yield* Effect.die(new Error('Game session was disposed while preparing its runtime'));
                }
                else if (this.runtimeState.kind === 'preparing' && this.runtimeState.engine === engine) {
                    this.runtimeState = { kind: 'ready', runtime };
                    return runtime;
                }
                else {
                    engine.dispose();
                    return yield* Effect.die(new Error('Game runtime state changed while it was being prepared'));
                }
            });
        }
    }

    private createRuntimeAtProgress(
        engine: DatabaseEngine,
        game: Game,
        progress: GameProgress,
    ): Effect.Effect<GameRuntime, InitDbFail> {
        return Effect.gen(this, function* () {
            const userDb = yield* engine.open(game.dbData, game.dbSystem, game.dbSystemMinVersion);
            const refDb = yield* engine.open(game.dbData, game.dbSystem, game.dbSystemMinVersion).pipe(
                Effect.catchAll(error => userDb.close().pipe(
                    Effect.zipRight(Effect.fail(error)),
                )),
            );

            const runtime: GameRuntime = {
                engine,
                progress: copyGameProgress(progress),
                userDb,
                refDb,
                curReferenceSolutionResults: null,
                curReferenceCheckResults: null,
            };

            yield* this.applyProgressEffects(game, runtime, createReplayEffects(game, progress), progress.curSceneIndex).pipe(
                Effect.catchAll(error => Effect.all([
                    runtime.userDb.close(),
                    runtime.refDb.close(),
                ], { concurrency: 'unbounded', discard: true }).pipe(
                    Effect.zipRight(Effect.fail(error)),
                )),
            );

            return runtime;
        });
    }

    private closeCurrentRuntime(): Effect.Effect<void, DatabaseEngineFail> {
        return Effect.all([
            this.runtime.userDb.close(),
            this.runtime.refDb.close(),
        ], { concurrency: 'unbounded', discard: true });
    }

    private get runtime(): GameRuntime {
        if (this.runtimeState.kind === 'ready') {
            return this.runtimeState.runtime;
        }
        else if (this.runtimeState.kind === 'empty') {
            throw new Error('Game session has no runtime');
        }
        else if (this.runtimeState.kind === 'preparing') {
            throw new Error('Game session runtime is still being prepared');
        }
        else { const _n: never = this.runtimeState; return _n; }
    }

    private disposeRuntimeState(): void {
        if (this.runtimeState.kind === 'empty') {
            // There are no runtime resources to dispose.
        }
        else if (this.runtimeState.kind === 'preparing') {
            this.runtimeState.engine.dispose();
        }
        else if (this.runtimeState.kind === 'ready') {
            this.runtimeState.runtime.engine.dispose();
        }
        else { const _n: never = this.runtimeState; }
        this.runtimeState = { kind: 'empty' };
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        disposeCodeEditorModel(this.sqlEditorURI);
        this.disposeRuntimeState();
        this.listeners.clear();
    }
}

export function isGameSessionCommandCancellable(command: GameConsoleCommand): boolean {
    switch (command.type) {
        case 'submit-sql':
        case 'show-ordinary-hint':
        case 'show-solution-hint':
        case 'show-solution':
            return true;
        case 'restart':
        case 'previous-scene':
        case 'next-scene':
        case 'skip-scene':
        case 'reset-db-in-current-scene':
        case 'reset-solution-hint':
            return false;
        default: { const _n: never = command; return _n; }
    }
}

function getEditorValueForCurrentScene(game: Game, progress: GameProgress): string {
    const scene = getCurScene(game, progress);
    if (scene.type === 'select' || scene.type === 'manipulate') {
        return scene.sqlPlaceholder;
    }
    else if (scene.type === 'text' || scene.type === 'image') {
        return '';
    }
    else {
        const _n: never = scene;
        return _n;
    }
}

function copyGameProgress(progress: GameProgress): GameProgress {
    return {
        curSceneIndex: progress.curSceneIndex,
        sceneStatuses: [...progress.sceneStatuses],
    };
}

function truncateResultEntryContent(
    content: ResultEntryContent,
    maximumRowsPerTable: number,
): ResultEntryContent {
    switch (content.type) {
        case 'correct':
        case 'miss':
        case 'sql':
        case 'sample-sol':
        case 'sol-hint':
            return {
                ...content,
                res: truncateSqlResultRowsPerTable(content.res, maximumRowsPerTable),
            };
        case 'ordinary-hint-select':
            return {
                ...content,
                expectedResult: truncateSqlResultRowsPerTable(content.expectedResult, maximumRowsPerTable),
            };
        case 'ordinary-hint-manipulate':
            return {
                ...content,
                checkResult: truncateSqlResultRowsPerTable(content.checkResult, maximumRowsPerTable),
            };
        case 'database-reset-notice':
            return content;
        default: { const _n: never = content; return _n; }
    }
}
