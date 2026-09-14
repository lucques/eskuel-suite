import 'bootstrap-icons/font/bootstrap-icons.css';
import type {
    DockviewApi,
    DockviewReadyEvent,
    IDockviewPanelHeaderProps,
    IDockviewPanelProps,
    IWatermarkPanelProps,
} from 'dockview-core';
import { DockviewReact } from 'dockview-react';
import { createContext, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ButtonGroup, CloseButton, Dropdown, Spinner, Toast, ToastContainer } from 'react-bootstrap';
import { Trans, useTranslation } from 'react-i18next';

import type { GameCatalogEntry } from '../../catalog';
import type { GameSource } from '../../game/loader';
import { createBlankGame } from '../../game/model';
import { ConfirmLeaveModal } from '../../gui-helpers/confirm-leave-modal/ConfirmLeaveModal';
import { ConfirmSaveChangesModal } from '../../gui-helpers/confirm-save-changes-modal/ConfirmSaveChangesModal';
import { AppThemeScope } from '../../gui-helpers/app-theme/AppTheme';
import { DarkModeToggle } from '../../gui-helpers/dark-mode-toggle/DarkModeToggle';
import { getDockviewTheme } from '../../gui-helpers/dockview/themes';
import { DockviewTabCloseButton } from '../../gui-helpers/dockview/DockviewTabCloseButton';
import { usePanelVisibility } from '../../gui-helpers/dockview/use-panel-visibility';
import { IconActionButton } from '../../gui-helpers/icon-button/IconActionButton';
import { formatFileSize } from '../../gui-helpers/file-size';
import { LanguageSwitcher } from '../../gui-helpers/language-switcher/LanguageSwitcher';
import { LayoutSwitcher, type LayoutOption } from '../../gui-helpers/layout-switcher/LayoutSwitcher';
import { SubtleButton } from '../../gui-helpers/subtle-button/SubtleButton';
import { Topbar, TopbarActionsLeft, TopbarActionsRight, TopbarLinksRight, TopbarTitle } from '../../gui-helpers/topbar/Topbar';
import { OpenGameGameSourceModal as OpenGameSourceModal, type OpenGameSourceHandle } from '../../gui-helpers/open-modal/OpenGameGameSourceModal';
import styles from '../../screen.module.css';
import appStyles from './App.module.css';
import { useSettings } from '../../settings/settings';
import { useContextOrDie } from '../../standard-lib';
import type { WithFilename } from '../../util';
import { assert } from '../../util';
import { ChangeGameFilenameModal } from './ChangeGameFilenameModal';
import type { GameEditorSession, GameEditorSnapshot, GameEditorURI } from './session';
import type { GameEditorViewHandle } from './handle';
import type { GameEditorViewLayout } from './layout';
import { NewGameFileModal } from './NewGameFileModal';
import { GameEditorView } from './view';
import { createWebBrowserGameEditorSession } from '../../platform/webbrowser/create-game-editor-session';
import type { GameFileHandle, GameSaveFilePicker } from './game-file';
import {
    exportGameFile,
    GameFileSizeLimitError,
    gameTitleToFilename,
    getBrowserGameSaveFilePicker,
    isFilePickerCancellation,
    saveGameToFile,
} from './game-file';
import type { GameEditorWorkspacePersistence } from './workspace-persistence';
import type { LocalizedLink } from '../component-options';
import { LocalizedNavigationLinks } from '../LocalizedNavigationLinks';

export type GameEditorAppProps = {
    initialSessions: GameEditorSession[],
    initialActiveURI?: GameEditorURI | null,
    gameCatalog?: readonly GameCatalogEntry[],
    linksCenterLeft?: readonly LocalizedLink[],
    linksRight?: readonly LocalizedLink[],
    workspacePersistence?: GameEditorWorkspacePersistence,
    saveFilePicker?: GameSaveFilePicker | null,
    unavailableDocumentFilenames?: readonly string[],
};

