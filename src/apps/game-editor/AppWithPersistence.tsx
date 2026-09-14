import { useEffect, useState } from 'react';

import { createWebBrowserGameEditorSession } from '../../platform/webbrowser/create-game-editor-session';
import { App, type GameEditorAppProps } from './App';
import type { GameEditorSession, GameEditorURI } from './session';
import { createIndexedDBGameDocumentDraftStore } from './draft-store';
import type { GameDocumentDraftStore, RestoredGameDocumentDraft } from './draft-store';
import { createGameEditorWorkspacePersistence } from './workspace-persistence';
import type { GameEditorWorkspacePersistence } from './workspace-persistence';
import type { GameDocumentLockManager } from './document-lock';
import { createBrowserGameDocumentLockManager } from './document-lock';

type RestoredWorkspace = {
    sessions: GameEditorSession[];
    initialActiveURI: GameEditorURI | null;
    restoredSessions: GameEditorSession[];
    persistence: GameEditorWorkspacePersistence;
    unavailableDocumentFilenames: string[];
};

type RestorationState =
    | { kind: 'loading' }
    | { kind: 'failed' }
    | { kind: 'ready', workspace: RestoredWorkspace };

let defaultDraftStore: GameDocumentDraftStore | null = null;

export type AppWithPersistenceProps = Omit<
    GameEditorAppProps,
    'initialActiveURI' | 'workspacePersistence' | 'unavailableDocumentFilenames'
> & {
    draftStore?: GameDocumentDraftStore;
    documentLockManager?: GameDocumentLockManager;
};

export function AppWithPersistence({
    draftStore = undefined,
    documentLockManager = undefined,
    ...appProps
}: AppWithPersistenceProps) {
    const [store] = useState<GameDocumentDraftStore>(() => (
        draftStore ?? getDefaultDraftStore()
    ));
    const [lockManager] = useState<GameDocumentLockManager>(() => (
        documentLockManager ?? createBrowserGameDocumentLockManager()
    ));
    const [restoration, setRestoration] = useState<RestorationState>({ kind: 'loading' });

    useEffect(() => {
        let active = true;
        let restoredWorkspace: RestoredWorkspace | null = null;
        setRestoration({ kind: 'loading' });

        void (async () => {
            try {
                const restoredDrafts = await store.loadAll();
                if (active) {
                    const workspace = await createRestoredWorkspace(
                        appProps.initialSessions,
                        restoredDrafts,
                        store,
                        lockManager,
                    );
                    if (active) {
                        restoredWorkspace = workspace;
                        setRestoration({ kind: 'ready', workspace });
                    }
                    else {
                        workspace.persistence.dispose();
                        for (const session of workspace.restoredSessions) {
                            session.dispose();
                        }
                    }
                }
            }
            catch (error: unknown) {
                console.error('Failed to restore game-editor drafts:', error);
                if (active) {
                    setRestoration({ kind: 'failed' });
                }
            }
        })();

        return () => {
            active = false;
            if (restoredWorkspace !== null) {
                restoredWorkspace.persistence.dispose();
                for (const session of restoredWorkspace.restoredSessions) {
                    session.dispose();
                }
            }
        };
    }, [appProps.initialSessions, lockManager, store]);

    switch (restoration.kind) {
        case 'loading':
            return null;
        case 'failed':
            return <App {...appProps} />;
        case 'ready':
            return (
                <App
                    {...appProps}
                    initialSessions={restoration.workspace.sessions}
                    initialActiveURI={restoration.workspace.initialActiveURI}
                    workspacePersistence={restoration.workspace.persistence}
                    unavailableDocumentFilenames={restoration.workspace.unavailableDocumentFilenames}
                />
            );
        default: { const _n: never = restoration; return _n; }
    }
}

function getDefaultDraftStore(): GameDocumentDraftStore {
    if (defaultDraftStore === null) {
        defaultDraftStore = createIndexedDBGameDocumentDraftStore();
    }
    return defaultDraftStore;
}

async function createRestoredWorkspace(
    initialSessions: GameEditorSession[],
    restoredDrafts: RestoredGameDocumentDraft[],
    store: GameDocumentDraftStore,
    lockManager: GameDocumentLockManager,
): Promise<RestoredWorkspace> {
    const restoredSourceKeys = new Set(
        restoredDrafts.flatMap(draft => draft.document.sourceKey === null ? [] : [draft.document.sourceKey]),
    );
    const retainedInitialSessions: GameEditorSession[] = [];
    const supersededInitialSessions: GameEditorSession[] = [];
    for (const session of initialSessions) {
        const sourceKey = session.getDocumentSourceKey();
        if (sourceKey !== null && restoredSourceKeys.has(sourceKey)) {
            supersededInitialSessions.push(session);
        }
        else {
            retainedInitialSessions.push(session);
        }
    }
    const restoredSessions = restoredDrafts.map(draft => createWebBrowserGameEditorSession(
        draft.document.filename,
        { type: 'object', source: draft.document.game },
        {
            id: draft.document.id,
            revision: draft.document.revision,
            sourceKey: draft.document.sourceKey,
            savedGameFingerprint: draft.document.savedGameFingerprint,
            ...(draft.packageInfo === undefined ? {} : { packageInfo: draft.packageInfo }),
        },
    ));
    const restoredDraftsByDocumentId = new Map(
        restoredDrafts.map(draft => [draft.document.id, draft] as const),
    );
    const persistence = createGameEditorWorkspacePersistence(
        store,
        restoredDraftsByDocumentId,
        lockManager,
    );
    const candidateSessions = [...restoredSessions, ...retainedInitialSessions];
    let attachments: boolean[];
    try {
        attachments = await Promise.all(candidateSessions.map(session => persistence.attach(session)));
    }
    catch (error: unknown) {
        persistence.dispose();
        for (const session of restoredSessions) {
            session.dispose();
        }
        throw error;
    }
    for (const session of supersededInitialSessions) {
        session.dispose();
    }
    const sessions = candidateSessions.filter((_session, index) => attachments[index] === true);
    const initialActiveURI = initialSessions.map(initialSession => {
        const sourceKey = initialSession.getDocumentSourceKey();
        return sessions.find(session => (
            session === initialSession
            || (sourceKey !== null && session.getDocumentSourceKey() === sourceKey)
        ))?.uri;
    }).find(uri => uri !== undefined) ?? null;
    const availableRestoredSessions = restoredSessions.filter(session => sessions.includes(session));
    for (const session of restoredSessions) {
        if (!sessions.includes(session)) {
            session.dispose();
        }
    }
    return {
        sessions,
        initialActiveURI,
        restoredSessions: availableRestoredSessions,
        persistence,
        unavailableDocumentFilenames: candidateSessions.flatMap((session, index) => (
            attachments[index] === false ? [session.getFilename()] : []
        )),
    };
}
