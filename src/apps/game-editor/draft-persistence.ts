import { Effect } from 'effect';
import { v4 as uuidv4 } from 'uuid';

import { assert } from '../../util';
import type { CommittedGameDocumentChange, GameDocument } from './document';
import type { GameDocumentDraftStore, GameDocumentDraftUpdate, GameDocumentSceneID } from './draft-store';
import { makeGameDocumentSceneID } from './draft-store';
import type { GameEditorSession } from './session';
import type { GamePackageInfo } from '../../game/package';

export type GameDocumentDraftPersistenceSnapshot =
    | { kind: 'idle', persistedRevision: number }
    | { kind: 'saving', persistedRevision: number, targetRevision: number }
    | { kind: 'failed', persistedRevision: number, targetRevision: number, error: unknown };

type Listener = () => void;

export class GameDocumentDraftPersistence {
    private readonly listeners = new Set<Listener>();
    private readonly unsubscribeFromDocumentChanges: () => void;
    private readonly unsubscribeFromPackageInfoDiscard: () => void;
    private sceneIds: GameDocumentSceneID[] | null;
    private initializedInStore: boolean;
    private packageInfo: GamePackageInfo | undefined;
    private requiresFullWrite = false;
    // A write captures one document revision, while later changes may already be
    // queued. This tracks the newest revision seen so completion of an older write
    // does not incorrectly report that persistence is idle and fully up to date.
    private latestRevision: number;
    private writeQueue: Promise<void> = Promise.resolve();
    private disposed = false;
    private snapshot: GameDocumentDraftPersistenceSnapshot;

    constructor(
        private readonly session: GameEditorSession,
        private readonly store: GameDocumentDraftStore,
        restored: {
            sceneIds: GameDocumentSceneID[],
            revision: number,
            packageInfo?: GamePackageInfo,
        } | null = null,
    ) {
        this.sceneIds = restored?.sceneIds ?? null;
        this.initializedInStore = restored !== null;
        this.packageInfo = restored?.packageInfo;
        this.latestRevision = restored?.revision ?? 0;
        this.snapshot = { kind: 'idle', persistedRevision: restored?.revision ?? 0 };
        this.unsubscribeFromDocumentChanges = session.subscribeToDocumentChanges(change => {
            this.onDocumentChange(change);
        });
        this.unsubscribeFromPackageInfoDiscard = session.subscribeToPackageInfoDiscard(() => {
            this.onPackageInfoDiscard();
        });
    }