export function App({
    initialSessions,
    initialActiveURI = null,
    gameCatalog = [],
    linksCenterLeft = undefined,
    linksRight = undefined,
    workspacePersistence = undefined,
    saveFilePicker = undefined,
    unavailableDocumentFilenames = [],
}: GameEditorAppProps) {
    const { t } = useTranslation('game-editor');
    const { t: tc, i18n } = useTranslation('common');
    const gameEditorDockLayoutOptions = [
        { value: 'desktop', label: <span className='d-inline-flex align-items-center gap-2'><i className='bi bi-window-desktop' />{tc('layout.desktop')}</span> },
        { value: 'mobile', label: <span className='d-inline-flex align-items-center gap-2'><i className='bi bi-phone' />{tc('layout.mobile')}</span> },
    ] satisfies readonly LayoutOption<GameEditorViewLayout>[];
    const { darkMode, settings } = useSettings();
    const activeLanguage = i18n.resolvedLanguage ?? i18n.language;
    const dockApiRef = useRef<DockviewApi | null>(null);
    const gameEditorViewHandleRefs = useRef<Partial<Record<GameEditorURI, GameEditorViewHandle>>>({});
    const gameFileHandleRefs = useRef<Partial<Record<GameEditorURI, GameFileHandle>>>({});
    const openGameSourceRef = useRef<OpenGameSourceHandle>(null);
    const [resolvedSaveFilePicker] = useState<GameSaveFilePicker | null>(() => (
        saveFilePicker === undefined ? getBrowserGameSaveFilePicker() : saveFilePicker
    ));
    const [sessions, setSessions] = useState<Partial<Record<GameEditorURI, GameEditorSession>>>(() =>
        Object.fromEntries(initialSessions.map(session => [session.uri, session]))
    );
    const [activeURI, setActiveURI] = useState<GameEditorURI | null>(initialActiveURI ?? initialSessions[0]?.uri ?? null);
    const [newGameModalOpen, setNewGameModalOpen] = useState(false);
    const [pendingFilenameChangeURI, setPendingFilenameChangeURI] = useState<GameEditorURI | null>(null);
    const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(null);
    const [pendingCloseSessionURI, setPendingCloseSessionURI] = useState<GameEditorURI | null>(null);
    const [fileOperationNotice, setFileOperationNotice] = useState<{
        message: ReactNode,
        variant: 'success' | 'danger',
    } | null>(() => unavailableDocumentFilenames.length === 0
        ? null
        : {
            message: <DraftOpenElsewhereNotice filenames={unavailableDocumentFilenames} />,
            variant: 'danger',
        });

    useEffect(() => {
        for (const session of initialSessions) {
            void workspacePersistence?.attach(session);
        }
    }, [initialSessions, workspacePersistence]);

    useEffect(() => workspacePersistence?.subscribeToFailures(() => {
        setFileOperationNotice({
            message: t('draft_save_failed'),
            variant: 'danger',
        });
    }), [t, workspacePersistence]);

    const registerGameEditorViewHandle = useCallback((uri: GameEditorURI, handle: GameEditorViewHandle) => {
        gameEditorViewHandleRefs.current = { ...gameEditorViewHandleRefs.current, [uri]: handle };
    }, []);

    const unregisterGameEditorViewHandle = useCallback((uri: GameEditorURI) => {
        const nextHandles = { ...gameEditorViewHandleRefs.current };
        delete nextHandles[uri];
        gameEditorViewHandleRefs.current = nextHandles;
    }, []);

    const onSelectGameEditorViewLayout = (layout: GameEditorViewLayout) => {
        const activePanel = dockApiRef.current?.activePanel;
        if (activePanel === undefined) {
            return;
        }

        const params = activePanel.params as GameEditorParams;
        gameEditorViewHandleRefs.current[params.uri]?.applyLayout(layout);
    };

    const addGamePanel = (session: GameEditorSession, activate: boolean = true): void => {
        const panel = dockApiRef.current?.addPanel({
            id: session.uri,
            component: 'GameEditorPanel' satisfies keyof typeof components,
            tabComponent: 'GameEditorTab' satisfies keyof typeof tabComponents,
            params: { uri: session.uri },
        });
        if (activate) {
            panel?.api.setActive();
        }
    };

    const addSession = (
        source: WithFilename<GameSource>,
        savedGameFingerprint: string | null | undefined = undefined,
    ): void => {
        const session = createWebBrowserGameEditorSession(
            source.filename,
            source,
            { savedGameFingerprint },
        );
        const sourceKey = session.getDocumentSourceKey();
        const alreadyOpenSession = sourceKey === null
            ? undefined
            : Object.values(sessions).find(candidate => candidate?.getDocumentSourceKey() === sourceKey);
        if (alreadyOpenSession !== undefined) {
            session.dispose();
            setActiveURI(alreadyOpenSession.uri);
            dockApiRef.current?.getPanel(alreadyOpenSession.uri)?.api.setActive();
            return;
        }
        const attach = workspacePersistence === undefined
            ? Promise.resolve(true)
            : workspacePersistence.attach(session);
        void attach.then(attached => {
            if (attached) {
                setSessions(previous => ({ ...previous, [session.uri]: session }));
                setActiveURI(session.uri);
                addGamePanel(session);
            }
            else {
                session.dispose();
                setFileOperationNotice({
                    message: <DraftOpenElsewhereNotice filenames={[session.getFilename()]} />,
                    variant: 'danger',
                });
            }
        }).catch((error: unknown) => {
            session.dispose();
            console.error('Failed to claim the game-editor document:', error);
            setFileOperationNotice({
                message: t('draft_save_failed'),
                variant: 'danger',
            });
        });
    };

    const removeSession = (uri: GameEditorURI): void => {
        const nextFileHandleRefs = { ...gameFileHandleRefs.current };
        delete nextFileHandleRefs[uri];
        gameFileHandleRefs.current = nextFileHandleRefs;
        const session = sessions[uri];
        if (session !== undefined) {
            void workspacePersistence?.discard(session);
            session.dispose();
        }
        setSessions(previous => {
            const next = { ...previous };
            delete next[uri];
            return next;
        });

        const panel = dockApiRef.current?.getPanel(uri);
        if (panel !== undefined) {
            dockApiRef.current?.removePanel(panel);
        }
    };

    const requestCloseSession = (uri: GameEditorURI): void => {
        const session = sessions[uri];
        const snapshot = session?.getSnapshot();
        if (session !== undefined
            && snapshot?.kind === 'ready'
            && snapshot.commandStatus.kind === 'idle') {
            if (session.hasUnsavedFileChanges()) {
                setPendingCloseSessionURI(uri);
            }
            else {
                removeSession(uri);
            }
        }
        else {
            setPendingCloseSessionURI(uri);
        }
    };

    const onReady = (event: DockviewReadyEvent): void => {
        dockApiRef.current = event.api;
        event.api.onDidActivePanelChange(panel => {
            if (panel === undefined) {
                setActiveURI(null);
                return;
            }

            const params = panel.params as GameEditorParams;
            setActiveURI(params.uri);
        });

        for (const session of Object.values(sessions)) {
            if (session !== undefined) {
                addGamePanel(session, false);
            }
        }
        if (activeURI !== null) {
            event.api.getPanel(activeURI)?.api.setActive();
        }
    };

    const onCreateGame = (gameTitle: string): void => {
        addSession({
            filename: gameTitleToFilename(gameTitle),
            type: 'object',
            source: createBlankGame(gameTitle, {
                teaser: t('new_game_default_teaser'),
                copyright: t('new_game_default_copyright'),
                firstSceneText: t('new_game_default_scene_text'),
            }),
        }, null);
    };

    const writeOrExportGame = useCallback(async (
        session: GameEditorSession,
        snapshot: Extract<GameEditorSnapshot, { kind: 'ready' }>,
        forceFilePicker: boolean,
    ): Promise<boolean> => {
        try {
            if (resolvedSaveFilePicker === null) {
                exportGameFile(
                    session.getFilename(),
                    snapshot.document.game,
                    settings.maxGameFileBytes,
                );
                await session.markGameAsSaved(snapshot.document.game);
                return true;
            }
            else {
                const currentHandle = gameFileHandleRefs.current[session.uri];
                const selectingNewFile = forceFilePicker || currentHandle === undefined;
                const handle = await saveGameToFile(
                    resolvedSaveFilePicker,
                    selectingNewFile ? null : currentHandle,
                    session.getFilename(),
                    snapshot.document.game,
                    settings.maxGameFileBytes,
                );
                gameFileHandleRefs.current = {
                    ...gameFileHandleRefs.current,
                    [session.uri]: handle,
                };
                session.setFilename(handle.name);
                await session.markGameAsSaved(snapshot.document.game);
                setFileOperationNotice({
                    message: (
                        <Trans
                            t={t}
                            i18nKey={selectingNewFile ? 'saved_as' : 'saved'}
                            components={{ filename: <code>{handle.name}</code> }}
                        />
                    ),
                    variant: 'success',
                });
                return true;
            }
        }
        catch (error: unknown) {
            if (error instanceof GameFileSizeLimitError) {
                setFileOperationNotice({
                    message: t('game_file_too_large_to_save', {
                        actual: formatFileSize(error.actualBytes),
                        limit: formatFileSize(error.limitBytes),
                    }),
                    variant: 'danger',
                });
            }
            else if (!isFilePickerCancellation(error)) {
                console.error('Failed to save the game file:', error);
                setFileOperationNotice({
                    message: t('save_failed'),
                    variant: 'danger',
                });
            }
            return false;
        }
    }, [resolvedSaveFilePicker, settings.maxGameFileBytes, t]);

    const activeSession = activeURI === null ? undefined : sessions[activeURI];
    const pendingCloseSession = pendingCloseSessionURI === null
        ? undefined
        : sessions[pendingCloseSessionURI];
    const pendingFilenameChangeSession = pendingFilenameChangeURI === null
        ? undefined
        : sessions[pendingFilenameChangeURI];

    return (
        <AppThemeScope theme='game-editor' className={styles.root}>
            <Topbar>
                <TopbarTitle>
                    <span className='text-body'>{t('title')}</span>
                </TopbarTitle>
                <TopbarActionsLeft>
                    <div className='d-flex align-items-center gap-1'>
                        <IconActionButton
                            onClick={() => setNewGameModalOpen(true)}
                            tooltipText={t('new_game')}
                            variant='primary-subtle'
                            compactSize='sm'
                        >
                            <i className='bi bi-file-earmark-plus' />
                        </IconActionButton>
                        <IconActionButton
                            onClick={() => openGameSourceRef.current?.open()}
                            tooltipText={tc('button.open_game')}
                            variant='primary-subtle'
                            compactSize='sm'
                        >
                            <i className='bi bi-folder2-open' />
                        </IconActionButton>
                        <GameFileButton
                            session={activeSession}
                            directSaveAvailable={resolvedSaveFilePicker !== null}
                            onWrite={writeOrExportGame}
                            onRequestFilenameChange={session => setPendingFilenameChangeURI(session.uri)}
                        />
                        <LocalizedNavigationLinks
                            links={linksCenterLeft}
                            activeLanguage={activeLanguage}
                            className='ms-2'
                            onNavigate={setPendingNavigationUrl}
                        />
                    </div>
                </TopbarActionsLeft>
                <TopbarActionsRight>
                    <ButtonGroup>
                        <LanguageSwitcher compactSize='sm' variant='primary-subtle' />
                        <LayoutSwitcher
                            layouts={gameEditorDockLayoutOptions}
                            onSelect={onSelectGameEditorViewLayout}
                            id='game-editor-layout-switcher'
                            compactSize='sm'
                            variant='primary-subtle'
                        />
                        <DarkModeToggle compactSize='sm' variant='primary-subtle' />
                    </ButtonGroup>
                </TopbarActionsRight>
                {linksRight === undefined || linksRight.length === 0
                    ? null
                    : <TopbarLinksRight>
                        <LocalizedNavigationLinks
                            links={linksRight}
                            activeLanguage={activeLanguage}
                            className='ms-2'
                            onNavigate={setPendingNavigationUrl}
                        />
                    </TopbarLinksRight>}
            </Topbar>

            <AppContext.Provider value={{
                sessions,
                requestCloseSession,
                registerGameEditorViewHandle,
                unregisterGameEditorViewHandle,
            }}>
                <div className={`${styles.contentArea} ${appStyles.dockLayout}`}>
                    <DockviewReact
                        theme={getDockviewTheme(darkMode, true, false)}
                        onReady={onReady}
                        components={components}
                        tabComponents={tabComponents}
                        watermarkComponent={GameEditorWatermark}
                    />
                </div>
            </AppContext.Provider>

            <NewGameFileModal
                onCreate={onCreateGame}
                show={newGameModalOpen}
                onHide={() => setNewGameModalOpen(false)}
            />
            <ChangeGameFilenameModal
                show={pendingFilenameChangeSession !== undefined}
                currentFilename={pendingFilenameChangeSession?.getFilename() ?? ''}
                onHide={() => setPendingFilenameChangeURI(null)}
                onChange={filename => {
                    assert(pendingFilenameChangeSession !== undefined);
                    pendingFilenameChangeSession.setFilename(filename);
                }}
            />
            <OpenGameSourceModal
                ref={openGameSourceRef}
                gameCatalog={gameCatalog}
                onOpenFile={addSession}
            />
            <ConfirmLeaveModal
                show={pendingNavigationUrl !== null}
                onHide={() => setPendingNavigationUrl(null)}
                onConfirm={() => {
                    assert(pendingNavigationUrl !== null);
                    window.location.href = pendingNavigationUrl;
                }}
                body={workspacePersistence === undefined
                    ? t('confirm_leave_body')
                    : t('confirm_leave_with_drafts_body')}
            />
            <GameEditorConfirmCloseModal
                session={pendingCloseSession}
                directSaveAvailable={resolvedSaveFilePicker !== null}
                onWrite={writeOrExportGame}
                onCancel={() => setPendingCloseSessionURI(null)}
                onClose={uri => {
                    removeSession(uri);
                    setPendingCloseSessionURI(null);
                }}
            />
            <ToastContainer position='bottom-end' className='p-3'>
                <Toast
                    className={fileOperationNotice === null
                        ? undefined
                        : `bg-${fileOperationNotice.variant}-subtle text-${fileOperationNotice.variant}-emphasis border-${fileOperationNotice.variant}-subtle`}
                    show={fileOperationNotice !== null}
                    onClose={() => setFileOperationNotice(null)}
                >
                    <Toast.Body className='d-flex align-items-start gap-3'>
                        <div className='flex-grow-1'>{fileOperationNotice?.message}</div>
                        <CloseButton
                            className='flex-shrink-0'
                            aria-label={tc('common.close')}
                            onClick={() => setFileOperationNotice(null)}
                        />
                    </Toast.Body>
                </Toast>
            </ToastContainer>
        </AppThemeScope>
    );
}

