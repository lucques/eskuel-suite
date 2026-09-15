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
    SqlResultError,
    SqlResultSucc,
} from '../../database/api';
import { loadDatabase, type LoadDatabaseFail } from '../../database/loader';
import type { DbSource } from '../../database/source';
import { truncateSqlResultRowsPerTable } from '../../database/result';
import { loadGameWithInfo } from '../../game/loader';
import { fingerprintGame } from '../../game/fingerprint';
import type { GameSource, LoadGameFail } from '../../game/loader';
import type { GamePackageInfo } from '../../game/package';
import { getGameEditorFilename } from '../../game/source';
import { Game } from '../../game/model';
import type { ManipulateScene, Scene } from '../../game/model';
import { disposeCodeEditorModel, makeCodeEditorURI } from '../../gui-helpers/code-editor/uri';
import type { CodeEditorURI } from '../../gui-helpers/code-editor/uri';
import type { Schema } from '../../schema/model';
import type { ParseSchemaFail } from '../../schema/status';
import { defaultSettingsStore } from '../../settings/store';
import type { SettingsStore } from '../../settings/store';
import { assert, unknownErrorToString } from '../../util';
import type { XmlParser } from '../../game/xml/model';
import type { GamePlatformAdapters } from '../../platform/game';
import {
    areSqlResultsExactlyEqual,
    createSceneTestStatus,
    createSceneTestStatuses,
    invalidateTaskStatusesFrom,
} from './testing';
import type { SceneTestStatus } from './testing';
import type { CommandStatus } from '../../session-command';
import type {
    CommittedGameDocumentChange,
    GameDocument,
    GameDocumentChange,
    GameDocumentID,
    GameDocumentOptions,
} from './document';
import { makeGameDocumentID } from './document';

// A stable identifier for one game editor session.
export type GameEditorURI = string & { readonly __brand: 'GameEditorURI' };

// A user-requested operation for the game editor session to perform.
export type GameEditorSceneCommand =
    | { type: 'update-scene', index: number, scene: Scene }
    | { type: 'add-scene', index: number, scene: Scene }
    | { type: 'delete-scene', index: number }
    | { type: 'reorder-scenes', indices: number[] };

export type GameEditorCommand =
    | {
        type: 'update-metadata',
        title: string,
        teaser: string,
        copyright: string,
    }
    | { type: 'set-database-source', source: DbSource }
    | GameEditorSceneCommand
    | { type: 'test-scene', index: number }
    | { type: 'test-scenes-up-to', index: number }
    | { type: 'execute-sql', sql: string };

// The current command-execution state of the session.
export type GameEditorCommandStatus = CommandStatus<GameEditorCommand>;

// A failure encountered while loading, opening, or inspecting the test database.
export type GameEditorDatabaseError = LoadDatabaseFail | InitDbFail | ParseSchemaFail;

// The current availability and schema state of the database.
// Unlike in browser or game-console, the a game-editor session can still
// be usable even if the database is unavailable
export type GameEditorDatabaseStatus =
    | { kind: 'empty' }
    | { kind: 'pending' }
    | { kind: 'loaded', schema: Schema, dbData: DbData }
    | { kind: 'failed', error: GameEditorDatabaseError };

// A failure that prevents the session from being usable.
export type GameEditorSessionError =
    | LoadGameFail
    | {
        kind: 'unexpected',
        details: string,
    };

// A dismissible entry in the results timeline.
export type ResultEntry = { id: number } & (
    | { type: 'sql', result: SqlResult }
    | { type: 'database-reset-notice' }
    | { type: 'database-source-load-cancelled-notice' }
);

// The complete UI-facing session state at one point in time.
export type GameEditorSnapshot =
    | { kind: 'loading' }
    | { kind: 'failed', error: GameEditorSessionError }
    | {
        kind: 'ready',
        document: GameDocument,
        packageInfo?: GamePackageInfo,
        databaseStatus: GameEditorDatabaseStatus,
        commandStatus: GameEditorCommandStatus,
        sceneTestStatuses: SceneTestStatus[],
        results: ResultEntry[],
    };

// A callback invoked whenever the published session snapshot changes.
type Listener = () => void;
type GameDocumentChangeListener = (change: CommittedGameDocumentChange) => void;
type PackageInfoDiscardListener = () => void;

// Describes which UI-facing snapshot fields to update after a command finishes.
type CommandOutcome = {
    game: Game,
    documentChange?: GameDocumentChange,
    databaseStatus?: GameEditorDatabaseStatus,
    sceneTestStatuses?: SceneTestStatus[],
    result?: SqlResult,
};

// The result of testing one scene and whether it prevents testing later scenes.
type TestSceneExecution = {
    result: SqlResult,
    blocksFurtherTesting: boolean,
};

// How far the live test database reflects the game's manipulation scenes, or whether it is dirty.
type DatabaseFrontier =
    | { kind: 'dirty' }
    | { kind: 'initialized' }
    | { kind: 'last-executed-manipulation-scene', n: number };

// The private test database and the marker describing its current preparation state.
type GameEditorRuntime = {
    engine: DatabaseEngine,
    database: DatabaseConnection | null,
    databaseFrontier: DatabaseFrontier,
};

// Tracks the runtime while its database is being opened, allowing the engine
// to be disposed even before construction completes.
type GameEditorRuntimeState =
    | { kind: 'empty' }
    | { kind: 'preparing', engine: DatabaseEngine }
    | { kind: 'ready', runtime: GameEditorRuntime };

// Cancellation bookkeeping for the command currently executing, including
// its signal, pre-command restore point, and any committed batch progress.
type ActiveGameEditorCommandCancellation = {
    signal: Deferred.Deferred<void>,
    restorePoint: Extract<GameEditorSnapshot, { kind: 'ready' }>,
    sceneTestStatusesCheckpoint: SceneTestStatus[],
    requested: boolean,
    requiresDatabaseReconstruction: boolean,
};

type SceneCommandHistoryEntry = {
    undo: GameEditorSceneCommand,
    redo: GameEditorSceneCommand,
};

type SceneCommandHistoryAction =
    | { kind: 'record' }
    | { kind: 'undo', entry: SceneCommandHistoryEntry }
    | { kind: 'redo', entry: SceneCommandHistoryEntry };

