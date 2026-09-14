import type { GameEditorURI } from './session';
import type { GameEditorSession } from './session';
import type { GameDocumentID } from './document';
import {
    createBrowserGameDocumentLockManager,
    type GameDocumentLock,
    type GameDocumentLockManager,
} from './document-lock';
import { GameDocumentDraftPersistence } from './draft-persistence';
import type { GameDocumentDraftStore, RestoredGameDocumentDraft } from './draft-store';

export type GameEditorWorkspacePersistence = {
    attach(session: GameEditorSession): Promise<boolean>;
    discard(session: GameEditorSession): Promise<void>;
    subscribeToFailures(listener: (error: unknown) => void): () => void;
    dispose(): void;
};

type PersistenceEntry = {
    persistence: GameDocumentDraftPersistence;
    lock: GameDocumentLock;
    unsubscribe: () => void;
};

export function createGameEditorWorkspacePersistence(
    store: GameDocumentDraftStore,
    restoredDrafts: ReadonlyMap<GameDocumentID, RestoredGameDocumentDraft> = new Map(),
    lockManager: GameDocumentLockManager = createBrowserGameDocumentLockManager(),
): GameEditorWorkspacePersistence {
    const entries = new Map<GameEditorURI, PersistenceEntry>();
    const pendingAttachments = new Map<GameEditorURI, Promise<boolean>>();
    const failureListeners = new Set<(error: unknown) => void>();
    let latestFailure: { error: unknown } | null = null;
    let disposed = false;

    const publishFailure = (error: unknown): void => {
        latestFailure = { error };
        for (const listener of failureListeners) {
            listener(error);
        }
    };

    const attach = (session: GameEditorSession): Promise<boolean> => {
        if (disposed) {
            return Promise.resolve(false);
        }
        else if (entries.has(session.uri)) {
            return Promise.resolve(true);
        }
        const pendingAttachment = pendingAttachments.get(session.uri);
        if (pendingAttachment !== undefined) {
            return pendingAttachment;
        }

        const attachment = lockManager.tryAcquire(session.getDocumentLockKey()).then(lock => {
            if (lock === null) {
                return false;
            }
            else if (disposed) {
                lock.release();
                return false;
            }
            else {
                const restoredDraft = restoredDrafts.get(session.documentId) ?? null;
                const persistence = new GameDocumentDraftPersistence(
                    session,
                    store,
                    restoredDraft === null
                        ? null
                        : {
                            sceneIds: restoredDraft.sceneIds,
                            revision: restoredDraft.document.revision,
                            packageInfo: restoredDraft.packageInfo,
                        },
                );
                let lastReportedFailure: object | null = null;
                const unsubscribe = persistence.subscribe(() => {
                    const snapshot = persistence.getSnapshot();
                    if (snapshot.kind === 'failed' && snapshot !== lastReportedFailure) {
                        lastReportedFailure = snapshot;
                        publishFailure(snapshot.error);
                    }
                });
                entries.set(session.uri, { persistence, lock, unsubscribe });
                if (restoredDraft === null) {
                    void persistence.persistInitialDocument().catch((error: unknown) => {
                        console.error('Failed to initialize game-editor draft persistence:', error);
                        publishFailure(error);
                    });
                }
                return true;
            }
        }).finally(() => pendingAttachments.delete(session.uri));
        pendingAttachments.set(session.uri, attachment);
        return attachment;
    };

    return {
        attach,
        async discard(session) {
            await pendingAttachments.get(session.uri);
            const entry = entries.get(session.uri);
            if (entry !== undefined) {
                entries.delete(session.uri);
                entry.unsubscribe();
                try {
                    await entry.persistence.discard();
                }
                catch (error: unknown) {
                    console.error('Failed to discard a game-editor draft:', error);
                    publishFailure(error);
                }
                finally {
                    entry.lock.release();
                }
            }
        },
        subscribeToFailures(listener) {
            failureListeners.add(listener);
            if (latestFailure !== null) {
                listener(latestFailure.error);
            }
            return () => {
                failureListeners.delete(listener);
            };
        },
        dispose() {
            if (!disposed) {
                disposed = true;
                for (const entry of entries.values()) {
                    entry.unsubscribe();
                    entry.persistence.dispose();
                    entry.lock.release();
                }
                entries.clear();
                failureListeners.clear();
            }
        },
    };
}