function DraftOpenElsewhereNotice({ filenames }: { filenames: readonly string[] }) {
    const { t } = useTranslation('game-editor');

    return (
        <>
            <p className='mb-0'>
                <Trans
                    t={t}
                    i18nKey='draft_open_elsewhere'
                    count={filenames.length}
                    components={{ filename: <code>{filenames[0]}</code> }}
                />
            </p>
            {filenames.length > 1
                ? <ul className='mt-2 mb-0'>
                    {filenames.map((filename, index) => (
                        <li key={index}><code>{filename}</code></li>
                    ))}
                </ul>
                : null}
        </>
    );
}

type AppContextValue = {
    sessions: Partial<Record<GameEditorURI, GameEditorSession>>,
    requestCloseSession: (uri: GameEditorURI) => void,
    registerGameEditorViewHandle: (uri: GameEditorURI, handle: GameEditorViewHandle) => void,
    unregisterGameEditorViewHandle: (uri: GameEditorURI) => void,
};

const AppContext = createContext<AppContextValue | null>(null);
const useAppContext = (): AppContextValue => useContextOrDie(AppContext);

type GameEditorParams = { uri: GameEditorURI };

const components = {
    GameEditorPanel,
};

const tabComponents = {
    GameEditorTab,
};

function GameEditorWatermark(_props: IWatermarkPanelProps) {
    const { t } = useTranslation('game-editor');
    return (
        <div className='d-inline-flex gap-2 p-3'>
            <i className='bi bi-file-earmark-plus' />
            <span>{t('no_game_opened')}</span>
        </div>
    );
}