export type GameEditorSessionOptions = GameDocumentOptions & {
    packageInfo?: GamePackageInfo;
};

export class GameEditorSession {
    readonly uri: GameEditorURI;
    readonly sqlEditorURI: CodeEditorURI;
    readonly documentId: GameDocumentID;

    private readonly initialFilename: string;
    private readonly initialDocumentRevision: number;
    private readonly documentSourceKey: string | null;
    private readonly initialSavedGameFingerprint: string | null | undefined;
    private readonly initialPackageInfo: GamePackageInfo | undefined;
    private readonly source: GameSource;
    private readonly databaseEngineFactory: DatabaseEngineFactory;
    private readonly xmlParser: XmlParser;
    private readonly settingsStore: SettingsStore;
    private readonly commandSemaphore = Effect.unsafeMakeSemaphore(1);
    // The cached initialization effect runs at most once; all resolve() calls share
    // its completion instead of rebuilding the session.
    private readonly resolution: Effect.Effect<void, GameEditorSessionError>;
    private readonly listeners = new Set<Listener>();
    private readonly documentChangeListeners = new Set<GameDocumentChangeListener>();
    private readonly packageInfoDiscardListeners = new Set<PackageInfoDiscardListener>();
    private readonly sceneUndoStack: SceneCommandHistoryEntry[] = [];
    private readonly sceneRedoStack: SceneCommandHistoryEntry[] = [];
    private readonly gameFingerprintCache = new WeakMap<Game, Promise<string>>();
    private nextResultId = 0;
    // Records that cleanup has begun so no further session work is performed.
    private disposed = false;
    private runtimeState: GameEditorRuntimeState = { kind: 'empty' };
    private snapshot: GameEditorSnapshot = { kind: 'loading' };
    // Needed to restore the session after cancelling a command; null unless a
    // cancellable command is currently running or rebuilding after cancellation.
    private activeCancellation: ActiveGameEditorCommandCancellation | null = null;

    constructor(
        filename: string,
        source: GameSource,
        adapters: GamePlatformAdapters,
        settingsStore: SettingsStore = defaultSettingsStore,
        sessionOptions: GameEditorSessionOptions = {},
    ) {
        this.uri = makeGameEditorURI(`inmemory:///${uuidv4()}.xml`);
        this.sqlEditorURI = makeCodeEditorURI();
        this.documentId = sessionOptions.id ?? makeGameDocumentID(uuidv4());
        this.initialFilename = filename;
        this.initialDocumentRevision = sessionOptions.revision ?? 0;
        this.documentSourceKey = sessionOptions.sourceKey ?? getGameSourceKey(source);
        this.initialSavedGameFingerprint = sessionOptions.savedGameFingerprint;
        this.initialPackageInfo = sessionOptions.packageInfo;
        this.source = source;
        this.databaseEngineFactory = adapters.databaseEngineFactory;
        this.xmlParser = adapters.xmlParser;
        this.settingsStore = settingsStore;
        this.resolution = Effect.runSync(Effect.cached(this.resolveAndPublishSnapshot()));
    }

    getFilename(): string {
        return this.snapshot.kind === 'ready' ? this.snapshot.document.filename : this.initialFilename;
    }

    getDocumentSourceKey(): string | null {
        return this.documentSourceKey;
    }

    getDocumentLockKey(): string {
        return this.documentSourceKey === null
            ? `document:${this.documentId}`
            : `source:${this.documentSourceKey}`;
    }

    getSnapshot(): GameEditorSnapshot {
        return this.snapshot;
    }

    hasUnsavedFileChanges(): boolean {
        const snapshot = this.snapshot;
        return snapshot.kind !== 'ready' || snapshot.document.savedGameFingerprint === null;
    }

