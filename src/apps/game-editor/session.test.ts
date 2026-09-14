import { afterEach, describe, expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import { vi } from 'vitest';

import type {
    DatabaseConnection,
    DatabaseEngine,
    DatabaseEngineFactory,
    DbData,
    SqlResult,
} from '../../database/api';
import { Game, type Scene } from '../../game/model';
import { registerCodeEditorModel } from '../../gui-helpers/code-editor/uri';
import type { GamePlatformAdapters } from '../../platform/game';
import type { Schema } from '../../schema/model';
import { createSettingsStore } from '../../settings/store';
import { GameDocumentDraftPersistence } from './draft-persistence';
import type { GameDocumentDraftStore } from './draft-store';
import { GameEditorSession } from './session';
import type { GameEditorSnapshot } from './session';

afterEach(() => {
    vi.restoreAllMocks();
});

function getReadySnapshot(session: GameEditorSession): Extract<GameEditorSnapshot, { kind: 'ready' }> {
    const snapshot = session.getSnapshot();
    if (snapshot.kind !== 'ready') {
        throw new Error('Game editor session is not ready');
    }
    return snapshot;
}

function createGame(dbData: DbData | null = null): Game {
    return new Game(
        'Test game',
        'Teaser',
        'Copyright',
        dbData,
        [
            { type: 'text', text: 'First scene' },
            { type: 'text', text: 'Second scene' },
        ],
    );
}

function createEngineFactory(connection: DatabaseConnection): DatabaseEngineFactory {
    return () => ({
        open() {
            return Effect.succeed(connection);
        },
        dispose() {},
    });
}

function createTestGamePlatformAdapters(databaseEngineFactory: DatabaseEngineFactory): GamePlatformAdapters {
    return {
        databaseEngineFactory,
        supportedDatabaseSystems: ['sqlite'],
        xmlParser: {
            parse() {
                throw new Error('XML parsing is not used by these tests');
            },
        },
    };
}

function createTestingEngine(): {
    factory: DatabaseEngineFactory,
    getOpenCount: () => number,
    calls: string[],
} {
    let openCount = 0;
    const calls: string[] = [];
    const engine: DatabaseEngine = {
        open() {
            return Effect.sync(() => {
                const databaseNumber = openCount++;
                let value = 0;
                const connection: DatabaseConnection = {
                    exec(sql: string) {
                        calls.push(`${databaseNumber}:${sql}`);
                        let result: SqlResult;
                        switch (sql) {
                            case 'CHECK':
                                result = {
                                    type: 'succ',
                                    sql,
                                    result: [{ columns: ['value'], values: [[value]] }],
                                };
                                break;
                            case 'CHECK_AFTER_ERROR':
                                result = value === 0
                                    ? {
                                        type: 'succ',
                                        sql,
                                        result: [{ columns: ['value'], values: [[value]] }],
                                    }
                                    : { type: 'error', sql, message: 'check failed' };
                                break;
                            case 'SOL':
                                value = 1;
                                result = { type: 'succ', sql, result: [] };
                                break;
                            case 'NO_CHANGE':
                                result = { type: 'succ', sql, result: [] };
                                break;
                            case 'BAD_SOL':
                                result = { type: 'error', sql, message: 'solution failed' };
                                break;
                            case 'SELECT':
                                result = {
                                    type: 'succ',
                                    sql,
                                    result: [{ columns: ['value'], values: [[value]] }],
                                };
                                break;
                            case 'EXPERIMENT':
                                value = 99;
                                result = { type: 'succ', sql, result: [] };
                                break;
                            default:
                                result = { type: 'error', sql, message: `Unexpected SQL: ${sql}` };
                                break;
                        }
                        return Effect.succeed(result);
                    },
                    querySchema() {
                        return Effect.succeed([]);
                    },
                    close() {
                        return Effect.void;
                    },
                };
                return connection;
            });
        },
        dispose() {},
    };

    return {
        factory: () => engine,
        getOpenCount: () => openCount,
        calls,
    };
}

function createTestingGame(scenes: Game['scenes']): Game {
    return new Game(
        'Testing game',
        'Teaser',
        'Copyright',
        { type: 'initial-sql-script', system: 'sqlite', systemMinVersion: '3.0.0', sql: 'INITIALIZE' },
        scenes,
    );
}

function createSelectScene(sqlSol: string): Extract<Scene, { type: 'select' }> {
    return {
        type: 'select',
        text: sqlSol,
        sqlSol,
        sqlPlaceholder: '',
        ordinaryHints: [],
        hasSolHint: false,
        isRowOrderRelevant: false,
        isColOrderRelevant: false,
        areColNamesRelevant: false,
    };
}

function createManipulateScene(
    sqlSol: string = 'SOL',
    sqlCheck: string = 'CHECK',
): Extract<Scene, { type: 'manipulate' }> {
    return {
        type: 'manipulate',
        text: sqlSol,
        sqlSol,
        sqlCheck,
        sqlPlaceholder: '',
        ordinaryHints: [],
        hasSolHint: false,
};
}

function createNonTaskScene(
    type: 'text' | 'image',
    label: string,
): Extract<Scene, { type: 'text' | 'image' }> {
    switch (type) {
        case 'text':
            return { type, text: label };
        case 'image':
            return { type, base64string: label, mediaType: 'image/png' };
        default: { const _n: never = type; return _n; }
    }
}

describe('GameEditorSession', () => {
    it.effect('publishes the game before its database schema has finished loading', () => Effect.gen(function* () {
        const schemaQueryStarted = yield* Deferred.make<void>();
        const schemaResult = yield* Deferred.make<Schema>();
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema: vi.fn(() => Deferred.succeed(schemaQueryStarted, undefined).pipe(
                Effect.zipRight(Deferred.await(schemaResult)),
            )),
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createGame({
                    type: 'initial-sql-script',
                    system: 'sqlite',
                    systemMinVersion: '3.0.0',
                    sql: '',
                }),
            },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );

        const resolving = yield* Effect.fork(session.resolve());
        yield* Deferred.await(schemaQueryStarted);
        expect(getReadySnapshot(session).databaseStatus.kind).toBe('pending');
        expect(getReadySnapshot(session).document.game.title).toBe('Test game');

        yield* Deferred.succeed(schemaResult, []);
        yield* Fiber.join(resolving);

        expect(getReadySnapshot(session).databaseStatus).toEqual({
            kind: 'loaded',
            schema: [],
            dbData: {
                type: 'initial-sql-script',
                system: 'sqlite',
                systemMinVersion: '3.0.0',
                sql: '',
            },
        });
    }));

    it.effect('updates metadata and scenes through serialized commands', () => Effect.gen(function* () {
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );
        yield* session.resolve();

        yield* session.dispatch({
            type: 'update-metadata',
            title: 'Changed title',
            teaser: 'Changed teaser',
            copyright: 'Changed copyright',
        });
        yield* session.dispatch({
            type: 'update-scene',
            index: 0,
            scene: { type: 'text', text: 'Changed scene' },
        });
        yield* session.dispatch({ type: 'reorder-scenes', indices: [1, 0] });

        const snapshot = getReadySnapshot(session);
        expect(snapshot.document.game.title).toBe('Changed title');
        expect(snapshot.document.game.teaser).toBe('Changed teaser');
        expect(snapshot.document.game.copyright).toBe('Changed copyright');
        expect(snapshot.document.game.scenes).toEqual([
            { type: 'text', text: 'Second scene' },
            { type: 'text', text: 'Changed scene' },
        ]);
        expect(snapshot.commandStatus).toEqual({ kind: 'idle' });
    }));

    it.effect('publishes committed game-document changes with increasing revisions', () => Effect.gen(function* () {
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );
        yield* session.resolve();
        const changes: Array<{ type: string, revision: number }> = [];
        session.subscribeToDocumentChanges(event => {
            changes.push({ type: event.change.type, revision: event.document.revision });
        });

        yield* session.dispatch({
            type: 'update-metadata',
            title: 'Changed title',
            teaser: 'Changed teaser',
            copyright: 'Changed copyright',
        });
        yield* session.dispatch({ type: 'reorder-scenes', indices: [0, 1] });
        yield* session.dispatch({ type: 'reorder-scenes', indices: [1, 0] });
        session.setFilename('changed.xml');

        expect(changes).toEqual([
            { type: 'metadata-updated', revision: 1 },
            { type: 'scenes-reordered', revision: 2 },
            { type: 'filename-changed', revision: 3 },
        ]);
        const snapshot = getReadySnapshot(session);
        expect(snapshot.document.filename).toBe('changed.xml');
        expect(snapshot.document.revision).toBe(3);
    }));

    it.effect('keeps file changes sticky through undo until the current game is saved', () => Effect.gen(function* () {
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );
        yield* session.resolve();

        expect(session.hasUnsavedFileChanges()).toBe(false);
        session.setFilename('renamed.xml');
        expect(session.hasUnsavedFileChanges()).toBe(false);

        yield* session.dispatch({
            type: 'update-scene',
            index: 0,
            scene: { type: 'text', text: 'Changed scene' },
        });
        expect(session.hasUnsavedFileChanges()).toBe(true);

        yield* session.undoSceneCommand();
        expect(session.hasUnsavedFileChanges()).toBe(true);

        yield* session.dispatch({
            type: 'update-metadata',
            title: 'Changed title',
            teaser: 'Changed teaser',
            copyright: 'Changed copyright',
        });
        const savedGame = getReadySnapshot(session).document.game;
        expect(session.hasUnsavedFileChanges()).toBe(true);
        yield* Effect.promise(() => session.markGameAsSaved(savedGame));
        expect(session.hasUnsavedFileChanges()).toBe(false);

        yield* session.dispatch({
            type: 'update-metadata',
            title: 'Newer title',
            teaser: 'Newer teaser',
            copyright: 'Newer copyright',
        });
        yield* Effect.promise(() => session.markGameAsSaved(savedGame));
        expect(session.hasUnsavedFileChanges()).toBe(true);
    }));

    it.effect('treats a document without a saved-file checkpoint as dirty', () => Effect.gen(function* () {
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'new-game.xml',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
            undefined,
            { savedGameFingerprint: null },
        );
        yield* session.resolve();

        expect(session.hasUnsavedFileChanges()).toBe(true);
    }));

    it.effect('persists metadata, order, and individual scenes without rewriting large records', () => Effect.gen(function* () {
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );
        const store: GameDocumentDraftStore = {
            loadAll: vi.fn(async () => []),
            replace: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
            deleteDocument: vi.fn(async () => undefined),
        };
        const persistence = new GameDocumentDraftPersistence(session, store);
        yield* Effect.promise(() => persistence.persistInitialDocument());
        vi.mocked(store.update).mockClear();

        yield* session.dispatch({
            type: 'update-metadata',
            title: 'Changed title',
            teaser: 'Changed teaser',
            copyright: 'Changed copyright',
        });
        yield* session.dispatch({ type: 'reorder-scenes', indices: [1, 0] });
        yield* session.dispatch({
            type: 'update-scene',
            index: 0,
            scene: { type: 'text', text: 'Updated after reordering' },
        });
        yield* session.dispatch({
            type: 'add-scene',
            index: 1,
            scene: { type: 'text', text: 'Temporary scene' },
        });
        yield* session.dispatch({ type: 'delete-scene', index: 1 });
        yield* session.dispatch({
            type: 'set-database-source',
            source: {
                type: 'initial-sql-script',
                source: { type: 'inline', content: '-- eskuel:system=sqlite\n-- eskuel:systemMinVersion=3.0.0\nCREATE TABLE marker (id INTEGER);' },
            },
        });
        yield* Effect.promise(() => persistence.flush());

        expect(store.update).toHaveBeenCalledTimes(6);
        expect(vi.mocked(store.update).mock.calls[0][0]).toMatchObject({
            scenesToPut: [],
            sceneIdsToDelete: [],
            databaseSource: { type: 'unchanged' },
        });
        expect(vi.mocked(store.update).mock.calls[1][0]).toMatchObject({
            scenesToPut: [],
            sceneIdsToDelete: [],
            databaseSource: { type: 'unchanged' },
        });
        expect(vi.mocked(store.update).mock.calls[2][0]).toMatchObject({
            scenesToPut: [{ scene: { type: 'text', text: 'Updated after reordering' } }],
            sceneIdsToDelete: [],
            databaseSource: { type: 'unchanged' },
        });
        expect(vi.mocked(store.update).mock.calls[2][0].scenesToPut[0]?.id).toBe(
            vi.mocked(store.update).mock.calls[1][0].sceneIds[0],
        );
        expect(vi.mocked(store.update).mock.calls[3][0]).toMatchObject({
            scenesToPut: [{ scene: { type: 'text', text: 'Temporary scene' } }],
            sceneIdsToDelete: [],
            databaseSource: { type: 'unchanged' },
        });
        const addedSceneId = vi.mocked(store.update).mock.calls[3][0].scenesToPut[0]?.id;
        expect(addedSceneId).toBeDefined();
        expect(vi.mocked(store.update).mock.calls[4][0]).toMatchObject({
            scenesToPut: [],
            sceneIdsToDelete: [addedSceneId],
            databaseSource: { type: 'unchanged' },
        });
        expect(vi.mocked(store.update).mock.calls[5][0]).toMatchObject({
            scenesToPut: [],
            sceneIdsToDelete: [],
            databaseSource: {
                type: 'replace',
                data: {
                    type: 'initial-sql-script',
                    system: 'sqlite',
                    sql: '-- eskuel:system=sqlite\n-- eskuel:systemMinVersion=3.0.0\nCREATE TABLE marker (id INTEGER);',
                },
            },
        });
        persistence.dispose();
    }));

    it.effect('repairs a failed incremental draft write with a full replacement on the next change', () => Effect.gen(function* () {
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );
        const writeFailure = new Error('IndexedDB transaction failed');
        const store: GameDocumentDraftStore = {
            loadAll: vi.fn(async () => []),
            replace: vi.fn(async () => undefined),
            update: vi.fn(async () => {
                throw writeFailure;
            }),
            deleteDocument: vi.fn(async () => undefined),
        };
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const persistence = new GameDocumentDraftPersistence(session, store);
        const publishedSnapshots: ReturnType<typeof persistence.getSnapshot>[] = [];
        persistence.subscribe(() => publishedSnapshots.push(persistence.getSnapshot()));
        yield* Effect.promise(() => persistence.persistInitialDocument());

        yield* session.dispatch({
            type: 'update-metadata',
            title: 'First change',
            teaser: 'First teaser',
            copyright: 'First copyright',
        });
        yield* Effect.promise(() => persistence.flush());

        expect(persistence.getSnapshot()).toEqual({
            kind: 'failed',
            persistedRevision: 0,
            targetRevision: 1,
            error: writeFailure,
        });
        expect(publishedSnapshots).toContainEqual(expect.objectContaining({
            kind: 'failed',
            persistedRevision: 0,
            targetRevision: 1,
        }));

        yield* session.dispatch({
            type: 'update-metadata',
            title: 'Recovered change',
            teaser: 'Recovered teaser',
            copyright: 'Recovered copyright',
        });
        yield* Effect.promise(() => persistence.flush());

        expect(store.update).toHaveBeenCalledOnce();
        expect(store.replace).toHaveBeenCalledTimes(2);
        expect(vi.mocked(store.replace).mock.calls[1][0].document).toMatchObject({
            revision: 2,
            game: {
                title: 'Recovered change',
                teaser: 'Recovered teaser',
                copyright: 'Recovered copyright',
            },
        });
        expect(persistence.getSnapshot()).toEqual({ kind: 'idle', persistedRevision: 2 });
        expect(consoleError).toHaveBeenCalledWith('Failed to persist a game-editor draft:', writeFailure);
        persistence.dispose();
    }));

    it.effect('serializes rapid draft writes and reports the newest queued revision', () => Effect.gen(function* () {
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );
        const pendingUpdates: Array<() => void> = [];
        const store: GameDocumentDraftStore = {
            loadAll: vi.fn(async () => []),
            replace: vi.fn(async () => undefined),
            update: vi.fn(() => new Promise<void>(resolve => pendingUpdates.push(resolve))),
            deleteDocument: vi.fn(async () => undefined),
        };
        const persistence = new GameDocumentDraftPersistence(session, store);
        yield* Effect.promise(() => persistence.persistInitialDocument());

        yield* session.dispatch({
            type: 'update-metadata',
            title: 'Revision one',
            teaser: 'Teaser one',
            copyright: 'Copyright one',
        });
        yield* session.dispatch({
            type: 'update-metadata',
            title: 'Revision two',
            teaser: 'Teaser two',
            copyright: 'Copyright two',
        });
        yield* Effect.promise(() => vi.waitFor(() => expect(store.update).toHaveBeenCalledTimes(1)));

        expect(persistence.getSnapshot()).toEqual({
            kind: 'saving',
            persistedRevision: 0,
            targetRevision: 2,
        });
        pendingUpdates[0]?.();
        yield* Effect.promise(() => vi.waitFor(() => expect(store.update).toHaveBeenCalledTimes(2)));
        expect(vi.mocked(store.update).mock.calls.map(([update]) => update.document.revision)).toEqual([1, 2]);
        expect(persistence.getSnapshot()).toEqual({
            kind: 'saving',
            persistedRevision: 1,
            targetRevision: 2,
        });

        pendingUpdates[1]?.();
        yield* Effect.promise(() => persistence.flush());
        expect(persistence.getSnapshot()).toEqual({ kind: 'idle', persistedRevision: 2 });
        persistence.dispose();
    }));

    it.effect('waits for queued writes before discarding a draft', () => Effect.gen(function* () {
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );
        let finishUpdate: (() => void) | undefined;
        const store: GameDocumentDraftStore = {
            loadAll: vi.fn(async () => []),
            replace: vi.fn(async () => undefined),
            update: vi.fn(() => new Promise<void>(resolve => {
                finishUpdate = resolve;
            })),
            deleteDocument: vi.fn(async () => undefined),
        };
        const persistence = new GameDocumentDraftPersistence(session, store);
        yield* Effect.promise(() => persistence.persistInitialDocument());
        yield* session.dispatch({
            type: 'update-metadata',
            title: 'Pending change',
            teaser: 'Pending teaser',
            copyright: 'Pending copyright',
        });
        yield* Effect.promise(() => vi.waitFor(() => expect(store.update).toHaveBeenCalledOnce()));

        const discarded = persistence.discard();
        yield* Effect.promise(() => Promise.resolve());
        expect(store.deleteDocument).not.toHaveBeenCalled();

        finishUpdate?.();
        yield* Effect.promise(() => discarded);
        expect(store.deleteDocument).toHaveBeenCalledOnce();
        expect(store.deleteDocument).toHaveBeenCalledWith(session.documentId, 1);
    }));

    it.effect('does not enqueue draft writes after disposal', () => Effect.gen(function* () {
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );
        const store: GameDocumentDraftStore = {
            loadAll: vi.fn(async () => []),
            replace: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
            deleteDocument: vi.fn(async () => undefined),
        };
        const persistence = new GameDocumentDraftPersistence(session, store);
        yield* Effect.promise(() => persistence.persistInitialDocument());
        persistence.dispose();

        yield* session.dispatch({
            type: 'update-metadata',
            title: 'Ignored change',
            teaser: 'Ignored teaser',
            copyright: 'Ignored copyright',
        });
        yield* Effect.promise(() => persistence.flush());

        expect(store.replace).toHaveBeenCalledOnce();
        expect(store.update).not.toHaveBeenCalled();
    }));

    it.effect('undoes and redoes scene commands using their inverses', () => Effect.gen(function* () {
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );
        yield* session.resolve();

        expect(session.canUndoSceneCommand()).toBe(false);
        expect(session.canRedoSceneCommand()).toBe(false);
        yield* session.undoSceneCommand();
        yield* session.redoSceneCommand();
        yield* session.dispatch({
            type: 'update-metadata',
            title: 'Changed title',
            teaser: 'Changed teaser',
            copyright: 'Changed copyright',
        });
        yield* session.dispatch({ type: 'reorder-scenes', indices: [0, 1] });
        expect(session.canUndoSceneCommand()).toBe(false);

        const updatedScene = { type: 'text' as const, text: 'Updated scene' };
        const insertedScene = { type: 'text' as const, text: 'Inserted scene' };
        yield* session.dispatch({ type: 'update-scene', index: 0, scene: updatedScene });
        yield* session.dispatch({ type: 'add-scene', index: 1, scene: insertedScene });
        yield* session.dispatch({ type: 'reorder-scenes', indices: [2, 0, 1] });
        yield* session.dispatch({ type: 'delete-scene', index: 1 });

        expect(getReadySnapshot(session).document.game.scenes).toEqual([
            { type: 'text', text: 'Second scene' },
            insertedScene,
        ]);
        expect(session.canUndoSceneCommand()).toBe(true);
        expect(session.canRedoSceneCommand()).toBe(false);

        yield* session.undoSceneCommand();
        expect(getReadySnapshot(session).document.game.scenes).toEqual([
            { type: 'text', text: 'Second scene' },
            updatedScene,
            insertedScene,
        ]);
        yield* session.undoSceneCommand();
        expect(getReadySnapshot(session).document.game.scenes).toEqual([
            updatedScene,
            insertedScene,
            { type: 'text', text: 'Second scene' },
        ]);
        yield* session.undoSceneCommand();
        expect(getReadySnapshot(session).document.game.scenes).toEqual([
            updatedScene,
            { type: 'text', text: 'Second scene' },
        ]);
        yield* session.undoSceneCommand();
        expect(getReadySnapshot(session).document.game.scenes).toEqual([
            { type: 'text', text: 'First scene' },
            { type: 'text', text: 'Second scene' },
        ]);
        expect(session.canUndoSceneCommand()).toBe(false);
        expect(session.canRedoSceneCommand()).toBe(true);

        yield* session.redoSceneCommand();
        yield* session.redoSceneCommand();
        yield* session.redoSceneCommand();
        yield* session.redoSceneCommand();
        expect(getReadySnapshot(session).document.game.scenes).toEqual([
            { type: 'text', text: 'Second scene' },
            insertedScene,
        ]);
        expect(session.canUndoSceneCommand()).toBe(true);
        expect(session.canRedoSceneCommand()).toBe(false);

        yield* session.undoSceneCommand();
        expect(session.canRedoSceneCommand()).toBe(true);
        yield* session.dispatch({
            type: 'update-scene',
            index: 0,
            scene: { type: 'text', text: 'Fresh edit' },
        });
        expect(session.canRedoSceneCommand()).toBe(false);
        expect(getReadySnapshot(session).document.game.scenes).toEqual([
            { type: 'text', text: 'Fresh edit' },
            updatedScene,
            insertedScene,
        ]);
        session.dispose();
    }));

    it.effect('inserts scenes at the requested positions', () => Effect.gen(function* () {
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );
        yield* session.resolve();

        yield* session.dispatch({ type: 'add-scene', index: 0, scene: { type: 'text', text: 'New first scene' } });
        yield* session.dispatch({ type: 'add-scene', index: 2, scene: { type: 'text', text: 'New middle scene' } });
        yield* session.dispatch({ type: 'add-scene', index: 4, scene: { type: 'text', text: 'New last scene' } });

        expect(getReadySnapshot(session).document.game.scenes).toEqual([
            { type: 'text', text: 'New first scene' },
            { type: 'text', text: 'First scene' },
            { type: 'text', text: 'New middle scene' },
            { type: 'text', text: 'Second scene' },
            { type: 'text', text: 'New last scene' },
        ]);
    }));

    it.effect('shows a running command and pending database while replacing the database', () => Effect.gen(function* () {
        const schemaQueryStarted = yield* Deferred.make<void>();
        const schemaResult = yield* Deferred.make<Schema>();
        const connection: DatabaseConnection = {
            exec() {
                return Effect.die(new Error('Not used by the editor'));
            },
            querySchema: vi.fn(() => Deferred.succeed(schemaQueryStarted, undefined).pipe(
                Effect.zipRight(Deferred.await(schemaResult)),
            )),
            close() { return Effect.void; },
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );
        yield* session.resolve();

        const replacing = yield* Effect.fork(session.dispatch({
            type: 'set-database-source',
            source: {
                type: 'initial-sql-script',
                source: { type: 'inline', content: 'CREATE TABLE example (id INTEGER);' },
            },
        }));
        yield* Deferred.await(schemaQueryStarted);
        const runningSnapshot = getReadySnapshot(session);
        expect(runningSnapshot.commandStatus.kind).toBe('running');
        expect(runningSnapshot.databaseStatus.kind).toBe('pending');

        yield* Deferred.succeed(schemaResult, []);
        yield* Fiber.join(replacing);

        const snapshot = getReadySnapshot(session);
        expect(snapshot.commandStatus).toEqual({ kind: 'idle' });
        expect(snapshot.databaseStatus.kind).toBe('loaded');
        expect(snapshot.document.game.dbData).toEqual({
            type: 'initial-sql-script',
            system: 'sqlite',
            systemMinVersion: '3.0.0',
            sql: 'CREATE TABLE example (id INTEGER);',
        });
    }));

    it.effect('tests preceding manipulations and rebuilds from the source after an experiment', () => Effect.gen(function* () {
        const testingEngine = createTestingEngine();
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([
                    {
                        type: 'manipulate',
                        text: 'Change value',
                        sqlSol: 'SOL',
                        sqlCheck: 'CHECK',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                    },
                    {
                        type: 'select',
                        text: 'Read value',
                        sqlSol: 'SELECT',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                        isRowOrderRelevant: false,
                        isColOrderRelevant: false,
                        areColNamesRelevant: false,
                    },
                ]),
            },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        yield* session.resolve();

        yield* session.dispatch({ type: 'test-scene', index: 1 });
        expect(getReadySnapshot(session).sceneTestStatuses).toEqual([
            {
                kind: 'manipulate-result',
                outcome: 'success',
                result: {
                    type: 'succ',
                    sql: 'CHECK',
                    result: [{ columns: ['value'], values: [[1]] }],
                },
            },
            {
                kind: 'select-result',
                result: {
                    type: 'succ',
                    sql: 'SELECT',
                    result: [{ columns: ['value'], values: [[1]] }],
                },
            },
        ]);
        expect(testingEngine.getOpenCount()).toBe(1);

        const statusesBeforeExperiment = getReadySnapshot(session).sceneTestStatuses;
        yield* session.dispatch({ type: 'execute-sql', sql: 'EXPERIMENT' });
        expect(getReadySnapshot(session).sceneTestStatuses).toEqual(statusesBeforeExperiment);

        yield* session.dispatch({ type: 'test-scene', index: 1 });
        expect(testingEngine.getOpenCount()).toBe(2);
        expect(testingEngine.calls.slice(-4)).toEqual([
            '1:CHECK',
            '1:SOL',
            '1:CHECK',
            '1:SELECT',
        ]);
        session.dispose();
    }));

    it.effect('keeps all SQL results until they are removed', () => Effect.gen(function* () {
        const testingEngine = createTestingEngine();
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createTestingGame([{ type: 'text', text: 'Scene' }]) },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        yield* session.resolve();

        yield* session.dispatch({ type: 'execute-sql', sql: 'SELECT' });
        yield* session.dispatch({ type: 'execute-sql', sql: 'EXPERIMENT' });

        const results = getReadySnapshot(session).results;
        expect(results.map(entry => entry.type)).toEqual(['sql', 'sql']);
        expect(results.flatMap(entry => entry.type === 'sql' ? [entry.result.sql] : [])).toEqual(['EXPERIMENT', 'SELECT']);
        expect(results.map(entry => entry.id)).toEqual([1, 0]);

        session.removeResult(results[1].id);
        expect(getReadySnapshot(session).results.flatMap(entry => entry.type === 'sql' ? [entry.result.sql] : [])).toEqual(['EXPERIMENT']);

        yield* session.dispatch({
            type: 'set-database-source',
            source: {
                type: 'initial-sql-script',
                source: { type: 'inline', content: 'REPLACEMENT' },
            },
        });
        expect(getReadySnapshot(session).results).toEqual([]);
        session.dispose();
    }));

    it.effect('cancels SQL execution and restores the pre-command editor state', () => Effect.gen(function* () {
        const sqlStarted = yield* Deferred.make<void>();
        const sqlResult = yield* Deferred.make<SqlResult>();
        const connection: DatabaseConnection = {
            exec(sql) {
                if (sql === 'LONG') {
                    return Deferred.succeed(sqlStarted, undefined).pipe(
                        Effect.zipRight(Deferred.await(sqlResult)),
                    );
                }
                else {
                    return Effect.succeed({ type: 'succ', sql, result: [] });
                }
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() {
                return Effect.void;
            },
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createTestingGame([{ type: 'text', text: 'Scene' }]) },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
        );
        yield* session.resolve();

        const command = yield* Effect.fork(session.dispatch(
            { type: 'execute-sql', sql: 'LONG' },
        ));
        yield* Deferred.await(sqlStarted);
        expect(getReadySnapshot(session).commandStatus).toEqual({
            kind: 'running',
            command: { type: 'execute-sql', sql: 'LONG' },
        });

        session.cancelRunningCommand();
        yield* Fiber.join(command);

        expect(getReadySnapshot(session).commandStatus).toEqual({ kind: 'idle' });
        expect(getReadySnapshot(session).results).toEqual([
            { id: 0, type: 'database-reset-notice' },
        ]);
        expect(getReadySnapshot(session).databaseStatus.kind).toBe('loaded');
        session.dispose();
    }));

    it.effect('preserves completed scene tests and prior results after batch cancellation', () => Effect.gen(function* () {
        const sqlStarted = yield* Deferred.make<void>();
        const sqlResult = yield* Deferred.make<SqlResult>();
        let openCount = 0;
        const engineFactory: DatabaseEngineFactory = () => ({
            open() {
                return Effect.sync(() => {
                    const databaseNumber = openCount++;
                    return {
                        exec(sql: string) {
                            if (databaseNumber === 0 && sql === 'LONG') {
                                return Deferred.succeed(sqlStarted, undefined).pipe(
                                    Effect.zipRight(Deferred.await(sqlResult)),
                                );
                            }
                            else {
                                return Effect.succeed({
                                    type: 'succ' as const,
                                    sql,
                                    result: [{ columns: ['value'], values: [[databaseNumber]] }],
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
        const selectScene = (sqlSol: string) => ({
            type: 'select' as const,
            text: sqlSol,
            sqlSol,
            sqlPlaceholder: '',
            ordinaryHints: [],
            hasSolHint: false,
            isRowOrderRelevant: false,
            isColOrderRelevant: false,
            areColNamesRelevant: false,
        });
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([selectScene('FIRST'), selectScene('LONG')]),
            },
            createTestGamePlatformAdapters(engineFactory),
        );
        yield* session.resolve();
        const historicalResult: SqlResult = { type: 'succ', sql: 'HISTORY', result: [] };
        session.recordResult(historicalResult);

        const command = yield* Effect.fork(session.dispatch({ type: 'test-scenes-up-to', index: 1 }));
        yield* Deferred.await(sqlStarted);
        expect(getReadySnapshot(session).sceneTestStatuses[0].kind).toBe('select-result');

        session.cancelRunningCommand();
        yield* Fiber.join(command);

        const snapshot = getReadySnapshot(session);
        expect(snapshot.sceneTestStatuses.map(status => status.kind)).toEqual(['select-result', 'unknown']);
        expect(snapshot.sceneTestStatuses[0]).toMatchObject({
            kind: 'select-result',
            result: { sql: 'FIRST' },
        });
        expect(snapshot.results.map(entry => entry.type)).toEqual(['database-reset-notice', 'sql']);
        expect(snapshot.results.flatMap(entry => entry.type === 'sql' ? [entry.result] : [])).toEqual([historicalResult]);
        expect(openCount).toBe(2);
        session.dispose();
    }));

    it.effect('rebuilds the initial database while preserving a completed manipulation after batch cancellation', () => Effect.gen(function* () {
        const sqlStarted = yield* Deferred.make<void>();
        const sqlResult = yield* Deferred.make<SqlResult>();
        const calls: string[] = [];
        let openCount = 0;
        const engineFactory: DatabaseEngineFactory = () => ({
            open() {
                return Effect.sync(() => {
                    const databaseNumber = openCount++;
                    let value = 0;
                    return {
                        exec(sql: string) {
                            calls.push(`${databaseNumber}:${sql}`);
                            if (databaseNumber === 0 && sql === 'LONG') {
                                return Deferred.succeed(sqlStarted, undefined).pipe(
                                    Effect.zipRight(Deferred.await(sqlResult)),
                                );
                            }
                            else if (sql === 'CHECK') {
                                return Effect.succeed({
                                    type: 'succ' as const,
                                    sql,
                                    result: [{ columns: ['value'], values: [[value]] }],
                                });
                            }
                            else if (sql === 'SOL') {
                                value = 1;
                                return Effect.succeed({ type: 'succ' as const, sql, result: [] });
                            }
                            else if (sql === 'LONG') {
                                return Effect.succeed({
                                    type: 'succ' as const,
                                    sql,
                                    result: [{ columns: ['value'], values: [[value]] }],
                                });
                            }
                            else {
                                return Effect.succeed({ type: 'error' as const, sql, message: `Unexpected SQL: ${sql}` });
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
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([
                    {
                        type: 'manipulate',
                        text: 'Change value',
                        sqlSol: 'SOL',
                        sqlCheck: 'CHECK',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                    },
                    {
                        type: 'select',
                        text: 'Read value slowly',
                        sqlSol: 'LONG',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                        isRowOrderRelevant: false,
                        isColOrderRelevant: false,
                        areColNamesRelevant: false,
                    },
                ]),
            },
            createTestGamePlatformAdapters(engineFactory),
        );
        yield* session.resolve();

        const command = yield* Effect.fork(session.dispatch({ type: 'test-scenes-up-to', index: 1 }));
        yield* Deferred.await(sqlStarted);
        expect(getReadySnapshot(session).sceneTestStatuses[0]).toMatchObject({
            kind: 'manipulate-result',
            outcome: 'success',
        });

        session.cancelRunningCommand();
        yield* Fiber.join(command);

        expect(getReadySnapshot(session).sceneTestStatuses).toMatchObject([
            { kind: 'manipulate-result', outcome: 'success' },
            { kind: 'unknown' },
        ]);
        expect(openCount).toBe(2);

        const callCountBeforeRetest = calls.length;
        yield* session.dispatch({ type: 'test-scene', index: 1 });
        expect(calls.slice(callCountBeforeRetest)).toEqual([
            '1:CHECK',
            '1:SOL',
            '1:CHECK',
            '1:LONG',
        ]);
        expect(openCount).toBe(2);
        expect(getReadySnapshot(session).sceneTestStatuses[1].kind).toBe('select-result');
        session.dispose();
    }));

    it.effect.each([
        { commandType: 'single', phase: 'initial-check' },
        { commandType: 'single', phase: 'solution' },
        { commandType: 'single', phase: 'final-check' },
        { commandType: 'batch', phase: 'initial-check' },
        { commandType: 'batch', phase: 'solution' },
        { commandType: 'batch', phase: 'final-check' },
    ] as const)(
        'cancels a $commandType manipulation during its $phase and rebuilds the initial database',
        ({ commandType, phase }) => Effect.gen(function* () {
            const sqlStarted = yield* Deferred.make<void>();
            const sqlResult = yield* Deferred.make<SqlResult>();
            let openCount = 0;
            const engineFactory: DatabaseEngineFactory = () => ({
                open() {
                    return Effect.sync(() => {
                        const databaseNumber = openCount++;
                        let value = 0;
                        let checkCount = 0;
                        return {
                            exec(sql: string) {
                                if (sql === 'CHECK') {
                                    checkCount++;
                                    const pause = databaseNumber === 0 && (
                                        (phase === 'initial-check' && checkCount === 1)
                                        || (phase === 'final-check' && checkCount === 2)
                                    );
                                    const result: SqlResult = {
                                        type: 'succ',
                                        sql,
                                        result: [{ columns: ['value'], values: [[value]] }],
                                    };
                                    return pause
                                        ? Deferred.succeed(sqlStarted, undefined).pipe(
                                            Effect.zipRight(Deferred.await(sqlResult)),
                                        )
                                        : Effect.succeed(result);
                                }
                                else if (sql === 'SOL') {
                                    const pause = databaseNumber === 0 && phase === 'solution';
                                    if (pause) {
                                        return Deferred.succeed(sqlStarted, undefined).pipe(
                                            Effect.zipRight(Deferred.await(sqlResult)),
                                        );
                                    }
                                    else {
                                        value = 1;
                                        return Effect.succeed({ type: 'succ' as const, sql, result: [] });
                                    }
                                }
                                else if (sql === 'FAST' || sql === 'READ') {
                                    return Effect.succeed({
                                        type: 'succ' as const,
                                        sql,
                                        result: [{ columns: ['value'], values: [[value]] }],
                                    });
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
            const scenes = commandType === 'single'
                ? [createManipulateScene()]
                : [createSelectScene('FAST'), createManipulateScene()];
            const session = new GameEditorSession(
                'test',
                { type: 'object', source: createTestingGame(scenes) },
                createTestGamePlatformAdapters(engineFactory),
            );
            yield* session.resolve();

            const command = commandType === 'single'
                ? { type: 'test-scene' as const, index: 0 }
                : { type: 'test-scenes-up-to' as const, index: 1 };
            const testing = yield* Effect.fork(session.dispatch(command));
            yield* Deferred.await(sqlStarted);

            session.cancelRunningCommand();
            yield* Fiber.join(testing);

            const snapshot = getReadySnapshot(session);
            expect(snapshot.sceneTestStatuses.map(status => status.kind)).toEqual(
                commandType === 'single'
                    ? ['unknown']
                    : ['select-result', 'unknown'],
            );
            expect(snapshot.results).toEqual([
                { id: 0, type: 'database-reset-notice' },
            ]);
            expect(openCount).toBe(2);

            yield* session.dispatch({ type: 'execute-sql', sql: 'READ' });
            const latestResult = getReadySnapshot(session).results[0];
            expect(latestResult).toMatchObject({
                type: 'sql',
                result: {
                    type: 'succ',
                    sql: 'READ',
                    result: [{ columns: ['value'], values: [[0]] }],
                },
            });
            expect(openCount).toBe(2);
            session.dispose();
        }),
    );

    it.effect('cancels a batch before its first child completes without retaining a partial status', () => Effect.gen(function* () {
        const sqlStarted = yield* Deferred.make<void>();
        const sqlResult = yield* Deferred.make<SqlResult>();
        let openCount = 0;
        const engineFactory: DatabaseEngineFactory = () => ({
            open() {
                return Effect.sync(() => {
                    const databaseNumber = openCount++;
                    return {
                        exec(sql: string) {
                            if (databaseNumber === 0 && sql === 'LONG') {
                                return Deferred.succeed(sqlStarted, undefined).pipe(
                                    Effect.zipRight(Deferred.await(sqlResult)),
                                );
                            }
                            else {
                                return Effect.succeed({ type: 'succ' as const, sql, result: [] });
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
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([
                    createSelectScene('LONG'),
                    createManipulateScene(),
                ]),
            },
            createTestGamePlatformAdapters(engineFactory),
        );
        yield* session.resolve();

        const testing = yield* Effect.fork(session.dispatch({ type: 'test-scenes-up-to', index: 1 }));
        yield* Deferred.await(sqlStarted);
        session.cancelRunningCommand();
        yield* Fiber.join(testing);

        expect(getReadySnapshot(session).sceneTestStatuses.map(status => status.kind)).toEqual([
            'unknown',
            'unknown',
        ]);
        expect(getReadySnapshot(session).results).toEqual([
            { id: 0, type: 'database-reset-notice' },
        ]);
        expect(openCount).toBe(2);
        session.dispose();
    }));

    it.effect('aborts database-source loading without terminating or replacing the existing database', () => Effect.gen(function* () {
        const fetchStarted = yield* Deferred.make<void>();
        let fetchSignal: AbortSignal | null = null;
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
            fetchSignal = init?.signal ?? null;
            Effect.runSync(Deferred.succeed(fetchStarted, undefined));
            return new Promise<Response>((_resolve, reject) => {
                fetchSignal?.addEventListener('abort', () => {
                    reject(new DOMException('Aborted', 'AbortError'));
                }, { once: true });
            });
        });
        const dispose = vi.fn();
        let factoryCalls = 0;
        let openCalls = 0;
        const originalDbData: Extract<DbData, { type: 'initial-sql-script' }> = {
            type: 'initial-sql-script',
            system: 'sqlite',
            systemMinVersion: '3.0.0',
            sql: 'ORIGINAL',
        };
        const connection: DatabaseConnection = {
            exec(sql) {
                return Effect.succeed({ type: 'succ', sql, result: [] });
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() {
                return Effect.void;
            },
        };
        const engineFactory: DatabaseEngineFactory = () => {
            factoryCalls++;
            return {
                open() {
                    openCalls++;
                    return Effect.succeed(connection);
                },
                dispose,
            };
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame(originalDbData) },
            createTestGamePlatformAdapters(engineFactory),
        );
        yield* session.resolve();

        const command = yield* Effect.fork(session.dispatch({
            type: 'set-database-source',
            source: {
                type: 'initial-sql-script',
                source: { type: 'fetch', url: '/replacement.sql' },
            },
        }));
        yield* Deferred.await(fetchStarted);
        session.cancelRunningCommand();
        yield* Fiber.join(command);

        const snapshot = getReadySnapshot(session);
        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(fetchSignal).not.toBeNull();
        expect((fetchSignal as AbortSignal | null)?.aborted).toBe(true);
        expect(factoryCalls).toBe(1);
        expect(openCalls).toBe(1);
        expect(dispose).not.toHaveBeenCalled();
        expect(snapshot.document.game.dbData).toBe(originalDbData);
        expect(snapshot.databaseStatus).toEqual({ kind: 'loaded', schema: [], dbData: originalDbData });
        expect(snapshot.results).toEqual([
            { id: 0, type: 'database-source-load-cancelled-notice' },
        ]);

        yield* session.dispatch({ type: 'execute-sql', sql: 'SELECT still_usable' });
        const latestEntry = getReadySnapshot(session).results[0];
        expect(latestEntry.type).toBe('sql');
        expect(latestEntry.type === 'sql' ? latestEntry.result.sql : null).toBe('SELECT still_usable');
        session.dispose();
    }));

    it.effect('rebuilds the original database when source replacement is cancelled after materialization', () => Effect.gen(function* () {
        const replacementOpenStarted = yield* Deferred.make<void>();
        const replacementOpenResult = yield* Deferred.make<DatabaseConnection>();
        const originalDbData: Extract<DbData, { type: 'initial-sql-script' }> = {
            type: 'initial-sql-script',
            system: 'sqlite',
            systemMinVersion: '3.0.0',
            sql: 'ORIGINAL',
        };
        const replacementDbData: Extract<DbData, { type: 'initial-sql-script' }> = {
            type: 'initial-sql-script',
            system: 'sqlite',
            systemMinVersion: '3.0.0',
            sql: 'REPLACEMENT',
        };
        const openedSources: Array<DbData | null> = [];
        const engineDisposals = [vi.fn(), vi.fn()];
        let factoryCalls = 0;
        const engineFactory: DatabaseEngineFactory = () => {
            const engineNumber = factoryCalls++;
            const connection: DatabaseConnection = {
                exec(sql) {
                    return Effect.succeed({
                        type: 'succ',
                        sql,
                        result: [{ columns: ['engine'], values: [[engineNumber]] }],
                    });
                },
                querySchema() {
                    return Effect.succeed([]);
                },
                close() {
                    return Effect.void;
                },
            };
            return {
                open(source) {
                    openedSources.push(source);
                    const openingReplacementOnOriginalEngine = engineNumber === 0
                        && source?.type === 'initial-sql-script'
                        && source.sql === replacementDbData.sql;
                    if (openingReplacementOnOriginalEngine) {
                        return Deferred.succeed(replacementOpenStarted, undefined).pipe(
                            Effect.zipRight(Deferred.await(replacementOpenResult)),
                        );
                    }
                    else {
                        return Effect.succeed(connection);
                    }
                },
                dispose: engineDisposals[engineNumber],
            };
        };
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame(originalDbData) },
            createTestGamePlatformAdapters(engineFactory),
        );
        yield* session.resolve();

        const command = yield* Effect.fork(session.dispatch({
            type: 'set-database-source',
            source: {
                type: 'initial-sql-script',
                source: { type: 'inline', content: replacementDbData.sql },
            },
        }));
        yield* Deferred.await(replacementOpenStarted);
        session.cancelRunningCommand();
        expect(getReadySnapshot(session).commandStatus).toEqual({
            kind: 'rebuilding-after-cancellation',
            cancelledCommand: {
                type: 'set-database-source',
                source: {
                    type: 'initial-sql-script',
                    source: { type: 'inline', content: replacementDbData.sql },
                },
            },
        });
        yield* Fiber.join(command);

        const snapshot = getReadySnapshot(session);
        expect(factoryCalls).toBe(2);
        expect(openedSources).toEqual([originalDbData, replacementDbData, originalDbData]);
        expect(engineDisposals[0]).toHaveBeenCalledOnce();
        expect(engineDisposals[1]).not.toHaveBeenCalled();
        expect(snapshot.document.game.dbData).toBe(originalDbData);
        expect(snapshot.databaseStatus).toEqual({ kind: 'loaded', schema: [], dbData: originalDbData });
        expect(snapshot.results).toEqual([
            { id: 0, type: 'database-reset-notice' },
        ]);
        expect(snapshot.commandStatus).toEqual({ kind: 'idle' });

        yield* session.dispatch({ type: 'execute-sql', sql: 'SELECT still_usable' });
        const latestEntry = getReadySnapshot(session).results[0];
        expect(latestEntry.type).toBe('sql');
        expect(latestEntry.type === 'sql' && latestEntry.result.type === 'succ'
            ? latestEntry.result.result[0].values
            : null).toEqual([[1]]);
        session.dispose();
    }));

    it.effect.each([
        { sqlSol: 'SOL', sqlCheck: 'CHECK', outcome: 'success' },
        { sqlSol: 'NO_CHANGE', sqlCheck: 'CHECK', outcome: 'sql-check-no-witness' },
        { sqlSol: 'BAD_SOL', sqlCheck: 'CHECK', outcome: 'sql-sol-error' },
        { sqlSol: 'SOL', sqlCheck: 'CHECK_AFTER_ERROR', outcome: 'sql-check-error' },
    ] as const)('classifies a manipulate scene as $outcome', ({ sqlSol, sqlCheck, outcome }) => Effect.gen(function* () {
        const testingEngine = createTestingEngine();
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([{
                    type: 'manipulate',
                    text: 'Manipulate',
                    sqlSol,
                    sqlCheck,
                    sqlPlaceholder: '',
                    ordinaryHints: [],
                    hasSolHint: false,
                }]),
            },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        yield* session.resolve();

        yield* session.dispatch({ type: 'test-scene', index: 0 });

        expect(getReadySnapshot(session).sceneTestStatuses[0]).toMatchObject({
            kind: 'manipulate-result',
            outcome,
        });
        expect(getReadySnapshot(session).results[0]).toMatchObject({
            type: 'sql',
            result: { sql: outcome === 'sql-sol-error' ? sqlSol : sqlCheck },
        });
        session.dispose();
    }));

    it.effect.each([
        { commandType: 'single' },
        { commandType: 'batch' },
    ] as const)('retains and publishes a SELECT error from a $commandType test', ({ commandType }) => Effect.gen(function* () {
        const testingEngine = createTestingEngine();
        const scenes = commandType === 'single'
            ? [createSelectScene('BAD_SELECT')]
            : [createSelectScene('SELECT'), createSelectScene('BAD_SELECT')];
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createTestingGame(scenes) },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        yield* session.resolve();

        const command = commandType === 'single'
            ? { type: 'test-scene' as const, index: 0 }
            : { type: 'test-scenes-up-to' as const, index: 1 };
        yield* session.dispatch(command);

        const snapshot = getReadySnapshot(session);
        expect(snapshot.sceneTestStatuses.map(status => status.kind)).toEqual(
            commandType === 'single'
                ? ['select-result']
                : ['select-result', 'select-result'],
        );
        expect(snapshot.sceneTestStatuses.at(-1)).toEqual({
            kind: 'select-result',
            result: {
                type: 'error',
                sql: 'BAD_SELECT',
                message: 'Unexpected SQL: BAD_SELECT',
            },
        });
        expect(snapshot.results[0]).toEqual({
            id: 0,
            type: 'sql',
            result: {
                type: 'error',
                sql: 'BAD_SELECT',
                message: 'Unexpected SQL: BAD_SELECT',
            },
        });
        session.dispose();
    }));

    it.effect('compares complete manipulation checks before retaining bounded status and history results', () => Effect.gen(function* () {
        const settingsStore = createSettingsStore();
        settingsStore.update({ maxDisplayedResultRowsPerTable: 5 });
        let changed = false;
        const values = () => Array.from(
            { length: 60 },
            (_, index) => [index, index === 59 && changed ? 1 : 0],
        );
        const connection: DatabaseConnection = {
            exec(sql) {
                if (sql === 'CHECK') {
                    return Effect.succeed({
                        type: 'succ',
                        sql,
                        result: [{ columns: ['id', 'value'], values: values() }],
                    });
                }
                else if (sql === 'SOL') {
                    changed = true;
                    return Effect.succeed({ type: 'succ', sql, result: [] });
                }
                else {
                    return Effect.succeed({ type: 'error', sql, message: `Unexpected SQL: ${sql}` });
                }
            },
            querySchema() {
                return Effect.succeed([]);
            },
            close() {
                return Effect.void;
            },
        };
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([{
                    type: 'manipulate',
                    text: 'Change a row beyond the display limit',
                    sqlSol: 'SOL',
                    sqlCheck: 'CHECK',
                    sqlPlaceholder: '',
                    ordinaryHints: [],
                    hasSolHint: false,
                }]),
            },
            createTestGamePlatformAdapters(createEngineFactory(connection)),
            settingsStore,
        );
        yield* session.resolve();

        yield* session.dispatch({ type: 'test-scene', index: 0 });

        expect(getReadySnapshot(session).sceneTestStatuses[0]).toMatchObject({
            kind: 'manipulate-result',
            outcome: 'success',
            result: {
                result: [{ values: values().slice(0, 5), truncated: true }],
            },
        });

        yield* session.dispatch({ type: 'execute-sql', sql: 'CHECK' });
        expect(getReadySnapshot(session).results[0]).toMatchObject({
            type: 'sql',
            result: {
                result: [{ values: values().slice(0, 5), truncated: true }],
            },
        });

        session.recordResult({
            type: 'succ',
            sql: 'INSPECT',
            result: [{ columns: ['id', 'value'], values: values() }],
        });
        expect(getReadySnapshot(session).results[0]).toMatchObject({
            type: 'sql',
            result: {
                result: [{ values: values().slice(0, 5), truncated: true }],
            },
        });
        session.dispose();
    }));

    it.effect('tests every unknown task up to the selected scene in scene order', () => Effect.gen(function* () {
        const testingEngine = createTestingEngine();
        const selectScene = {
            type: 'select' as const,
            text: 'Read value',
            sqlSol: 'SELECT',
            sqlPlaceholder: '',
            ordinaryHints: [],
            hasSolHint: false,
            isRowOrderRelevant: false,
            isColOrderRelevant: false,
            areColNamesRelevant: false,
        };
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([
                    selectScene,
                    {
                        type: 'manipulate',
                        text: 'Change value',
                        sqlSol: 'SOL',
                        sqlCheck: 'CHECK',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                    },
                    { ...selectScene, text: 'Read changed value' },
                ]),
            },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        yield* session.resolve();

        yield* session.dispatch({ type: 'test-scenes-up-to', index: 2 });

        expect(getReadySnapshot(session).sceneTestStatuses.map(status => status.kind)).toEqual([
            'select-result',
            'manipulate-result',
            'select-result',
        ]);
        expect(testingEngine.calls).toEqual([
            '0:SELECT',
            '0:CHECK',
            '0:SOL',
            '0:CHECK',
            '0:SELECT',
        ]);
        expect(getReadySnapshot(session).results[0]).toMatchObject({
            type: 'sql',
            result: { sql: 'SELECT' },
        });
        const callCount = testingEngine.calls.length;
        yield* session.dispatch({ type: 'test-scenes-up-to', index: 2 });
        expect(testingEngine.calls).toHaveLength(callCount);
        expect(getReadySnapshot(session).results).toHaveLength(2);
        expect(getReadySnapshot(session).results[0]).toMatchObject({
            type: 'sql',
            result: { sql: 'SELECT' },
        });
        session.dispose();
    }));

    it.effect('publishes the final manipulation result when a batch ends on a manipulation', () => Effect.gen(function* () {
        const testingEngine = createTestingEngine();
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([
                    createSelectScene('SELECT'),
                    createManipulateScene(),
                ]),
            },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        yield* session.resolve();

        yield* session.dispatch({ type: 'test-scenes-up-to', index: 1 });

        const snapshot = getReadySnapshot(session);
        expect(snapshot.sceneTestStatuses).toMatchObject([
            { kind: 'select-result' },
            { kind: 'manipulate-result', outcome: 'success' },
        ]);
        expect(testingEngine.calls).toEqual([
            '0:SELECT',
            '0:CHECK',
            '0:SOL',
            '0:CHECK',
        ]);
        expect(snapshot.results[0]).toMatchObject({
            type: 'sql',
            result: {
                type: 'succ',
                sql: 'CHECK',
                result: [{ columns: ['value'], values: [[1]] }],
            },
        });
        session.dispose();
    }));

    it.effect('skips known tasks while testing the remaining scenes up to a target', () => Effect.gen(function* () {
        const testingEngine = createTestingEngine();
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([
                    createSelectScene('SELECT'),
                    createManipulateScene(),
                    createSelectScene('SELECT'),
                ]),
            },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        yield* session.resolve();
        yield* session.dispatch({ type: 'test-scene', index: 0 });
        const callCountBeforeBatch = testingEngine.calls.length;

        yield* session.dispatch({ type: 'test-scenes-up-to', index: 2 });

        expect(testingEngine.calls.slice(callCountBeforeBatch)).toEqual([
            '0:CHECK',
            '0:SOL',
            '0:CHECK',
            '0:SELECT',
        ]);
        expect(getReadySnapshot(session).sceneTestStatuses.map(status => status.kind)).toEqual([
            'select-result',
            'manipulate-result',
            'select-result',
        ]);
        expect(getReadySnapshot(session).results).toHaveLength(2);
        session.dispose();
    }));

    it.effect.each([
        { targetType: 'text' },
        { targetType: 'image' },
    ] as const)(
        'tests tasks around text and image scenes without publishing the final result for a $targetType target',
        ({ targetType }) => Effect.gen(function* () {
            const testingEngine = createTestingEngine();
            const middleType = targetType === 'text' ? 'image' : 'text';
            const session = new GameEditorSession(
                'test',
                {
                    type: 'object',
                    source: createTestingGame([
                        createNonTaskScene(targetType, 'before'),
                        createSelectScene('SELECT'),
                        createNonTaskScene(middleType, 'between'),
                        createManipulateScene(),
                        createNonTaskScene(targetType, 'after'),
                    ]),
                },
                createTestGamePlatformAdapters(testingEngine.factory),
            );
            yield* session.resolve();

            yield* session.dispatch({ type: 'test-scenes-up-to', index: 4 });

            expect(getReadySnapshot(session).sceneTestStatuses.map(status => status.kind)).toEqual([
                'none',
                'select-result',
                'none',
                'manipulate-result',
                'none',
            ]);
            expect(testingEngine.calls).toEqual([
                '0:SELECT',
                '0:CHECK',
                '0:SOL',
                '0:CHECK',
            ]);
            expect(getReadySnapshot(session).results).toEqual([]);
            session.dispose();
        }),
    );

    it.effect('does not publish a result when testing up to a non-task scene', () => Effect.gen(function* () {
        const testingEngine = createTestingEngine();
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([
                    {
                        type: 'select',
                        text: 'Read value',
                        sqlSol: 'SELECT',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                        isRowOrderRelevant: false,
                        isColOrderRelevant: false,
                        areColNamesRelevant: false,
                    },
                    { type: 'text', text: 'Explanation' },
                ]),
            },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        yield* session.resolve();

        yield* session.dispatch({ type: 'test-scenes-up-to', index: 1 });

        expect(getReadySnapshot(session).sceneTestStatuses.map(status => status.kind)).toEqual([
            'select-result',
            'none',
        ]);
        expect(testingEngine.calls).toEqual(['0:SELECT']);
        expect(getReadySnapshot(session).results).toEqual([]);
        session.dispose();
    }));

    it.effect('invalidates reordered task statuses only from the first changed position', () => Effect.gen(function* () {
        const testingEngine = createTestingEngine();
        const selectScene = {
            type: 'select' as const,
            text: 'Read value',
            sqlSol: 'SELECT',
            sqlPlaceholder: '',
            ordinaryHints: [],
            hasSolHint: false,
            isRowOrderRelevant: false,
            isColOrderRelevant: false,
            areColNamesRelevant: false,
        };
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([
                    {
                        type: 'manipulate',
                        text: 'Change value',
                        sqlSol: 'SOL',
                        sqlCheck: 'CHECK',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                    },
                    { ...selectScene, text: 'First read' },
                    { ...selectScene, text: 'Second read' },
                ]),
            },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        yield* session.resolve();
        yield* session.dispatch({ type: 'test-scenes-up-to', index: 2 });

        const openCountBeforeReorder = testingEngine.getOpenCount();
        yield* session.dispatch({ type: 'reorder-scenes', indices: [0, 2, 1] });

        expect(getReadySnapshot(session).sceneTestStatuses.map(status => status.kind)).toEqual([
            'manipulate-result',
            'unknown',
            'unknown',
        ]);
        yield* session.dispatch({ type: 'test-scene', index: 2 });
        expect(testingEngine.getOpenCount()).toBe(openCountBeforeReorder);
        session.dispose();
    }));

    it.effect('stops at a failed preceding manipulation and leaves the requested scene unknown', () => Effect.gen(function* () {
        const testingEngine = createTestingEngine();
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([
                    {
                        type: 'manipulate',
                        text: 'Broken manipulation',
                        sqlSol: 'BAD_SOL',
                        sqlCheck: 'CHECK',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                    },
                    {
                        type: 'select',
                        text: 'Read value',
                        sqlSol: 'SELECT',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                        isRowOrderRelevant: false,
                        isColOrderRelevant: false,
                        areColNamesRelevant: false,
                    },
                ]),
            },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        yield* session.resolve();

        yield* session.dispatch({ type: 'test-scene', index: 1 });

        const snapshot = getReadySnapshot(session);
        expect(snapshot.sceneTestStatuses).toEqual([
            {
                kind: 'manipulate-result',
                outcome: 'sql-sol-error',
                result: { type: 'error', sql: 'BAD_SOL', message: 'solution failed' },
            },
            { kind: 'unknown' },
        ]);
        expect(testingEngine.calls).not.toContain('0:SELECT');
        session.dispose();
    }));

    it.effect('keeps the prepared database when a later manipulation is edited', () => Effect.gen(function* () {
        const testingEngine = createTestingEngine();
        const selectScene = {
            type: 'select' as const,
            text: 'Read value',
            sqlSol: 'SELECT',
            sqlPlaceholder: '',
            ordinaryHints: [],
            hasSolHint: false,
            isRowOrderRelevant: false,
            isColOrderRelevant: false,
            areColNamesRelevant: false,
        };
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([
                    selectScene,
                    { type: 'text', text: 'Explanation' },
                    {
                        type: 'manipulate',
                        text: 'Change value',
                        sqlSol: 'SOL',
                        sqlCheck: 'CHECK',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                    },
                    selectScene,
                ]),
            },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        yield* session.resolve();
        yield* session.dispatch({ type: 'test-scene', index: 0 });

        yield* session.dispatch({
            type: 'update-scene',
            index: 2,
            scene: {
                type: 'manipulate',
                text: 'No longer changes value',
                sqlSol: 'NO_CHANGE',
                sqlCheck: 'CHECK',
                sqlPlaceholder: '',
                ordinaryHints: [],
                hasSolHint: false,
            },
        });

        const openCountBeforeNextTest = testingEngine.getOpenCount();
        yield* session.dispatch({ type: 'test-scene', index: 3 });
        expect(testingEngine.getOpenCount()).toBe(openCountBeforeNextTest);
        session.dispose();
    }));

    it.effect('invalidates a changed manipulation and all succeeding task results', () => Effect.gen(function* () {
        const testingEngine = createTestingEngine();
        const selectScene = {
            type: 'select' as const,
            text: 'Read value',
            sqlSol: 'SELECT',
            sqlPlaceholder: '',
            ordinaryHints: [],
            hasSolHint: false,
            isRowOrderRelevant: false,
            isColOrderRelevant: false,
            areColNamesRelevant: false,
        };
        const session = new GameEditorSession(
            'test',
            {
                type: 'object',
                source: createTestingGame([
                    {
                        type: 'manipulate',
                        text: 'Change value',
                        sqlSol: 'SOL',
                        sqlCheck: 'CHECK',
                        sqlPlaceholder: '',
                        ordinaryHints: [],
                        hasSolHint: false,
                    },
                    selectScene,
                ]),
            },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        yield* session.resolve();
        yield* session.dispatch({ type: 'test-scene', index: 1 });

        yield* session.dispatch({
            type: 'update-scene',
            index: 0,
            scene: {
                type: 'manipulate',
                text: 'No longer changes value',
                sqlSol: 'NO_CHANGE',
                sqlCheck: 'CHECK',
                sqlPlaceholder: '',
                ordinaryHints: [],
                hasSolHint: false,
            },
        });

        expect(getReadySnapshot(session).sceneTestStatuses).toEqual([
            { kind: 'unknown' },
            { kind: 'unknown' },
        ]);
        const openCountBeforeRetest = testingEngine.getOpenCount();
        yield* session.dispatch({ type: 'test-scene', index: 1 });
        expect(testingEngine.getOpenCount()).toBe(openCountBeforeRetest + 1);
        expect(getReadySnapshot(session).sceneTestStatuses[0]).toMatchObject({
            kind: 'manipulate-result',
            outcome: 'sql-check-no-witness',
        });
        session.dispose();
    }));

    it('disposes its retained SQL editor model', () => {
        const testingEngine = createTestingEngine();
        const session = new GameEditorSession(
            'test',
            { type: 'object', source: createGame() },
            createTestGamePlatformAdapters(testingEngine.factory),
        );
        const disposeModel = vi.fn();
        registerCodeEditorModel(session.sqlEditorURI, disposeModel);

        session.dispose();
        session.dispose();

        expect(disposeModel).toHaveBeenCalledOnce();
    });
});