function GameEditorPanel(props: IDockviewPanelProps<GameEditorParams>) {
    const isVisible = usePanelVisibility(props.api);
    const {
        sessions,
        registerGameEditorViewHandle,
        unregisterGameEditorViewHandle,
    } = useAppContext();
    const session = sessions[props.params.uri];
    assert(session !== undefined);

    const gameEditorViewHandleRef = useRef<GameEditorViewHandle>(null);
    useEffect(() => {
        if (gameEditorViewHandleRef.current !== null) {
            registerGameEditorViewHandle(session.uri, gameEditorViewHandleRef.current);
        }

        return () => {
            unregisterGameEditorViewHandle(session.uri);
        };
    }, [registerGameEditorViewHandle, unregisterGameEditorViewHandle, session.uri]);

    return <GameEditorView ref={gameEditorViewHandleRef} key={session.uri} session={session} isVisible={isVisible} />;
}

function GameEditorTab(props: IDockviewPanelHeaderProps<GameEditorParams>) {
    const { sessions, requestCloseSession } = useAppContext();
    const session = sessions[props.params.uri];
    assert(session !== undefined);
    const snapshot = useSyncExternalStore(
        onStoreChange => session.subscribe(onStoreChange),
        () => session.getSnapshot(),
        () => session.getSnapshot(),
    );

    return (
        <div data-testid='game-editor-session-tab' className='d-flex gap-2 align-items-center h-100'>
            <i className='bi bi-file-earmark-code' />
            {session.getFilename()}
            <GameEditorTabButton
                status={gameEditorSnapshotToTabStatus(snapshot)}
                onClose={() => requestCloseSession(session.uri)}
            />
        </div>
    );
}

