import { Deferred, Effect, Option } from 'effect';
import { v4 as uuidv4 } from 'uuid';

import type {
    DatabaseConnection,
    DatabaseEngine,
    DatabaseEngineFail,
    DatabaseEngineFactory,
    DbData,
    InitDbFail,
    SqlResult,
} from '../../database/api';
import { loadDatabaseWithMetadata, type LoadedDatabase, type LoadDatabaseFail } from '../../database/loader';
import type { DatabasePackageInfo } from '../../database/package';
import type { DbSource } from '../../database/source';
import { truncateSqlResultRowsPerTable } from '../../database/result';
import { createDatabaseEngine } from '../../database/engine';
import type { CodeEditorURI } from '../../gui-helpers/code-editor/uri';
import { disposeCodeEditorModel, makeCodeEditorURI } from '../../gui-helpers/code-editor/uri';
import type { SchemaStatus } from '../../schema/status';
import { defaultSettingsStore } from '../../settings/store';
import type { SettingsStore } from '../../settings/store';
import { unknownErrorToString } from '../../util';
import type { CommandStatus } from '../../session-command';

// A stable identifier for one browser session.
export type BrowserURI = string & { readonly __brand: 'BrowserURI' };

// A user-requested operation for the browser session to perform.
export type BrowserCommand = {
    type: 'execute-sql',
    sql: string,
};

// The current command-execution state of the session.
export type BrowserCommandStatus = CommandStatus<BrowserCommand>;

// A dismissible entry in the results timeline.
export type ResultEntry = { id: number } & (
    | { type: 'sql', result: SqlResult }
    | { type: 'database-reset-notice' }
);

// A failure that prevents the session from being usable. Fatal and unrecoverable.
export type BrowserSessionError =
    | LoadDatabaseFail
    | InitDbFail
    | {
        kind: 'unexpected',
        details: string,
    };

// The complete UI-facing session state at one point in time.
export type BrowserSessionSnapshot =
    | { kind: 'loading' }
    | { kind: 'failed', error: BrowserSessionError }
    | {
        kind: 'ready',
        schemaStatus: SchemaStatus,
        results: ResultEntry[],
        commandStatus: BrowserCommandStatus,
    };

// A callback invoked whenever the published session snapshot changes.
type Listener = () => void;

// The private operational resources used to execute browser commands.
type BrowserRuntime = {
    engine: DatabaseEngine,
    database: DatabaseConnection,
};

// Tracks the runtime while its database is being opened, allowing the engine
// to be disposed even before construction completes.
type BrowserRuntimeState =
    | { kind: 'empty' }
    | { kind: 'preparing', engine: DatabaseEngine }
    | { kind: 'ready', runtime: BrowserRuntime };

// Cancellation bookkeeping for the command currently executing, including
// its signal and pre-command restore point.
type ActiveBrowserCommandCancellation = {
    signal: Deferred.Deferred<void>,
    restorePoint: Extract<BrowserSessionSnapshot, { kind: 'ready' }>,
    requested: boolean,
};

export class BrowserSession {
    readonly uri: BrowserURI;
    readonly sqlEditorURI: CodeEditorURI;

    private readonly filename: string;
    private readonly source: DbSource;
    private readonly databaseEngineFactory: DatabaseEngineFactory;
    private readonly settingsStore: SettingsStore;
    private readonly commandSemaphore = Effect.unsafeMakeSemaphore(1);
    // The cached initialization effect runs at most once; all resolve() calls share
    // its completion instead of rebuilding the session.
    private readonly resolution: Effect.Effect<void, BrowserSessionError>;
    private runtimeState: BrowserRuntimeState = { kind: 'empty' };
    // Records that cleanup has begun so no further session work is performed.
    private disposed = false;
    private snapshot: BrowserSessionSnapshot = { kind: 'loading' };
    private readonly listeners = new Set<Listener>();
    private nextResultId = 0;
    private initialDatabaseData: DbData | null = null;
    private databasePackageInfo: DatabasePackageInfo | null = null;
    // Needed to restore the session after command cancellation; null if no
    // command is currently running or currently rebuilding after cancellation.
    private activeCancellation: ActiveBrowserCommandCancellation | null = null;