    async markGameAsSaved(game: Game): Promise<void> {
        const fingerprint = await this.getGameFingerprint(game);
        if (this.snapshot.kind === 'ready'
            && this.snapshot.document.game === game
            && !this.disposed) {
            this.publishSavedGameFingerprint(fingerprint);
        }
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    subscribeToDocumentChanges(listener: GameDocumentChangeListener): () => void {
        this.documentChangeListeners.add(listener);
        return () => {
            this.documentChangeListeners.delete(listener);
        };
    }

    subscribeToPackageInfoDiscard(listener: PackageInfoDiscardListener): () => void {
        this.packageInfoDiscardListeners.add(listener);
        return () => {
            this.packageInfoDiscardListeners.delete(listener);
        };
    }

    discardPackageInfo(): void {
        if (this.snapshot.kind === 'ready' && this.snapshot.packageInfo !== undefined) {
            const { packageInfo: _discardedPackageInfo, ...snapshot } = this.snapshot;
            this.publishSnapshot(snapshot);
            for (const listener of this.packageInfoDiscardListeners) {
                listener();
            }
        }
    }

    setFilename(filename: string): void {
        if (this.snapshot.kind === 'ready' && this.snapshot.document.filename !== filename) {
            const document = {
                ...this.snapshot.document,
                filename,
                revision: this.snapshot.document.revision + 1,
            };
            this.publishSnapshot({ ...this.snapshot, document });
            this.publishDocumentChange({ document, change: { type: 'filename-changed' } });
        }
    }

    resolve(): Effect.Effect<void, GameEditorSessionError> {
        return this.resolution;
    }

    dispatch(command: GameEditorCommand): Effect.Effect<void> {
        return this.dispatchWithSceneHistory(command, { kind: 'record' });
    }

    canUndoSceneCommand(): boolean {
        return this.sceneUndoStack.length > 0;
    }

    canRedoSceneCommand(): boolean {
        return this.sceneRedoStack.length > 0;
    }

    undoSceneCommand(): Effect.Effect<void> {
        const entry = this.sceneUndoStack[this.sceneUndoStack.length - 1];
        if (entry === undefined) {
            return Effect.void;
        }
        else {
            return this.dispatchWithSceneHistory(entry.undo, { kind: 'undo', entry });
        }
    }

    redoSceneCommand(): Effect.Effect<void> {
        const entry = this.sceneRedoStack[this.sceneRedoStack.length - 1];
        if (entry === undefined) {
            return Effect.void;
        }
        else {
            return this.dispatchWithSceneHistory(entry.redo, { kind: 'redo', entry });
        }
    }

    private dispatchWithSceneHistory(
        command: GameEditorCommand,
        historyAction: SceneCommandHistoryAction,
    ): Effect.Effect<void> {
        return Effect.gen(this, function* () {
            yield* this.resolve().pipe(Effect.catchAll(() => Effect.void));
            if (this.snapshot.kind !== 'ready' || this.disposed) {
                return;
            }
            const previousSnapshot = this.snapshot;
            const commandCancellable = isGameEditorCommandCancellable(command);

            // Lifecycle: initialize cancellation if supported, publish running, execute, then settle.
            const operation = Effect.gen(this, function* () {
                // 1. Create the cancellation signal before publishing the running command.
                const cancellation = commandCancellable
                    ? yield* this.createCommandCancellation(
                        command,
                        previousSnapshot,
                    )
                    : null;
                // Only commands with a cancellation mechanism expose active cancellation.
                if (cancellation !== null) {
                    this.activeCancellation = cancellation;
                }

                // 2. Publish running and any immediate database-source reset.
                yield* Effect.sync(() => {
                    this.updateReadySnapshot(snapshot => ({
                        ...snapshot,
                        databaseStatus: command.type === 'set-database-source'
                            ? { kind: 'pending' }
                            : snapshot.databaseStatus,
                        commandStatus: {
                            kind: 'running',
                            command,
                        },
                        sceneTestStatuses: command.type === 'set-database-source'
                            ? createSceneTestStatuses(snapshot.document.game.scenes)
                            : snapshot.sceneTestStatuses,
                        results: command.type === 'set-database-source'
                            ? []
                            : snapshot.results,
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
                    yield* Effect.sync(() => {
                        this.applySceneCommandHistoryAction(historyAction, command, previousSnapshot.document.game);
                        this.publishCommandOutcome(execution.outcome);
                    });
                }
                else if (execution.kind === 'cancelled') {
                    if (cancellation === null) {
                        return yield* Effect.die(new Error('A non-cancellable command was cancelled'));
                    }
                    else {
                        // 4b. Rebuild a database already touched by the command, or retain the untouched database;
                        // then restore the pre-command UI state and prepend a dismissible cancellation notice.
                        const databaseStatus = cancellation.requiresDatabaseReconstruction
                            ? yield* this.rebuildDatabaseAfterCancellation(cancellation.restorePoint)
                            : cancellation.restorePoint.databaseStatus;
                        yield* Effect.sync(() => {
                            const notice: ResultEntry = cancellation.requiresDatabaseReconstruction
                                ? { id: this.nextResultId++, type: 'database-reset-notice' }
                                : { id: this.nextResultId++, type: 'database-source-load-cancelled-notice' };
                            this.publishSnapshot({
                                ...cancellation.restorePoint,
                                databaseStatus,
                                sceneTestStatuses: cancellation.sceneTestStatusesCheckpoint,
                                results: [notice, ...cancellation.restorePoint.results],
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

    private applySceneCommandHistoryAction(
        action: SceneCommandHistoryAction,
        command: GameEditorCommand,
        previousGame: Game,
    ): void {
        switch (action.kind) {
            case 'record': {
                const entry = createSceneCommandHistoryEntry(command, previousGame);
                if (entry !== null) {
                    this.sceneUndoStack.push(entry);
                    this.sceneRedoStack.length = 0;
                }
                break;
            }
            case 'undo': {
                const entry = this.sceneUndoStack.pop();
                assert(entry === action.entry, 'The scene undo history changed while undoing');
                this.sceneRedoStack.push(action.entry);
                break;
            }
            case 'redo': {
                const entry = this.sceneRedoStack.pop();
                assert(entry === action.entry, 'The scene redo history changed while redoing');
                this.sceneUndoStack.push(action.entry);
                break;
            }
            default: { const _n: never = action; return _n; }
        }
    }

    cancelRunningCommand(): void {
        const cancellation = this.activeCancellation;
        if (this.snapshot.kind === 'ready'
            && this.snapshot.commandStatus.kind === 'running'
            && isGameEditorCommandCancellable(this.snapshot.commandStatus.command)
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
            if (cancellation.requiresDatabaseReconstruction) {
                this.disposeRuntimeState();
            }
            Effect.runSync(Deferred.succeed(cancellation.signal, undefined));
        }
    }

    recordResult(result: SqlResult): void {
        const retainedResult = this.retainSqlResult(result);
        this.updateReadySnapshot(snapshot => {
            if (snapshot.databaseStatus.kind === 'loaded') {
                return {
                    ...snapshot,
                    results: [{ id: this.nextResultId++, type: 'sql', result: retainedResult }, ...snapshot.results],
                };
            }
            else {
                return snapshot;
            }
        });
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
        this.documentChangeListeners.clear();
        this.packageInfoDiscardListeners.clear();
    }

    private resolveAndPublishSnapshot(): Effect.Effect<void, GameEditorSessionError> {
        return Effect.gen(this, function* () {
            const loaded = yield* loadGameWithInfo(this.source, this.xmlParser);
            const game = loaded.game;
            const packageInfo = loaded.packageInfo ?? this.initialPackageInfo;
            const savedGameFingerprint = this.initialSavedGameFingerprint === undefined
                ? yield* Effect.promise(() => this.getGameFingerprint(game))
                : this.initialSavedGameFingerprint;
            this.createEmptyRuntimeWithNewEngine();
            this.publishSnapshot({
                kind: 'ready',
                ...(packageInfo === undefined ? {} : { packageInfo }),
                document: {
                    id: this.documentId,
                    filename: getGameEditorFilename(this.initialFilename, loaded.packageInfo !== undefined),
                    revision: this.initialDocumentRevision,
                    sourceKey: this.documentSourceKey,
                    savedGameFingerprint,
                    game,
                },
                databaseStatus: game.dbData === null ? { kind: 'empty' } : { kind: 'pending' },
                commandStatus: { kind: 'idle' },
                sceneTestStatuses: createSceneTestStatuses(game.scenes),
                results: [],
            });

            if (game.dbData !== null) {
                const databaseStatus = yield* this.replaceDatabase(game.dbData).pipe(
                    Effect.mapError(error => ({
                        kind: 'unexpected' as const,
                        details: error.details,
                    })),
                );
                this.updateReadySnapshot(snapshot => ({ ...snapshot, databaseStatus }));
            }
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

    private getGameFingerprint(game: Game): Promise<string> {
        const cached = this.gameFingerprintCache.get(game);
        if (cached !== undefined) {
            return cached;
        }
        else {
            const fingerprint = fingerprintGame(game);
            this.gameFingerprintCache.set(game, fingerprint);
            return fingerprint;
        }
    }

    private publishSavedGameFingerprint(fingerprint: string): void {
        if (this.snapshot.kind === 'ready'
            && !this.disposed
            && this.snapshot.document.savedGameFingerprint !== fingerprint) {
            const document = {
                ...this.snapshot.document,
                savedGameFingerprint: fingerprint,
                revision: this.snapshot.document.revision + 1,
            };
            this.publishSnapshot({ ...this.snapshot, document });
            this.publishDocumentChange({ document, change: { type: 'file-checkpoint-updated' } });
        }
    }

    private publishCommandOutcome(outcome: CommandOutcome): void {
        if (this.snapshot.kind !== 'ready') {
            return;
        }

        const previousSnapshot = this.snapshot;
        const retainedResult = outcome.result === undefined
            ? undefined
            : this.retainSqlResult(outcome.result);
        const document = outcome.documentChange === undefined
            ? previousSnapshot.document
            : {
                ...previousSnapshot.document,
                game: outcome.game,
                revision: previousSnapshot.document.revision + 1,
                savedGameFingerprint: null,
            };
        this.publishSnapshot({
            ...previousSnapshot,
            document,
            databaseStatus: outcome.databaseStatus ?? previousSnapshot.databaseStatus,
            sceneTestStatuses: outcome.sceneTestStatuses ?? previousSnapshot.sceneTestStatuses,
            results: retainedResult !== undefined
                ? [{ id: this.nextResultId++, type: 'sql', result: retainedResult }, ...previousSnapshot.results]
                : previousSnapshot.results,
        });
        if (outcome.documentChange !== undefined) {
            this.publishDocumentChange({ document, change: outcome.documentChange });
        }
    }

    /////////////////////////////
    // Command implementations //
    /////////////////////////////

    private executeCommand(command: GameEditorCommand): Effect.Effect<CommandOutcome, InitDbFail> {
        return Effect.gen(this, function* () {
            const snapshot = this.snapshot;
            assert(snapshot.kind === 'ready', 'Game editor session is not ready');
            const game = snapshot.document.game;

            switch (command.type) {
                case 'update-metadata':
                    if (command.title === game.title
                        && command.teaser === game.teaser
                        && command.copyright === game.copyright) {
                        return { game };
                    }
                    else {
                        return {
                            game: new Game(
                                command.title,
                                command.teaser,
                                command.copyright,
                                game.dbData,
                                game.scenes,
                                game.dbSystem,
                                game.dbSystemMinVersion,
                            ),
                            documentChange: { type: 'metadata-updated' as const },
                        };
                    }
                case 'set-database-source': {
                    return yield* loadDatabase(command.source).pipe(
                        Effect.matchEffect({
                            onFailure: error => Effect.succeed({
                                game,
                                databaseStatus: { kind: 'failed' as const, error },
                            }),
                            onSuccess: dbData => Effect.gen(this, function* () {
                                this.markActiveCancellationForDatabaseReconstruction();
                                const nextGame = new Game(
                                    game.title,
                                    game.teaser,
                                    game.copyright,
                                    dbData,
                                    game.scenes,
                                    dbData.system,
                                    dbData.systemMinVersion,
                                );
                                return {
                                    game: nextGame,
                                    databaseStatus: yield* this.replaceDatabase(dbData),
                                    documentChange: { type: 'database-replaced' as const },
                                };
                            }),
                        }),
                    );
                }
                case 'update-scene': {
                    assert(command.index >= 0 && command.index < game.scenes.length, 'Scene index is out of bounds');
                    const oldScene = game.scenes[command.index];
                    const scenes = game.scenes.map((scene, index) => index === command.index ? command.scene : scene);
                    const statuses = [...snapshot.sceneTestStatuses];
                    statuses[command.index] = createSceneTestStatus(command.scene);
                    const affectsManipulationHistory = oldScene.type === 'manipulate' || command.scene.type === 'manipulate';
                    if (affectsManipulationHistory) {
                        if (this.runtime.databaseFrontier.kind === 'last-executed-manipulation-scene'
                            && command.index <= this.runtime.databaseFrontier.n) {
                            this.runtime.databaseFrontier = { kind: 'dirty' };
                        }
                        return {
                            game: copyGameWithScenes(game, scenes),
                            sceneTestStatuses: invalidateTaskStatusesFrom(scenes, statuses, command.index),
                            documentChange: { type: 'scene-updated' as const, index: command.index },
                        };
                    }
                    else {
                        return {
                            game: copyGameWithScenes(game, scenes),
                            sceneTestStatuses: statuses,
                            documentChange: { type: 'scene-updated' as const, index: command.index },
                        };
                    }
                }
                case 'add-scene': {
                    assert(command.index >= 0 && command.index <= game.scenes.length, 'Scene index is out of bounds');
                    const scenes = [...game.scenes];
                    scenes.splice(command.index, 0, command.scene);
                    const statuses = [...snapshot.sceneTestStatuses];
                    statuses.splice(command.index, 0, createSceneTestStatus(command.scene));
                    if (command.scene.type === 'manipulate') {
                        if (this.runtime.databaseFrontier.kind === 'last-executed-manipulation-scene'
                            && command.index <= this.runtime.databaseFrontier.n) {
                            this.runtime.databaseFrontier = { kind: 'dirty' };
                        }
                        return {
                            game: copyGameWithScenes(game, scenes),
                            sceneTestStatuses: invalidateTaskStatusesFrom(scenes, statuses, command.index),
                            documentChange: { type: 'scene-added' as const, index: command.index },
                        };
                    }
                    else {
                        // When scene is inserted, the index of the last manipulation scene is shifted by one if it comes after the inserted scene
                        if (this.runtime.databaseFrontier.kind === 'last-executed-manipulation-scene'
                            && command.index <= this.runtime.databaseFrontier.n) {
                            this.runtime.databaseFrontier = {
                                kind: 'last-executed-manipulation-scene',
                                n: this.runtime.databaseFrontier.n + 1,
                            };
                        }
                        return {
                            game: copyGameWithScenes(game, scenes),
                            sceneTestStatuses: statuses,
                            documentChange: { type: 'scene-added' as const, index: command.index },
                        };
                    }
                }
                case 'delete-scene': {
                    assert(game.scenes.length > 1, 'A game must contain at least one scene');
                    assert(command.index >= 0 && command.index < game.scenes.length, 'Scene index is out of bounds');
                    const deletedScene = game.scenes[command.index];
                    const scenes = game.scenes.filter((_, index) => index !== command.index);
                    const statuses = snapshot.sceneTestStatuses.filter((_, index) => index !== command.index);
                    if (deletedScene.type === 'manipulate') {
                        if (this.runtime.databaseFrontier.kind === 'last-executed-manipulation-scene'
                            && command.index <= this.runtime.databaseFrontier.n) {
                            this.runtime.databaseFrontier = { kind: 'dirty' };
                        }
                        return {
                            game: copyGameWithScenes(game, scenes),
                            sceneTestStatuses: invalidateTaskStatusesFrom(scenes, statuses, command.index),
                            documentChange: { type: 'scene-deleted' as const, index: command.index },
                        };
                    }
                    else {
                        // When scene is deleted, the index of the last manipulation scene is shifted by one if it comes after the deleted scene
                        if (this.runtime.databaseFrontier.kind === 'last-executed-manipulation-scene'
                            && command.index < this.runtime.databaseFrontier.n) {
                            this.runtime.databaseFrontier = {
                                kind: 'last-executed-manipulation-scene',
                                n: this.runtime.databaseFrontier.n - 1,
                            };
                        }
                        return {
                            game: copyGameWithScenes(game, scenes),
                            sceneTestStatuses: statuses,
                            documentChange: { type: 'scene-deleted' as const, index: command.index },
                        };
                    }
                }
                case 'reorder-scenes': {
                    assert(isPermutation(command.indices, game.scenes.length), 'Scene indices must be a permutation');
                    // Reorder the scenes and statuses
                    const scenes = command.indices.map(index => game.scenes[index]);
                    let statuses = command.indices.map(index => snapshot.sceneTestStatuses[index]);
                    const firstChangedIndex = command.indices.findIndex((oldIndex, newIndex) => oldIndex !== newIndex);

                    // If there was any reordering...
                    if (firstChangedIndex !== -1) {
                        statuses = invalidateTaskStatusesFrom(scenes, statuses, firstChangedIndex);

                        if (this.runtime.databaseFrontier.kind === 'last-executed-manipulation-scene') {
                            if (this.runtime.databaseFrontier.n >= firstChangedIndex) {
                                this.runtime.databaseFrontier = { kind: 'dirty' };
                            }
                        }
                    }
                    return firstChangedIndex === -1
                        ? { game }
                        : {
                            game: copyGameWithScenes(game, scenes),
                            sceneTestStatuses: statuses,
                            documentChange: { type: 'scenes-reordered' as const, indices: command.indices },
                        };
                }
                case 'test-scene': {
                    assert(command.index >= 0 && command.index < game.scenes.length, 'Scene index is out of bounds');
                    const scene = game.scenes[command.index];
                    assert(scene.type === 'select' || scene.type === 'manipulate', 'Only task scenes can be tested individually');
                    const result = yield* this.testScene(game, command.index);
                    return { game, result };
                }
                case 'test-scenes-up-to': {
                    assert(command.index >= 0 && command.index < game.scenes.length, 'Scene index is out of bounds');
                    const result = yield* this.testUnknownScenesUpTo(game, command.index);
                    const targetScene = game.scenes[command.index];
                    if (targetScene.type === 'select' || targetScene.type === 'manipulate') {
                        return result === null ? { game } : { game, result };
                    }
                    else if (targetScene.type === 'text' || targetScene.type === 'image') {
                        return { game };
                    }
                    else { const _n: never = targetScene; return _n; }
                }
                case 'execute-sql': {
                    this.runtime.databaseFrontier = { kind: 'dirty' };
                    const result = yield* this.executeSql(command.sql);
                    return {
                        game,
                        result,
                    };
                }
                default: {
                    const _n: never = command;
                    return _n;
                }
            }
        });
    }

    private testScene(game: Game, index: number): Effect.Effect<SqlResult, InitDbFail> {
        return Effect.gen(this, function* () {
            const blockingResult = yield* this.prepareReferenceDatabase(game, index);
            if (blockingResult === null) {
                const execution = yield* this.executeTaskScene(game, index);
                return execution.result;
            }
            else {
                return blockingResult;
            }
        });
    }

    private testUnknownScenesUpTo(game: Game, targetIndex: number): Effect.Effect<SqlResult | null, InitDbFail> {
        return Effect.gen(this, function* () {
            assert(this.snapshot.kind === 'ready', 'Game editor session is not ready');

            let lastResult: SqlResult | null = null;
            for (let index = 0; index <= targetIndex; index++) {
                const scene = game.scenes[index];
                const status = this.snapshot.sceneTestStatuses[index];
                switch (status.kind) {
                    case 'none':
                    case 'unknown':
                        break;
                    case 'select-result':
                    case 'manipulate-result':
                        lastResult = status.result;
                        break;
                    default: { const _n: never = status; return _n; }
                }
                if ((scene.type === 'select' || scene.type === 'manipulate') && status.kind === 'unknown') {
                    const blockingResult = yield* this.prepareReferenceDatabase(game, index);
                    if (blockingResult !== null) {
                        lastResult = blockingResult;
                        this.checkpointActiveSceneTestBatch();
                        break;
                    }

                    const execution = yield* this.executeTaskScene(game, index);
                    lastResult = execution.result;
                    this.checkpointActiveSceneTestBatch();
                    if (execution.blocksFurtherTesting) {
                        break;
                    }
                }
            }
            return lastResult;
        });
    }

    /**
     * Returns the SQL result of the first manipulation that blocks further testing,
     * or null if the reference database was prepared successfully.
     */
    private prepareReferenceDatabase(game: Game, targetIndex: number): Effect.Effect<SqlResult | null, InitDbFail> {
        return Effect.gen(this, function* () {
            assert(this.snapshot.kind === 'ready', 'Game editor session is not ready');
            assert(this.snapshot.databaseStatus.kind === 'loaded', 'A loaded database is required for testing');

            let reopenDatabase: boolean;
            if (this.runtime.database === null) {
                reopenDatabase = true;
            }
            else {
                switch (this.runtime.databaseFrontier.kind) {
                    case 'initialized':
                        reopenDatabase = false;
                        break;
                    case 'last-executed-manipulation-scene':
                        if (this.runtime.databaseFrontier.n < targetIndex) {
                            reopenDatabase = false;
                        }
                        else {
                            reopenDatabase = true;
                        }
                        break;
                    case 'dirty':
                        reopenDatabase = true;
                        break;
                    default: { const _n: never = this.runtime.databaseFrontier; return _n; }
                }
            }

            if (reopenDatabase) {
                yield* this.reopenOriginalDatabase(game);
            }

            // Database is now freshly initialized if that was needed.
            // Now advance the reference database to the target index, if needed.
            let startIndex: number;
            if (this.runtime.databaseFrontier.kind === 'initialized') {
                startIndex = 0;
            }
            else if (this.runtime.databaseFrontier.kind === 'last-executed-manipulation-scene') {
                assert(targetIndex > this.runtime.databaseFrontier.n, 'Cannot advance the reference database backwards');
                startIndex = this.runtime.databaseFrontier.n + 1;
            }
            else if (this.runtime.databaseFrontier.kind === 'dirty') {
                throw new Error('Cannot advance a dirty reference database');
            }
            else { const _n: never = this.runtime.databaseFrontier; return _n; }

            let blockingResult: SqlResult | null = null;
            for (let index = startIndex; index < targetIndex && blockingResult === null; index++) {
                const scene = game.scenes[index];
                if (scene.type === 'manipulate') {
                    const result = yield* this.executeManipulateScene(game, index, scene);
                    if (result.blocksFurtherTesting) {
                        blockingResult = result.result;
                    }
                }
            }

            return blockingResult;
        });
    }

    private executeTaskScene(game: Game, index: number): Effect.Effect<TestSceneExecution, DatabaseEngineFail> {
        const scene = game.scenes[index];
        if (scene.type === 'select') {
            return Effect.gen(this, function* () {
                this.setSceneTestStatus(index, { kind: 'unknown' });
                const result = yield* this.executeSql(scene.sqlSol);
                this.setSceneTestStatus(index, { kind: 'select-result', result });
                return { result, blocksFurtherTesting: false };
            });
        }
        else if (scene.type === 'manipulate') {
            return this.executeManipulateScene(game, index, scene);
        }
        else if (scene.type === 'text' || scene.type === 'image') {
            return Effect.die(new Error('Only task scenes can be tested'));
        }
        else { const _n: never = scene; return _n; }
    }

    private executeManipulateScene(
        game: Game,
        index: number,
        scene: ManipulateScene,
    ): Effect.Effect<TestSceneExecution, DatabaseEngineFail> {
        return this.executeManipulateSceneUnchecked(game, index, scene).pipe(
            Effect.tapError(() => Effect.sync(() => {
                this.runtime.databaseFrontier = { kind: 'dirty' };
                this.updateReadySnapshot(snapshot => ({
                    ...snapshot,
                    sceneTestStatuses: invalidateTaskStatusesFrom(
                        game.scenes,
                        snapshot.sceneTestStatuses,
                        index,
                    ),
                }));
            })),
        );
    }

    private executeManipulateSceneUnchecked(
        game: Game,
        index: number,
        scene: ManipulateScene,
    ): Effect.Effect<TestSceneExecution, DatabaseEngineFail> {
        return Effect.gen(this, function* () {
            const beforeCheckResult = yield* this.executeSql(scene.sqlCheck);
            const solutionResult = yield* this.executeSql(scene.sqlSol);
            if (solutionResult.type === 'error') {
                this.recordBlockingManipulateStatus(game, index, {
                    kind: 'manipulate-result',
                    outcome: 'sql-sol-error',
                    result: solutionResult,
                });
                return { result: solutionResult, blocksFurtherTesting: true };
            }
            else {
                const afterCheckResult = yield* this.executeSql(scene.sqlCheck);
                if (afterCheckResult.type === 'error') {
                    this.recordBlockingManipulateStatus(game, index, {
                        kind: 'manipulate-result',
                        outcome: 'sql-check-error',
                        result: afterCheckResult,
                    });
                    return { result: afterCheckResult, blocksFurtherTesting: true };
                }
                else {
                    const status: SceneTestStatus = areSqlResultsExactlyEqual(beforeCheckResult, afterCheckResult)
                        ? {
                            kind: 'manipulate-result',
                            outcome: 'sql-check-no-witness',
                            result: afterCheckResult,
                        }
                        : {
                            kind: 'manipulate-result',
                            outcome: 'success',
                            result: afterCheckResult,
                        };
                    this.setSceneTestStatus(index, status);
                    this.runtime.databaseFrontier = { kind: 'last-executed-manipulation-scene', n: index };
                    return { result: afterCheckResult, blocksFurtherTesting: false };
                }
            }
        });
    }

    private recordBlockingManipulateStatus(game: Game, index: number, status: SceneTestStatus): void {
        const retainedStatus = this.retainSceneTestStatus(status);
        this.runtime.databaseFrontier = { kind: 'dirty' };
        this.updateReadySnapshot(snapshot => {
            const statuses = [...snapshot.sceneTestStatuses];
            statuses[index] = retainedStatus;
            return {
                ...snapshot,
                sceneTestStatuses: invalidateTaskStatusesFrom(game.scenes, statuses, index + 1),
            };
        });
    }

    private setSceneTestStatus(index: number, status: SceneTestStatus): void {
        const retainedStatus = this.retainSceneTestStatus(status);
        this.updateReadySnapshot(snapshot => {
            const statuses = [...snapshot.sceneTestStatuses];
            statuses[index] = retainedStatus;
            return { ...snapshot, sceneTestStatuses: statuses };
        });
    }

    private retainSceneTestStatus(status: SceneTestStatus): SceneTestStatus {
        switch (status.kind) {
            case 'none':
            case 'unknown':
                return status;
            case 'select-result':
                return { ...status, result: this.retainSqlResult(status.result) };
            case 'manipulate-result':
                switch (status.outcome) {
                    case 'sql-sol-error':
                    case 'sql-check-error':
                        return {
                            ...status,
                            result: this.retainSqlResult(status.result),
                        };
                    case 'sql-check-no-witness':
                    case 'success':
                        return {
                            ...status,
                            result: this.retainSqlResult(status.result),
                        };
                    default: { const _n: never = status; return _n; }
                }
            default: { const _n: never = status; return _n; }
        }
    }

    private retainSqlResult(result: SqlResultError): SqlResultError;
    private retainSqlResult(result: SqlResultSucc): SqlResultSucc;
    private retainSqlResult(result: SqlResult): SqlResult;
    private retainSqlResult(result: SqlResult): SqlResult {
        return truncateSqlResultRowsPerTable(
            result,
            this.settingsStore.getSnapshot().maxDisplayedResultRowsPerTable,
        );
    }

    private executeSql(sql: string): Effect.Effect<SqlResult, DatabaseEngineFail> {
        assert(this.runtime.database !== null, 'A database connection is required for SQL execution');
        return this.runtime.database.exec(sql);
    }

    private checkpointActiveSceneTestBatch(): void {
        const cancellation = this.activeCancellation;
        if (cancellation !== null
            && !cancellation.requested
            && this.snapshot.kind === 'ready'
            && this.snapshot.commandStatus.kind === 'running'
            && this.snapshot.commandStatus.command.type === 'test-scenes-up-to') {
            cancellation.sceneTestStatusesCheckpoint = [...this.snapshot.sceneTestStatuses];
        }
    }

    private createCommandCancellation(
        command: GameEditorCommand,
        snapshot: Extract<GameEditorSnapshot, { kind: 'ready' }>,
    ): Effect.Effect<ActiveGameEditorCommandCancellation> {
        return Effect.gen(this, function* () {
            const signal = yield* Deferred.make<void>();
            return {
                signal,
                requested: false,
                requiresDatabaseReconstruction: command.type !== 'set-database-source',
                restorePoint: snapshot,
                sceneTestStatusesCheckpoint: [...snapshot.sceneTestStatuses],
            };
        });
    }

    private rebuildDatabaseAfterCancellation(
        restorePoint: Extract<GameEditorSnapshot, { kind: 'ready' }>,
    ): Effect.Effect<GameEditorDatabaseStatus, InitDbFail | ParseSchemaFail> {
        return Effect.gen(this, function* () {
            const dbData = restorePoint.document.game.dbData;
            if (dbData === null) {
                this.createEmptyRuntimeWithNewEngine();
                return { kind: 'empty' };
            }
            else {
                const engine = this.beginRuntimePreparationWithNewEngine();
                const database = yield* engine.open(
                    dbData,
                    restorePoint.document.game.dbSystem,
                    restorePoint.document.game.dbSystemMinVersion,
                );
                const schema = yield* database.querySchema();
                this.finishRuntimePreparation(engine, database, { kind: 'initialized' });
                return { kind: 'loaded', schema, dbData };
            }
        });
    }

    private markActiveCancellationForDatabaseReconstruction(): void {
        const cancellation = this.activeCancellation;
        // Mark cancellation only during a database-source command's cancellable execution phase.
        if (cancellation !== null) {
            cancellation.requiresDatabaseReconstruction = true;
        }
    }

    private reopenOriginalDatabase(game: Game): Effect.Effect<void, InitDbFail> {
        return Effect.gen(this, function* () {
            assert(game.dbData !== null, 'A database source is required for testing');
            const runtime = this.runtime;
            const engine = runtime.engine;
            if (runtime.database !== null) {
                const previousDatabase = runtime.database;
                yield* previousDatabase.close();
            }

            this.beginRuntimePreparation(engine);
            const database = yield* engine.open(game.dbData, game.dbSystem, game.dbSystemMinVersion).pipe(
                Effect.tapError(error => Effect.gen(this, function* () {
                    const restored = this.restoreRuntimeAfterPreparationFailure(engine, null);
                    if (restored) {
                        this.updateReadySnapshot(snapshot => ({
                            ...snapshot,
                            databaseStatus: { kind: 'failed', error },
                        }));
                    }
                    else {
                        return yield* Effect.die(new Error('Database reopening was interrupted'));
                    }
                })),
            );
            this.finishRuntimePreparation(engine, database, { kind: 'initialized' });
        });
    }

    private replaceDatabase(dbData: DbData): Effect.Effect<GameEditorDatabaseStatus, DatabaseEngineFail> {
        return Effect.gen(this, function* () {
            const runtime = this.runtime;
            const engine = runtime.engine;
            if (runtime.database !== null) {
                const previousDatabase = runtime.database;
                yield* previousDatabase.close();
            }

            this.beginRuntimePreparation(engine);
            return yield* engine.open(
                dbData,
                dbData.system,
                dbData.systemMinVersion,
            ).pipe(
                Effect.matchEffect({
                    onFailure: error => this.restoreRuntimeAfterPreparationFailure(engine, null)
                        ? Effect.succeed({ kind: 'failed' as const, error })
                        : Effect.die(new Error('Database replacement was interrupted')),
                    onSuccess: database => database.querySchema().pipe(
                        Effect.matchEffect({
                            onFailure: error => this.restoreRuntimeAfterPreparationFailure(engine, database)
                                ? Effect.succeed({ kind: 'failed' as const, error })
                                : Effect.die(new Error('Database replacement was interrupted')),
                            onSuccess: schema => Effect.sync(() => {
                                this.finishRuntimePreparation(engine, database, { kind: 'initialized' });
                                return { kind: 'loaded' as const, schema, dbData };
                            }),
                        }),
                    ),
                }),
            );
        });
    }

    private createEmptyRuntimeWithNewEngine(): GameEditorRuntime {
        if (this.disposed) {
            throw new Error('Cannot create a runtime for a disposed game editor session');
        }
        else {
            const runtime = {
                engine: this.databaseEngineFactory(),
                database: null,
                databaseFrontier: { kind: 'initialized' as const },
            };
            this.runtimeState = { kind: 'ready', runtime };
            return runtime;
        }
    }

    private beginRuntimePreparationWithNewEngine(): DatabaseEngine {
        if (this.disposed) {
            throw new Error('Cannot prepare a runtime for a disposed game editor session');
        }
        else {
            const engine = this.databaseEngineFactory();
            this.runtimeState = { kind: 'preparing', engine };
            return engine;
        }
    }

    private beginRuntimePreparation(engine: DatabaseEngine): void {
        if (this.disposed) {
            throw new Error('Cannot prepare a runtime for a disposed game editor session');
        }
        else {
            this.runtimeState = { kind: 'preparing', engine };
        }
    }

    private finishRuntimePreparation(
        engine: DatabaseEngine,
        database: DatabaseConnection,
        databaseFrontier: DatabaseFrontier,
    ): GameEditorRuntime {
        if (!this.disposed && this.runtimeState.kind === 'preparing' && this.runtimeState.engine === engine) {
            const runtime = { engine, database, databaseFrontier };
            this.runtimeState = { kind: 'ready', runtime };
            return runtime;
        }
        else {
            engine.dispose();
            throw new Error('Game editor runtime state changed while it was being prepared');
        }
    }

    private restoreRuntimeAfterPreparationFailure(
        engine: DatabaseEngine,
        database: DatabaseConnection | null,
    ): boolean {
        if (!this.disposed && this.runtimeState.kind === 'preparing' && this.runtimeState.engine === engine) {
            this.runtimeState = {
                kind: 'ready',
                runtime: {
                    engine,
                    database,
                    databaseFrontier: { kind: 'dirty' },
                },
            };
            return true;
        }
        else {
            return false;
        }
    }

    private get runtime(): GameEditorRuntime {
        if (this.runtimeState.kind === 'ready') {
            return this.runtimeState.runtime;
        }
        else if (this.runtimeState.kind === 'empty') {
            throw new Error('Game editor session has no runtime');
        }
        else if (this.runtimeState.kind === 'preparing') {
            throw new Error('Game editor session runtime is still being prepared');
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

    private publishSnapshot(snapshot: GameEditorSnapshot): void {
        if (this.disposed) {
            return;
        }

        this.snapshot = snapshot;
        for (const listener of this.listeners) {
            listener();
        }
    }

    private publishDocumentChange(change: CommittedGameDocumentChange): void {
        if (this.disposed) {
            return;
        }

        for (const listener of this.documentChangeListeners) {
            listener(change);
        }
    }

    private updateReadySnapshot(
        update: (snapshot: Extract<GameEditorSnapshot, { kind: 'ready' }>) => Extract<GameEditorSnapshot, { kind: 'ready' }>,
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

function copyGameWithScenes(game: Game, scenes: Scene[]): Game {
    return new Game(
        game.title,
        game.teaser,
        game.copyright,
        game.dbData,
        scenes,
        game.dbSystem,
        game.dbSystemMinVersion,
    );
}

function createSceneCommandHistoryEntry(
    command: GameEditorCommand,
    previousGame: Game,
): SceneCommandHistoryEntry | null {
    switch (command.type) {
        case 'update-scene': {
            const previousScene = previousGame.scenes[command.index];
            assert(previousScene !== undefined, 'The updated scene is missing from the previous game');
            return {
                undo: { type: 'update-scene', index: command.index, scene: previousScene },
                redo: command,
            };
        }
        case 'add-scene':
            return {
                undo: { type: 'delete-scene', index: command.index },
                redo: command,
            };
        case 'delete-scene': {
            const deletedScene = previousGame.scenes[command.index];
            assert(deletedScene !== undefined, 'The deleted scene is missing from the previous game');
            return {
                undo: { type: 'add-scene', index: command.index, scene: deletedScene },
                redo: command,
            };
        }
        case 'reorder-scenes': {
            const inverseIndices = new Array<number>(command.indices.length);
            command.indices.forEach((previousIndex, currentIndex) => {
                inverseIndices[previousIndex] = currentIndex;
            });
            const changed = command.indices.some((previousIndex, currentIndex) => previousIndex !== currentIndex);
            return changed
                ? {
                    undo: { type: 'reorder-scenes', indices: inverseIndices },
                    redo: command,
                }
                : null;
        }
        case 'update-metadata':
        case 'set-database-source':
        case 'test-scene':
        case 'test-scenes-up-to':
        case 'execute-sql':
            return null;
        default: { const _n: never = command; return _n; }
    }
}

function isPermutation(indices: number[], length: number): boolean {
    return indices.length === length
        && new Set(indices).size === length
        && indices.every(index => Number.isInteger(index) && index >= 0 && index < length);
}

function isGameEditorCommandCancellable(command: GameEditorCommand): boolean {
    switch (command.type) {
        case 'set-database-source':
        case 'test-scene':
        case 'test-scenes-up-to':
        case 'execute-sql':
            return true;
        case 'update-metadata':
        case 'update-scene':
        case 'add-scene':
        case 'delete-scene':
        case 'reorder-scenes':
            return false;
        default: { const _n: never = command; return _n; }
    }
}

function makeGameEditorURI(uri: string): GameEditorURI {
    return uri as GameEditorURI;
}

function getGameSourceKey(source: GameSource): string | null {
    if (source.type === 'object') {
        return null;
    }
    else if (source.type === 'auto' || source.type === 'xml' || source.type === 'eskuel-game-package') {
        return source.source.type === 'fetch'
            ? `url:${source.source.url}`
            : null;
    }
    else { const _n: never = source; return _n; }
}