function GameEditorTabButton({ status, onClose }: {
    status: GameEditorTabStatus,
    onClose: () => void,
}) {
    return (
        <div className={styles.tabIconSet}>
            <span className={styles.hideOnHover}>
                <GameEditorTabStatusIcon status={status} onClose={onClose} />
            </span>
            <span className={styles.showOnHover}>
                <DockviewTabCloseButton variant='hover' onClick={onClose} />
            </span>
        </div>
    );
}

function GameEditorTabStatusIcon({ status, onClose }: {
    status: GameEditorTabStatus,
    onClose: () => void,
}) {
    const { t } = useTranslation('common');
    const { t: te } = useTranslation('game-editor');

    switch (status) {
        case 'pending':
            return (
                <Spinner animation='border' role='status' as='span' size='sm'>
                    <span className='visually-hidden'>{t('common.loading')}</span>
                </Spinner>
            );
        case 'active':
            return <DockviewTabCloseButton variant='default' onClick={onClose} />;
        case 'dirty':
            return (
                <span role='status'>
                    <i className='bi bi-record-fill' aria-hidden='true' />
                    <span className='visually-hidden'>{te('unsaved_changes')}</span>
                </span>
            );
        case 'failed':
            return (
                <span role='status'>
                    <i className='bi bi-exclamation-circle-fill text-danger' aria-hidden='true' />
                    <span className='visually-hidden'>{t('common.error')}</span>
                </span>
            );
        default: { const _n: never = status; return _n; }
    }
}