    constructor(
        filename: string,
        source: DbSource,
        databaseEngineFactory: DatabaseEngineFactory = createDatabaseEngine,
        settingsStore: SettingsStore = defaultSettingsStore,
    ) {
        this.uri = makeBrowserURI(`inmemory:///${uuidv4()}.txt`);
        this.sqlEditorURI = makeCodeEditorURI();
        this.filename = filename;
        this.source = source;
        this.databaseEngineFactory = databaseEngineFactory;
        this.settingsStore = settingsStore;
        this.resolution = Effect.runSync(Effect.cached(this.resolveAndPublishSnapshot()));
    }

    getFilename(): string {
        return this.filename;
    }

    getSnapshot(): BrowserSessionSnapshot {
        return this.snapshot;
    }

    getDatabasePackageInfo(): DatabasePackageInfo | null {
        return this.databasePackageInfo;
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    resolve(): Effect.Effect<void, BrowserSessionError> {
        return this.resolution;
    }

    dispatch(command: BrowserCommand): Effect.Effect<void> {
        return Effect.gen(this, function* () {
            yield* this.resolve().pipe(Effect.catchAll(() => Effect.void));
            if (this.snapshot.kind !== 'ready' || this.disposed) {
                return;
            }

            const previousSnapshot = this.snapshot;
            // Lifecycle: publish running, execute, reconstruct after cancellation if needed, then settle.
            const operation = Effect.gen(this, function* () {
                // 1. Create the cancellation signal before publishing the running command.
                this.getReadyRuntime();
                const restorePoint = previousSnapshot;
                const signal = yield* Deferred.make<void>();
                const cancellation: ActiveBrowserCommandCancellation = {
                    signal,
                    restorePoint,
                    requested: false,
                };
                this.activeCancellation = cancellation;

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

                // 3. Race the command against cancellation. Disposing the engine rejects the
                // pending request; once cancellation was requested that rejection is cancellation.
                const completed = this.executeCommand(command).pipe(
                    Effect.map(result => ({ kind: 'completed' as const, result })),
                    Effect.catchAllCause(cause => cancellation.requested
                        ? Effect.succeed({ kind: 'cancelled' as const })
                        : Effect.failCause(cause)),
                );
                const cancelled = Deferred.await(signal).pipe(
                    Effect.map(() => ({ kind: 'cancelled' as const })),
                );
                const execution = yield* Effect.raceFirst(completed, cancelled);

                if (execution.kind === 'completed') {
                    // 4a. Publish the successful command result.
                    yield* Effect.sync(() => this.publishCommandResult(execution.result));
                }
                else if (execution.kind === 'cancelled') {
                    // 4b. A worker termination is destructive, so reopen the cached initial source.
                    const database = yield* this.rebuildDatabaseAfterCancellation();
                    const schemaStatus = yield* this.querySchemaStatus(database);
                    yield* Effect.sync(() => {
                        this.publishSnapshot({
                            ...restorePoint,
                            schemaStatus,
                            results: [
                                { id: this.nextResultId++, type: 'database-reset-notice' },
                                ...restorePoint.results,
                            ],
                            commandStatus: { kind: 'idle' },
                        });
                    });
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
                // The snapshot represents any failure, so dispatch itself completes successfully.
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
            const runtime = this.getReadyRuntime();
            runtime.engine.dispose();
            this.runtimeState = { kind: 'empty' };
            Effect.runSync(Deferred.succeed(cancellation.signal, undefined));
        }
    }

    removeResult(id: number): void {
        this.updateReadySnapshot(snapshot => ({
            ...snapshot,
            results: snapshot.results.filter(entry => entry.id !== id),
        }));
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

    private materializeDatabase(): Effect.Effect<LoadedDatabase, LoadDatabaseFail> {
        return loadDatabaseWithMetadata(this.source, this.settingsStore);
    }

    private resolveAndPublishSnapshot(): Effect.Effect<void, BrowserSessionError> {
        return Effect.gen(this, function* () {
            const loadedDatabase = yield* this.materializeDatabase();
            this.initialDatabaseData = loadedDatabase.data;
            this.databasePackageInfo = loadedDatabase.packageInfo ?? null;
            const runtime = yield* this.createRuntime(loadedDatabase.data);

            const schemaStatus = yield* this.querySchemaStatus(runtime.database);

            this.publishSnapshot({
                kind: 'ready',
                schemaStatus,
                results: [],
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

    private publishCommandResult(result: SqlResult): void {
        const retainedResult = truncateSqlResultRowsPerTable(
            result,
            this.settingsStore.getSnapshot().maxDisplayedResultRowsPerTable,
        );
        this.updateReadySnapshot(snapshot => ({
            ...snapshot,
            results: [{ id: this.nextResultId++, type: 'sql', result: retainedResult }, ...snapshot.results],
        }));
    }

    /////////////////////////////
    // Command implementations //
    /////////////////////////////

    private executeCommand(command: BrowserCommand): Effect.Effect<SqlResult, DatabaseEngineFail> {
        switch (command.type) {
            case 'execute-sql': {
                return this.getReadyRuntime().database.exec(command.sql);
            }
            default: {
                const _n: never = command.type;
                return _n;
            }
        }
    }

    private rebuildDatabaseAfterCancellation(): Effect.Effect<DatabaseConnection, InitDbFail> {
        return Effect.gen(this, function* () {
            const initialDatabaseData = this.initialDatabaseData;
            if (initialDatabaseData === null) {
                return yield* Effect.die(new Error('Browser session has no cached initial database'));
            }
            else {
                return (yield* this.createRuntime(initialDatabaseData)).database;
            }
        });
    }

    private createRuntime(dbData: DbData): Effect.Effect<BrowserRuntime, InitDbFail> {
        if (this.disposed) {
            return Effect.die(new Error('Cannot create a runtime for a disposed browser session'));
        }
        else {
            const engine = this.databaseEngineFactory();
            this.runtimeState = { kind: 'preparing', engine };
            return Effect.gen(this, function* () {
                const database = yield* engine.open(dbData, dbData.system, dbData.systemMinVersion);
                if (this.disposed) {
                    engine.dispose();
                    this.runtimeState = { kind: 'empty' };
                    return yield* Effect.die(new Error('Browser session was disposed while preparing its runtime'));
                }
                else if (this.runtimeState.kind === 'preparing' && this.runtimeState.engine === engine) {
                    const runtime = { engine, database };
                    this.runtimeState = { kind: 'ready', runtime };
                    return runtime;
                }
                else {
                    engine.dispose();
                    return yield* Effect.die(new Error('Browser runtime state changed while it was being prepared'));
                }
            });
        }
    }

    private getReadyRuntime(): BrowserRuntime {
        if (this.runtimeState.kind === 'ready') {
            return this.runtimeState.runtime;
        }
        else if (this.runtimeState.kind === 'empty') {
            throw new Error('Browser session has no runtime');
        }
        else if (this.runtimeState.kind === 'preparing') {
            throw new Error('Browser session runtime is still being prepared');
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

    private publishSnapshot(snapshot: BrowserSessionSnapshot): void {
        if (this.disposed) {
            return;
        }

        this.snapshot = snapshot;
        for (const listener of this.listeners) {
            listener();
        }
    }

    private updateReadySnapshot(
        update: (snapshot: Extract<BrowserSessionSnapshot, { kind: 'ready' }>) => Extract<BrowserSessionSnapshot, { kind: 'ready' }>,
    ): void {
        if (this.snapshot.kind !== 'ready') {
            return;
        }

        const nextSnapshot = update(this.snapshot);
        if (nextSnapshot !== this.snapshot) {
            this.publishSnapshot(nextSnapshot);
        }
    }
}

function makeBrowserURI(uri: string): BrowserURI {
    return uri as BrowserURI;
}