    getSnapshot(): GameDocumentDraftPersistenceSnapshot {
        return this.snapshot;
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    async persistInitialDocument(): Promise<void> {
        // Loading failures are already published by the session. There is no
        // document to save in that case, and no draft-storage failure to report.
        await Effect.runPromise(this.session.resolve().pipe(Effect.catchAll(() => Effect.void)));
        const sessionSnapshot = this.session.getSnapshot();
        if (sessionSnapshot.kind === 'ready' && !this.disposed) {
            this.packageInfo = sessionSnapshot.packageInfo;
            const sceneIds = this.sceneIds ?? createSceneIds(sessionSnapshot.document.game.scenes.length);
            this.sceneIds = sceneIds;
            this.latestRevision = sessionSnapshot.document.revision;
            this.enqueueWrite(sessionSnapshot.document, sceneIds, null);
            await this.writeQueue;
        }
    }

    async flush(): Promise<void> {
        await this.writeQueue;
    }

    async discard(): Promise<void> {
        this.dispose();
        await this.writeQueue;
        await this.store.deleteDocument(this.session.documentId, getPersistedRevision(this.snapshot));
    }

    dispose(): void {
        if (!this.disposed) {
            this.disposed = true;
            this.unsubscribeFromDocumentChanges();
            this.unsubscribeFromPackageInfoDiscard();
            this.listeners.clear();
        }
    }

    private onDocumentChange(event: CommittedGameDocumentChange): void {
        if (this.disposed) {
            return;
        }

        this.latestRevision = event.document.revision;
        if (this.sceneIds === null) {
            const sceneIds = createSceneIds(event.document.game.scenes.length);
            this.sceneIds = sceneIds;
            this.enqueueWrite(event.document, sceneIds, null);
        }
        else {
            const update = this.createIncrementalUpdate(event, this.sceneIds);
            this.sceneIds = update.sceneIds;
            this.enqueueWrite(event.document, update.sceneIds, update);
        }
    }

    private onPackageInfoDiscard(): void {
        this.packageInfo = undefined;
        const sessionSnapshot = this.session.getSnapshot();
        if (!this.disposed && this.sceneIds !== null && sessionSnapshot.kind === 'ready') {
            this.enqueueWrite(sessionSnapshot.document, this.sceneIds, null);
        }
    }

    private createIncrementalUpdate(
        event: CommittedGameDocumentChange,
        previousSceneIds: GameDocumentSceneID[],
    ): GameDocumentDraftUpdate {
        const nextSceneIds = [...previousSceneIds];
        const scenesToPut: GameDocumentDraftUpdate['scenesToPut'] = [];
        const sceneIdsToDelete: GameDocumentSceneID[] = [];
        let databaseSource: GameDocumentDraftUpdate['databaseSource'] = { type: 'unchanged' };

        switch (event.change.type) {
            case 'filename-changed':
            case 'metadata-updated':
            case 'file-checkpoint-updated':
                break;
            case 'scene-updated': {
                const sceneId = nextSceneIds[event.change.index];
                const scene = event.document.game.scenes[event.change.index];
                assert(sceneId !== undefined && scene !== undefined, 'The updated draft scene is missing');
                scenesToPut.push({ id: sceneId, scene });
                break;
            }
            case 'scene-added': {
                const scene = event.document.game.scenes[event.change.index];
                assert(scene !== undefined, 'The added draft scene is missing');
                const sceneId = makeGameDocumentSceneID(uuidv4());
                nextSceneIds.splice(event.change.index, 0, sceneId);
                scenesToPut.push({ id: sceneId, scene });
                break;
            }
            case 'scene-deleted': {
                const [sceneId] = nextSceneIds.splice(event.change.index, 1);
                assert(sceneId !== undefined, 'The deleted draft scene ID is missing');
                sceneIdsToDelete.push(sceneId);
                break;
            }
            case 'scenes-reordered': {
                assert(
                    event.change.indices.length === previousSceneIds.length,
                    'The scene permutation and draft scene-ID order must have equal lengths',
                );
                const reorderedSceneIds = event.change.indices.map(index => previousSceneIds[index]);
                assert(
                    reorderedSceneIds.every(sceneId => sceneId !== undefined),
                    'The reordered draft scene ID is missing',
                );
                nextSceneIds.splice(0, nextSceneIds.length, ...reorderedSceneIds as GameDocumentSceneID[]);
                break;
            }
            case 'database-replaced':
                databaseSource = { type: 'replace', data: event.document.game.dbData };
                break;
            default: { const _n: never = event.change; return _n; }
        }

        assert(
            nextSceneIds.length === event.document.game.scenes.length,
            'The persisted scene-ID order must match the game document',
        );
        return {
            document: event.document,
            sceneIds: nextSceneIds,
            scenesToPut,
            sceneIdsToDelete,
            databaseSource,
        };
    }

    private enqueueWrite(
        document: GameDocument,
        sceneIds: GameDocumentSceneID[],
        incrementalUpdate: GameDocumentDraftUpdate | null,
    ): void {
        const capturedSceneIds = [...sceneIds];
        const persistedRevision = getPersistedRevision(this.snapshot);
        this.publishSnapshot({
            kind: 'saving',
            persistedRevision,
            targetRevision: this.latestRevision,
        });
        this.writeQueue = this.writeQueue.then(async () => {
            try {
                const expectedRevision = this.initializedInStore
                    ? getPersistedRevision(this.snapshot)
                    : null;
                if (!this.initializedInStore || this.requiresFullWrite || incrementalUpdate === null) {
                    await this.store.replace({
                        document,
                        ...(this.packageInfo === undefined ? {} : { packageInfo: this.packageInfo }),
                        sceneIds: capturedSceneIds,
                        updatedAt: Date.now(),
                    }, expectedRevision);
                    this.initializedInStore = true;
                    this.requiresFullWrite = false;
                }
                else {
                    assert(expectedRevision !== null, 'An existing draft requires a persisted revision');
                    await this.store.update(
                        { ...incrementalUpdate, sceneIds: capturedSceneIds },
                        expectedRevision,
                    );
                }

                const targetRevision = this.latestRevision;
                this.publishSnapshot(document.revision === targetRevision
                    ? { kind: 'idle', persistedRevision: document.revision }
                    : {
                        kind: 'saving',
                        persistedRevision: document.revision,
                        targetRevision,
                    });
            }
            catch (error: unknown) {
                this.requiresFullWrite = true;
                this.publishSnapshot({
                    kind: 'failed',
                    persistedRevision: getPersistedRevision(this.snapshot),
                    targetRevision: this.latestRevision,
                    error,
                });
                console.error('Failed to persist a game-editor draft:', error);
            }
        });
    }

    private publishSnapshot(snapshot: GameDocumentDraftPersistenceSnapshot): void {
        this.snapshot = snapshot;
        for (const listener of this.listeners) {
            listener();
        }
    }
}

function createSceneIds(count: number): GameDocumentSceneID[] {
    return Array.from({ length: count }, () => makeGameDocumentSceneID(uuidv4()));
}

function getPersistedRevision(snapshot: GameDocumentDraftPersistenceSnapshot): number {
    switch (snapshot.kind) {
        case 'idle':
        case 'saving':
        case 'failed':
            return snapshot.persistedRevision;
        default: { const _n: never = snapshot; return _n; }
    }
}