type GameEditorTabStatus = 'pending' | 'active' | 'dirty' | 'failed';

function gameEditorSnapshotToTabStatus(snapshot: GameEditorSnapshot): GameEditorTabStatus {
    switch (snapshot.kind) {
        case 'loading':
            return 'pending';
        case 'failed':
            return 'failed';
        case 'ready':
            switch (snapshot.commandStatus.kind) {
                case 'running':
                case 'rebuilding-after-cancellation':
                    return 'pending';
                case 'idle':
                    switch (snapshot.databaseStatus.kind) {
                        case 'empty':
                        case 'loaded':
                            return snapshot.document.savedGameFingerprint === null ? 'dirty' : 'active';
                        case 'pending':
                            return 'pending';
                        case 'failed':
                            return 'failed';
                        default: { const _n: never = snapshot.databaseStatus; return _n; }
                    }
                default: { const _n: never = snapshot.commandStatus; return _n; }
            }
        default: { const _n: never = snapshot; return _n; }
    }
}

function GameFileButton({ session, directSaveAvailable, onWrite, onRequestFilenameChange }: {
    session?: GameEditorSession,
    directSaveAvailable: boolean,
    onWrite: (
        session: GameEditorSession,
        snapshot: Extract<GameEditorSnapshot, { kind: 'ready' }>,
        forceFilePicker: boolean,
    ) => Promise<boolean>,
    onRequestFilenameChange: (session: GameEditorSession) => void,
}) {
    const { t } = useTranslation('game-editor');
    const [writing, setWriting] = useState(false);
    const snapshot = useSyncExternalStore(
        onStoreChange => session?.subscribe(onStoreChange) ?? (() => {}),
        () => session?.getSnapshot() ?? null,
        () => session?.getSnapshot() ?? null,
    );
    const canSave = session !== undefined
        && snapshot?.kind === 'ready'
        && snapshot.commandStatus.kind === 'idle'
        && !writing;

    const startWrite = (forceFilePicker: boolean): void => {
        if (session !== undefined && snapshot?.kind === 'ready') {
            setWriting(true);
            void onWrite(session, snapshot, forceFilePicker).finally(() => setWriting(false));
        }
    };

    if (directSaveAvailable) {
        return (
            <Dropdown as={ButtonGroup}>
                <SubtleButton
                    variant='primary-subtle'
                    compactSize='sm'
                    disabled={!canSave}
                    aria-label={t('save_game')}
                    onClick={() => startWrite(false)}
                    style={{ justifyContent: 'center', alignItems: 'center' }}
                >
                    {writing
                        ? <Spinner animation='border' role='status' as='span' size='sm'>
                            <span className='visually-hidden'>{t('save_game')}</span>
                        </Spinner>
                        : <i className='bi bi-floppy' aria-hidden='true' />}
                </SubtleButton>
                <Dropdown.Toggle
                    as={SubtleButton}
                    split
                    variant='primary-subtle'
                    compactSize='sm'
                    disabled={!canSave}
                    aria-label={t('save_options')}
                />
                <Dropdown.Menu>
                    <Dropdown.Item onClick={() => startWrite(true)} disabled={!canSave}>
                        {t('save_as')}
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown>
        );
    }
    else {
        return (
            <Dropdown as={ButtonGroup}>
                <SubtleButton
                    variant='primary-subtle'
                    compactSize='sm'
                    disabled={!canSave}
                    aria-label={t('export_game_file')}
                    onClick={() => startWrite(false)}
                    style={{ justifyContent: 'center', alignItems: 'center' }}
                >
                    {writing
                        ? <Spinner animation='border' role='status' as='span' size='sm'>
                            <span className='visually-hidden'>{t('export_game_file')}</span>
                        </Spinner>
                        : <i className='bi bi-box-arrow-up-right' aria-hidden='true' />}
                </SubtleButton>
                <Dropdown.Toggle
                    as={SubtleButton}
                    split
                    variant='primary-subtle'
                    compactSize='sm'
                    disabled={!canSave}
                    aria-label={t('export_options')}
                />
                <Dropdown.Menu>
                    <Dropdown.Item
                        onClick={() => {
                            if (session !== undefined) {
                                onRequestFilenameChange(session);
                            }
                        }}
                        disabled={!canSave}
                    >
                        {t('change_filename')}
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown>
        );
    }
}

function GameEditorConfirmCloseModal({
    session,
    directSaveAvailable,
    onWrite,
    onCancel,
    onClose,
}: {
    session?: GameEditorSession,
    directSaveAvailable: boolean,
    onWrite: (
        session: GameEditorSession,
        snapshot: Extract<GameEditorSnapshot, { kind: 'ready' }>,
        forceFilePicker: boolean,
    ) => Promise<boolean>,
    onCancel: () => void,
    onClose: (uri: GameEditorURI) => void,
}) {
    const { t } = useTranslation('game-editor');
    const [writing, setWriting] = useState(false);
    const snapshot = useSyncExternalStore(
        onStoreChange => session?.subscribe(onStoreChange) ?? (() => {}),
        () => session?.getSnapshot() ?? null,
        () => session?.getSnapshot() ?? null,
    );
    const canSave = session !== undefined
        && snapshot?.kind === 'ready'
        && snapshot.commandStatus.kind === 'idle'
        && !writing;

    return (
        <ConfirmSaveChangesModal
            show={session !== undefined}
            title={directSaveAvailable
                ? t('confirm_save_changes_title', { filename: session?.getFilename() ?? '' })
                : t('confirm_export_changes_title', { filename: session?.getFilename() ?? '' })}
            body={directSaveAvailable
                ? t('confirm_save_changes_body')
                : t('confirm_export_changes_body')}
            saveDisabled={!canSave}
            dontSaveLabel={directSaveAvailable ? undefined : t('close_without_exporting')}
            saveLabel={directSaveAvailable ? undefined : t('export')}
            onDontSave={() => {
                if (session !== undefined) {
                    onClose(session.uri);
                }
            }}
            onCancel={onCancel}
            onSave={() => {
                if (session !== undefined && snapshot?.kind === 'ready' && snapshot.commandStatus.kind === 'idle') {
                    setWriting(true);
                    void onWrite(session, snapshot, false).then(written => {
                        if (written) {
                            onClose(session.uri);
                        }
                    }).finally(() => setWriting(false));
                }
            }}
        />
    );
}
