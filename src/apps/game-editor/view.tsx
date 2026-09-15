// React
import { createContext, forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Effect } from 'effect';

// React-Bootstrap
import { Form, InputGroup } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

// dockview
import type { AddPanelOptions, DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview-core';
import { DockviewReact } from 'dockview-react';

// Custom CSS
import sharedStyles from '../../screen.module.css';
import styles from './view.module.css';


import type { DbSource } from '../../database/source';
import { sqlScriptWithSystemMetadata } from '../../database/system';
import { assert, reorder } from '../../util';
import type { Scene } from '../../game/model';
import { OpenDbSourceModal, type OpenDbSourceHandle } from '../../gui-helpers/open-modal/OpenDbSourceModal';
import { SourceStatusPanelWithOpenSaveButtons } from '../../gui-helpers/source-status-panel/SourceStatusPanel';
import type { LoadingStatus } from '../../gui-helpers/source-status-panel/SourceStatusPanel';
import { SchemaView } from '../../schema/SchemaView';
import { DATABASE_RESULTS_PANEL_MIN_HEIGHT, DATABASE_RESULTS_PANEL_MIN_WIDTH } from '../../gui-helpers/dockview/database-results-panel';
import { getDockviewTheme } from '../../gui-helpers/dockview/themes';
import { usePanelVisibility } from '../../gui-helpers/dockview/use-panel-visibility';
import type { CodeEditorHandle, CodeEditorURI } from '../../gui-helpers/code-editor/CodeEditor';
import { SqlEditor } from '../../gui-helpers/code-editor/SqlEditor';
import { CommandCancelButton, CommandTriggerButton } from '../../gui-helpers/command-controls/CommandControls';
import { getCommandControlStatus } from '../../gui-helpers/command-controls/command-control-status';
import type { CommandControlStatus } from '../../gui-helpers/command-controls/command-control-status';
import { useSettings } from '../../settings/settings';
import { useContextOrDie } from '../../standard-lib';
import { GameEditorSession } from './session';
import type {
    GameEditorCommand,
    GameEditorDatabaseStatus,
    GameEditorCommandStatus,
    GameEditorSessionError,
    GameEditorSnapshot,
    ResultEntry,
} from './session';
import { NonreadyView } from '../../gui-helpers/nonready-view/NonreadyView';
import type { ErrorPresentation } from '../../gui-helpers/nonready-view/NonreadyView';
import { GamePackageAboutModal } from '../../gui-helpers/game-package-about-modal/GamePackageAboutModal';
import { PackageLicensesButton } from '../../gui-helpers/package-licenses-button/PackageLicensesButton';
import { SessionNotice } from '../../gui-helpers/session-notice/SessionNotice';
import { gameLoadErrorToPresentation, sessionErrorToPresentation } from '../../initialization/error-presentation';
import type { GameEditorViewHandle } from './handle';
import { chooseInitialGameEditorViewLayout, type GameEditorViewLayout } from './layout';
import { EditableScenesWidget } from './scenes/EditableScenesWidget';
import { createEditableScene, type EditableScene } from './scenes/editable-scene';
import { AddSceneModal, EditSceneModal } from './scenes/SceneEditorModals';
import { getStatusResult } from './testing';
import type { SceneTestStatus } from './testing';
import { ResultEntryView } from './ResultEntryView';
import { estimateGameFileSizeBytes } from './game-file';

export { Game } from '../../game/model';
export type {
    ImageSourceStatus,
    ImageSourceStatusEmpty,
    ImageSourceStatusFailed,
    ImageSourceStatusLoaded,
    ImageSourceStatusPending,
} from './scenes/SceneEditorForms';


////////////////////////////////////////
// React context: Dockview <-> Panels //
////////////////////////////////////////

type GameEditorViewContextValue = {
    isVisible: boolean,
    scenes: EditableScene[],
    sceneTestStatuses: SceneTestStatus[],
    canUndoSceneCommand: boolean,
    canRedoSceneCommand: boolean,
    gameFileSizeBytes: number,
    maxGameFileBytes: number,
    teaser: string,
    copyright: string,
    databaseStatus: GameEditorDatabaseStatus,
    commandStatus: GameEditorCommandStatus,
    sqlEditorURI: CodeEditorURI,
    results: ResultEntry[],
    onCommitMetaData: (teaser: string, copyright: string) => void,
    onSetDbSource: (source: DbSource) => void,
    onEditSceneStart: (scene: EditableScene) => void,
    onAddSceneStart: (index: number) => void,
    onDeleteScene: (scene: EditableScene) => void,
    onReorderScenes: (start: number, end: number) => void,
    onUndoSceneCommand: () => void,
    onRedoSceneCommand: () => void,
    onInspectSceneStatus: (scene: EditableScene) => void,
    onTestScene: (scene: EditableScene) => void,
    onTestScenesUpTo: (scene: EditableScene) => void,
    onExecuteSql: () => void,
    onCancelCommand: () => void,
    onRemoveResult: (id: number) => void,
    registerSqlEditorHandle: (handle: CodeEditorHandle | null) => void,
};

const GameEditorViewContext = createContext<GameEditorViewContextValue | null>(null);
const useGameEditorViewContext = (): GameEditorViewContextValue => useContextOrDie(GameEditorViewContext);

export const GameEditorView = forwardRef<GameEditorViewHandle, {
    session: GameEditorSession,
    isVisible: boolean,
}>(({ session, isVisible }, ref) => {
    const { t } = useTranslation('common');
    const snapshot = useSyncExternalStore(
        onStoreChange => session.subscribe(onStoreChange),
        () => session.getSnapshot(),
        () => session.getSnapshot(),
    );
    const readyViewHandleRef = useRef<GameEditorViewHandle>(null);

    const handle = useMemo<GameEditorViewHandle>(() => ({
        applyLayout: layout => readyViewHandleRef.current?.applyLayout(layout),
    }), []);
    useImperativeHandle(ref, () => handle, [handle]);

    useEffect(() => {
        Effect.runFork(session.resolve());
    }, [session]);

    if (snapshot.kind === 'loading') {
        return <NonreadyView kind='loading' />;
    }
    else if (snapshot.kind === 'failed') {
        return (
            <NonreadyView
                kind='failed'
                error={gameEditorSessionErrorToPresentation(snapshot.error, t)}
            />
        );
    }
    else if (snapshot.kind === 'ready') {
        return <ReadyGameEditorView ref={readyViewHandleRef} session={session} snapshot={snapshot} isVisible={isVisible} />;
    }
    else { const _n: never = snapshot; return _n; }
});

const ReadyGameEditorView = forwardRef<GameEditorViewHandle, {
    session: GameEditorSession,
    snapshot: Extract<GameEditorSnapshot, { kind: 'ready' }>,
    isVisible: boolean,
}>(({ session, snapshot, isVisible }, ref) => {
    const { t: tc } = useTranslation('common');
    const { darkMode, settings } = useSettings();
    const [packageAboutOpen, setPackageAboutOpen] = useState(false);
    const [widgetDockApi, setWidgetDockApi] = useState<DockviewApi | null>(null);
    const widgetDockContainerRef = useRef<HTMLDivElement>(null);
    const widgetDockLayoutRef = useRef<GameEditorViewLayout>('desktop');
    const sqlEditorHandleRef = useRef<CodeEditorHandle | null>(null);
    const highestResultIdRef = useRef(-1);
    const newestResultId = snapshot.results[0]?.id ?? -1;
    const scenes = useMemo<EditableScene[]>(
        () => snapshot.document.game.scenes.map(createEditableScene),
        [snapshot.document.game.scenes],
    );
    const commandRunning = snapshot.commandStatus.kind !== 'idle';
    const databaseLoaded = snapshot.databaseStatus.kind === 'loaded';
    const canUndoSceneCommand = session.canUndoSceneCommand();
    const canRedoSceneCommand = session.canRedoSceneCommand();
    const gameFileSizeBytes = useMemo(
        () => estimateGameFileSizeBytes(snapshot.document.game),
        [snapshot.document.game],
    );

    const registerSqlEditorHandle = useCallback((handle: CodeEditorHandle | null) => {
        sqlEditorHandleRef.current = handle;
    }, []);

    const handle = useMemo<GameEditorViewHandle>(() => ({
        applyLayout: layout => {
            widgetDockLayoutRef.current = layout;
            if (widgetDockApi !== null && widgetDockApi.totalPanels > 0) {
                applyGameEditorViewLayout(widgetDockApi, layout, databaseLoaded);
            }
        },
    }), [databaseLoaded, widgetDockApi]);
    useImperativeHandle(ref, () => handle, [handle]);

    useEffect(() => {
        const container = widgetDockContainerRef.current;
        if (widgetDockApi !== null && container !== null) {
            if (widgetDockApi.totalPanels > 0) {
                syncDatabaseDependentPanels(widgetDockApi, databaseLoaded);
            }
            else {
                // Restored tabs can finish loading while detached from the document.
                // Initialize their split only after the container has a usable size.
                const initializeLayout = () => {
                    const { clientWidth, clientHeight } = container;
                    if (clientWidth > 0 && clientHeight > 0) {
                        observer.disconnect();
                        widgetDockApi.layout(clientWidth, clientHeight);
                        applyGameEditorViewLayout(widgetDockApi, widgetDockLayoutRef.current, databaseLoaded);
                    }
                };
                const observer = new ResizeObserver(initializeLayout);
                observer.observe(container);
                initializeLayout();
                return () => observer.disconnect();
            }
        }
    }, [databaseLoaded, widgetDockApi]);

    useEffect(() => {
        if (widgetDockApi !== null && newestResultId > highestResultIdRef.current) {
            highestResultIdRef.current = newestResultId;
            widgetDockApi.getPanel('Results')?.api.setActive();
        }
    }, [newestResultId, widgetDockApi]);


    //////////////////
    // User actions //
    //////////////////

    const onCommitTitle = useCallback((title: string) => {
        Effect.runFork(session.dispatch({
            type: 'update-metadata',
            title,
            teaser: snapshot.document.game.teaser,
            copyright: snapshot.document.game.copyright,
        }));
    }, [session, snapshot.document.game.teaser, snapshot.document.game.copyright]);

    const onCommitMetaData = useCallback((teaser: string, copyright: string) => {
        Effect.runFork(session.dispatch({
            type: 'update-metadata',
            title: snapshot.document.game.title,
            teaser,
            copyright,
        }));
    }, [session, snapshot.document.game.title]);

    const onSetDbSource = useCallback((dbSource: DbSource) => {
        Effect.runFork(session.dispatch({ type: 'set-database-source', source: dbSource }));
    }, [session]);

    const onDeleteScene = useCallback((scene: EditableScene) => {
        const index = scenes.findIndex((s) => s.key === scene.key);
        Effect.runFork(session.dispatch({ type: 'delete-scene', index }));
    }, [scenes, session]);

    const onReorderScenes = useCallback((start: number, end: number) => {
        const indices = reorder(Array.from({length: scenes.length}, (_, i) => i), start, end);
        Effect.runFork(session.dispatch({ type: 'reorder-scenes', indices }));
    }, [scenes, session]);

    const onUndoSceneCommand = useCallback(() => {
        Effect.runFork(session.undoSceneCommand());
    }, [session]);

    const onRedoSceneCommand = useCallback(() => {
        Effect.runFork(session.redoSceneCommand());
    }, [session]);

    const getSceneIndex = useCallback((scene: EditableScene): number => {
        const index = scenes.findIndex(candidate => candidate.key === scene.key);
        assert(index !== -1, 'Scene is not part of the editor');
        return index;
    }, [scenes]);

    const showSceneTestResult = useCallback((result: NonNullable<ReturnType<typeof getStatusResult>>) => {
        sqlEditorHandleRef.current?.setValue(result.sql);
        session.recordResult(result);
        widgetDockApi?.getPanel('Results')?.api.setActive();
    }, [session, widgetDockApi]);

    const onInspectSceneStatus = useCallback((scene: EditableScene) => {
        const index = getSceneIndex(scene);
        const result = getStatusResult(snapshot.sceneTestStatuses[index]);
        assert(result !== null, 'Only a scene status with a result can be inspected');
        showSceneTestResult(result);
    }, [getSceneIndex, showSceneTestResult, snapshot.sceneTestStatuses]);

    const runSceneTest = useCallback((command: Extract<GameEditorCommand, { type: 'test-scene' | 'test-scenes-up-to' }>) => {
        const previousResultId = snapshot.results[0]?.id ?? -1;
        Effect.runFork(session.dispatch(command).pipe(
            Effect.tap(() => Effect.sync(() => {
                const completedSnapshot = session.getSnapshot();
                if (completedSnapshot.kind === 'ready') {
                    const resultEntry = completedSnapshot.results[0];
                    if (resultEntry?.id > previousResultId && resultEntry.type === 'sql') {
                        sqlEditorHandleRef.current?.setValue(resultEntry.result.sql);
                        widgetDockApi?.getPanel('Results')?.api.setActive();
                    }
                }
            })),
        ));
    }, [session, snapshot.results, widgetDockApi]);

    const onTestScene = useCallback((scene: EditableScene) => {
        runSceneTest({
            type: 'test-scene',
            index: getSceneIndex(scene),
        });
    }, [getSceneIndex, runSceneTest]);

    const onTestScenesUpTo = useCallback((scene: EditableScene) => {
        runSceneTest({
            type: 'test-scenes-up-to',
            index: getSceneIndex(scene),
        });
    }, [getSceneIndex, runSceneTest]);

    const onExecuteSql = useCallback(() => {
        if (sqlEditorHandleRef.current !== null) {
            Effect.runFork(session.dispatch({
                type: 'execute-sql',
                sql: sqlEditorHandleRef.current.getValue(),
            }));
        }
    }, [session]);

    const onRemoveResult = useCallback((id: number) => {
        session.removeResult(id);
    }, [session]);


    //////////////////////
    // Edit scene modal //
    //////////////////////
    
    // Text scene currently being edited or `null` if none is being edited
    const [editedScene, setEditedScene] = useState<EditableScene | null>(null);
    const onEditSceneStart = useCallback((scene: EditableScene) => {
        // Start edit mode
        setEditedScene(scene);
    }, []);
    const onEditSceneEnd = useCallback(() => {
        // End edit mode
        setEditedScene(null);
    }, []);
    const onEditSceneEndWithSave = useCallback((scene: EditableScene) => {
        const index = scenes.findIndex((s) => s.key === scene.key);
        Effect.runFork(session.dispatch({ type: 'update-scene', index, scene }));

        // End edit mode
        setEditedScene(null);
    }, [scenes, session]);


    /////////////////////
    // Add scene modal //
    /////////////////////

    const [addSceneIndex, setAddSceneIndex] = useState<number | null>(null);
    const onAddSceneStart = useCallback((index: number) => {
        // Start edit mode
        setAddSceneIndex(index);
    }, []);
    const onAddSceneEnd = useCallback(() => {
        // End edit mode
        setAddSceneIndex(null);
    }, []);
    const onAddSceneEndWithSave = useCallback((scene: Scene) => {
        assert(addSceneIndex !== null);

        Effect.runFork(session.dispatch({ type: 'add-scene', index: addSceneIndex, scene }));

        // End edit mode
        setAddSceneIndex(null);
    }, [addSceneIndex, session]);

    const onReady = useCallback((event: DockviewReadyEvent): void => {
        widgetDockLayoutRef.current = chooseInitialGameEditorViewLayout();
        setWidgetDockApi(event.api);
    }, []);

    const contextValue = useMemo<GameEditorViewContextValue>(() => ({
        isVisible,
        scenes,
        sceneTestStatuses: snapshot.sceneTestStatuses,
        canUndoSceneCommand,
        canRedoSceneCommand,
        gameFileSizeBytes,
        maxGameFileBytes: settings.maxGameFileBytes,
        teaser: snapshot.document.game.teaser,
        copyright: snapshot.document.game.copyright,
        databaseStatus: snapshot.databaseStatus,
        commandStatus: snapshot.commandStatus,
        sqlEditorURI: session.sqlEditorURI,
        results: snapshot.results,
        onCommitMetaData,
        onSetDbSource,
        onEditSceneStart,
        onAddSceneStart,
        onDeleteScene,
        onReorderScenes,
        onUndoSceneCommand,
        onRedoSceneCommand,
        onInspectSceneStatus,
        onTestScene,
        onTestScenesUpTo,
        onExecuteSql,
        onCancelCommand: () => session.cancelRunningCommand(),
        onRemoveResult,
        registerSqlEditorHandle,
    }), [
        isVisible,
        scenes,
        snapshot.sceneTestStatuses,
        canUndoSceneCommand,
        canRedoSceneCommand,
        gameFileSizeBytes,
        settings.maxGameFileBytes,
        snapshot.document.game.teaser,
        snapshot.document.game.copyright,
        snapshot.databaseStatus,
        snapshot.results,
        snapshot.commandStatus,
        onCommitMetaData,
        onSetDbSource,
        onEditSceneStart,
        onAddSceneStart,
        onDeleteScene,
        onReorderScenes,
        onUndoSceneCommand,
        onRedoSceneCommand,
        onInspectSceneStatus,
        onTestScene,
        onTestScenesUpTo,
        onExecuteSql,
        onRemoveResult,
        registerSqlEditorHandle,
        session,
    ]);


    ////////////
    // Render //
    ////////////

    return (
        <div style={{ height: '100%', minHeight: 0 }} className='d-flex flex-column' aria-busy={commandRunning}>
            <EditableGameTitle
                title={snapshot.document.game.title}
                disabled={commandRunning}
                onCommit={onCommitTitle}
            />
            {snapshot.packageInfo === undefined
                ? null
                : <SessionNotice
                    className='border-top-0 border-end-0 border-start-0 rounded-0 py-1'
                    variant='warning'
                    onClose={() => session.discardPackageInfo()}
                >
                    <span className={styles.packageImportNoticeContent}>
                        <span className={styles.packageImportNoticeText}>{tc('game_package_about.import_notice')}</span>
                        <PackageLicensesButton
                            variant='warning-subtle'
                            onClick={() => setPackageAboutOpen(true)}
                        />
                    </span>
                </SessionNotice>}
            <GameEditorViewContext.Provider value={contextValue}>
                <div ref={widgetDockContainerRef} style={{ flex: 1, minHeight: 0 }}>
                    <DockviewReact
                        theme={getDockviewTheme(darkMode, false, true)}
                        onReady={onReady}
                        components={components}
                        tabComponents={tabComponents}
                    />
                </div>
            </GameEditorViewContext.Provider>
            <EditSceneModal initialScene={editedScene} onHide={onEditSceneEnd} onSaveAndHide={onEditSceneEndWithSave} />
            <AddSceneModal show={addSceneIndex !== null} onHide={onAddSceneEnd} onSaveAndHide={onAddSceneEndWithSave} />
            {snapshot.packageInfo === undefined
                ? null
                : <GamePackageAboutModal
                    info={snapshot.packageInfo}
                    show={packageAboutOpen}
                    onHide={() => setPackageAboutOpen(false)}
                />}
        </div>
    );
});

function gameEditorSessionErrorToPresentation(
    error: GameEditorSessionError,
    t: TFunction<'common'>,
): ErrorPresentation {
    switch (error.kind) {
        case 'fetch-game':
        case 'fetch-xml':
        case 'fetch-game-package':
        case 'parse-xml':
        case 'parse-game-package':
        case 'file-size-too-large':
        case 'image-resource-limit':
            return gameLoadErrorToPresentation(error, t);
        case 'unexpected':
            return sessionErrorToPresentation(error.details, t);
        default: {
            const _n: never = error;
            return _n;
        }
    }
}


/////////////////////////
// Dockview components //
/////////////////////////

type PanelID = keyof typeof components;

const SCENES_PANEL_MIN_WIDTH = 300;
const SCENES_PANEL_MIN_HEIGHT = 200;

const makePanel = (type: PanelID): AddPanelOptions => {
    const panel: AddPanelOptions = {
        id: type,
        component: type,
        tabComponent: getTabComponentKey(type),
    };

    if (type === 'Results') {
        panel.minimumWidth = DATABASE_RESULTS_PANEL_MIN_WIDTH;
        panel.minimumHeight = DATABASE_RESULTS_PANEL_MIN_HEIGHT;
    }
    if (type === 'Scenes') {
        panel.minimumWidth = SCENES_PANEL_MIN_WIDTH;
        panel.minimumHeight = SCENES_PANEL_MIN_HEIGHT;
    }

    return panel;
};

const getTabComponentKey = (type: PanelID): keyof typeof tabComponents => {
    switch (type) {
        case 'Scenes':
            return 'ScenesTab';
        case 'Metadata':
            return 'MetadataTab';
        case 'Database':
            return 'DatabaseTab';
        case 'Results':
            return 'ResultsTab';
        case 'Schema':
            return 'SchemaTab';
        default: {
            const _n: never = type;
            return _n;
        }
    }
};

const components = {
    Scenes: ({ api }: IDockviewPanelProps) => {
        const context = useGameEditorViewContext();
        const isVisible = usePanelVisibility(api);
        // Dockview keeps inactive panels mounted with detached DOM, including the containing game panel.
        const draggingEnabled = context.isVisible && isVisible;
        const commandRunning = context.commandStatus.kind !== 'idle';
        const databaseLoaded = context.databaseStatus.kind === 'loaded';
        const testingEnabled = databaseLoaded && !commandRunning;
        return (
            <div className={sharedStyles.scrollableContent} data-testid='game-editor-scenes-panel'>
                <div
                    style={{ pointerEvents: commandRunning ? 'none' : undefined }}
                >
                    <EditableScenesWidget
                        scenes={context.scenes}
                        draggingEnabled={draggingEnabled}
                        sceneTestStatuses={context.sceneTestStatuses}
                        showTestingControls={databaseLoaded}
                        testingEnabled={testingEnabled}
                        commandStatus={context.commandStatus}
                        onCancelCommand={context.onCancelCommand}
                        onEditSceneStart={context.onEditSceneStart}
                        onAddSceneStart={context.onAddSceneStart}
                        onDeleteScene={context.onDeleteScene}
                        onReorderScenes={context.onReorderScenes}
                        undoEnabled={context.canUndoSceneCommand && !commandRunning}
                        redoEnabled={context.canRedoSceneCommand && !commandRunning}
                        gameFileSizeBytes={context.gameFileSizeBytes}
                        maxGameFileBytes={context.maxGameFileBytes}
                        onUndo={context.onUndoSceneCommand}
                        onRedo={context.onRedoSceneCommand}
                        onInspectSceneStatus={context.onInspectSceneStatus}
                        onTestScene={context.onTestScene}
                        onTestScenesUpTo={context.onTestScenesUpTo}
                    />
                </div>
            </div>
        );
    },
    Metadata: () => {
        const context = useGameEditorViewContext();
        const commandRunning = context.commandStatus.kind !== 'idle';
        return (
            <div className={`${styles.gameMetadataPanel} ${sharedStyles.padded}`} data-testid='game-editor-metadata-panel'>
                <EditableGameMetadata
                    teaser={context.teaser}
                    copyright={context.copyright}
                    disabled={commandRunning}
                    onCommit={context.onCommitMetaData}
                />
            </div>
        );
    },
    Database: () => {
        const context = useGameEditorViewContext();
        const { darkMode } = useSettings();
        const { t } = useTranslation('game-editor');
        const { t: tc } = useTranslation('common');
        const commandInProgress = context.commandStatus.kind !== 'idle';
        const sourceStatus = getCommandControlStatus(
            context.commandStatus,
            command => command.type === 'set-database-source',
        );
        const sqlStatus = getCommandControlStatus(
            context.commandStatus,
            command => command.type === 'execute-sql',
        );
        return (
            <div
                className={`${sharedStyles.scrollableContent} ${sharedStyles.padded} d-flex flex-column gap-3`}
                data-testid='game-editor-database-panel'
            >
                <GameDbSourceWidget
                    status={context.databaseStatus}
                    setSource={context.onSetDbSource}
                    disabled={commandInProgress}
                    commandStatus={sourceStatus}
                    onCancel={context.onCancelCommand}
                />
                {
                    context.databaseStatus.kind === 'loaded' &&
                        <div className={styles.sqlEditorArea} data-testid='game-editor-sql-panel'>
                            <Form.Label as='div' className='fw-bold'>{t('sql_tab')}</Form.Label>
                            <div className={styles.sqlEditor}>
                                <SqlEditor
                                    ref={context.registerSqlEditorHandle}
                                    uri={context.sqlEditorURI}
                                    darkMode={darkMode}
                                    readOnly={commandInProgress}
                                />
                            </div>
                            <div className={styles.sqlActions}>
                                <CommandCancelButton
                                    compactSize='sm'
                                    onClick={context.onCancelCommand}
                                    status={sqlStatus}
                                />
                                <CommandTriggerButton
                                    compactSize='sm'
                                    variant='primary'
                                    onClick={context.onExecuteSql}
                                    status={sqlStatus}
                                    runningLabel={tc('sql.executing')}
                                    disabled={commandInProgress}
                                >
                                    {tc('sql.execute')}
                                </CommandTriggerButton>
                            </div>
                        </div>
                }
            </div>
        );
    },
    Results: () => {
        const context = useGameEditorViewContext();
        const resultViews = context.results.map(entry => {
            const onClose = () => {
                context.onRemoveResult(entry.id);
            };

            return <ResultEntryView key={entry.id} entry={entry} onClose={onClose} />;
        });

        return (
            <div className={sharedStyles.scrollableContent} data-testid='game-editor-results-panel'>
                <div className={`${sharedStyles.padded} ${sharedStyles.resultsList}`}>
                    {resultViews}
                </div>
            </div>
        );
    },
    Schema: () => {
        const context = useGameEditorViewContext();
        return (
            <div className={sharedStyles.scrollableContent} data-testid='game-editor-schema-panel'>
                <div className={`${sharedStyles.padded} h-100`}>
                    {
                        context.databaseStatus.kind === 'loaded'
                            ? <SchemaView schemaStatus={{ kind: 'loaded', data: context.databaseStatus.schema }} />
                            : null
                    }
                </div>
            </div>
        );
    },
};

const tabComponents = {
    ScenesTab: () => {
        const { t } = useTranslation('game-editor');
        return <div className='widget-tab-title'><strong>{t('scenes_tab')}</strong></div>;
    },
    MetadataTab: () => {
        const { t } = useTranslation('game-editor');
        return <div className='widget-tab-title'><strong>{t('metadata_tab')}</strong></div>;
    },
    DatabaseTab: () => {
        const { t } = useTranslation('game-editor');
        return <div className='widget-tab-title'><strong>{t('database_tab')}</strong></div>;
    },
    ResultsTab: () => {
        const { t } = useTranslation('game-editor');
        return <div className='widget-tab-title'><strong>{t('results_tab')}</strong></div>;
    },
    SchemaTab: () => {
        const { t } = useTranslation('game-editor');
        return <div className='widget-tab-title'><strong>{t('schema_title')}</strong></div>;
    },
};


/////////////////////
// Dockview layout //
/////////////////////

function addResultsPanel(api: DockviewApi): void {
    const resultsPanel = makePanel('Results');
    resultsPanel.position = { direction: 'within', referencePanel: 'Database' };
    resultsPanel.inactive = true;
    api.addPanel(resultsPanel);
}

function addSchemaPanel(api: DockviewApi): void {
    const schemaPanel = makePanel('Schema');
    schemaPanel.position = { direction: 'below', referencePanel: 'Database' };
    api.addPanel(schemaPanel);
}

function syncDatabaseDependentPanels(api: DockviewApi, showPanels: boolean): void {
    const resultsPanel = api.getPanel('Results' satisfies PanelID);
    const schemaPanel = api.getPanel('Schema' satisfies PanelID);
    if (showPanels) {
        if (resultsPanel === undefined) {
            addResultsPanel(api);
        }
        if (schemaPanel === undefined) {
            addSchemaPanel(api);
        }
    }
    else {
        if (schemaPanel !== undefined) {
            api.removePanel(schemaPanel);
        }
        if (resultsPanel !== undefined) {
            api.removePanel(resultsPanel);
        }
    }
}

function applyGameEditorViewLayout(api: DockviewApi, layout: GameEditorViewLayout, showDatabaseDependentPanels: boolean): void {
    api.clear();

    if (layout === 'desktop') {
        const scenesPanelOptions = makePanel('Scenes');
        const scenesPanel = api.addPanel(scenesPanelOptions);

        const metadataPanel = makePanel('Metadata');
        metadataPanel.position = { direction: 'within', referencePanel: 'Scenes' };
        metadataPanel.inactive = true;
        api.addPanel(metadataPanel);

        const databasePanelOptions = makePanel('Database');
        databasePanelOptions.position = { direction: 'right', referencePanel: 'Scenes' };
        const databasePanel = api.addPanel(databasePanelOptions);

        if (showDatabaseDependentPanels) {
            addResultsPanel(api);
            addSchemaPanel(api);
        }

        databasePanel.api.setSize({
            width: Math.round((scenesPanel.api.width + databasePanel.api.width) * 0.35),
        });
        databasePanel.api.setActive();
    }
    else if (layout === 'mobile') {
        const databasePanelOptions = makePanel('Database');
        const databasePanel = api.addPanel(databasePanelOptions);

        if (showDatabaseDependentPanels) {
            addResultsPanel(api);
            addSchemaPanel(api);
        }

        const scenesPanel = makePanel('Scenes');
        scenesPanel.position = {
            direction: 'below',
            referencePanel: showDatabaseDependentPanels ? 'Schema' : 'Database',
        };
        api.addPanel(scenesPanel);

        const metadataPanel = makePanel('Metadata');
        metadataPanel.position = { direction: 'within', referencePanel: 'Scenes' };
        metadataPanel.inactive = true;
        api.addPanel(metadataPanel);

        databasePanel.group.api.setSize({ height: 240 });
        databasePanel.api.setActive();
    }
    else { const _n: never = layout; }
}

function EditableGameTitle({ title: committedTitle, disabled, onCommit }: {
    title: string,
    disabled: boolean,
    onCommit: (title: string) => void,
}) {
    const inputId = useId();
    const [title, setTitle] = useState(committedTitle);

    useEffect(() => {
        setTitle(committedTitle);
    }, [committedTitle]);

    const onBlur = () => {
        onCommit(title);
    };

    return (
        <div className={styles.gameTitle} data-testid='game-editor-title'>
            <fieldset disabled={disabled}>
                <InputGroup className={styles.gameTitleInput}>
                    <InputGroup.Text as='label' htmlFor={inputId} className='fw-bold'>Name:</InputGroup.Text>
                    <Form.Control
                        id={inputId}
                        type='text'
                        value={title}
                        onChange={event => setTitle(event.target.value)}
                        onBlur={onBlur}
                    />
                </InputGroup>
            </fieldset>
        </div>
    );
}

function EditableGameMetadata({ teaser: committedTeaser, copyright: committedCopyright, disabled, onCommit }: {
    teaser: string,
    copyright: string,
    disabled: boolean,
    onCommit: (teaser: string, copyright: string) => void,
}) {
    const copyrightInputId = useId();
    const teaserInputId = useId();
    const [teaser, setTeaser] = useState(committedTeaser);
    const [copyright, setCopyright] = useState(committedCopyright);

    useEffect(() => {
        setTeaser(committedTeaser);
        setCopyright(committedCopyright);
    }, [committedTeaser, committedCopyright]);

    const onBlur = () => {
        onCommit(teaser, copyright);
    };

    return (
        <fieldset className={styles.gameMetadataForm} disabled={disabled}>
            <Form.Group>
                <Form.Label htmlFor={copyrightInputId} className='fw-bold'>Copyright</Form.Label>
                <Form.Control
                    id={copyrightInputId}
                    type='text'
                    value={copyright}
                    onChange={event => setCopyright(event.target.value)}
                    onBlur={onBlur}
                />
            </Form.Group>
            <Form.Group className={styles.gameMetadataTeaser}>
                <Form.Label htmlFor={teaserInputId} className='fw-bold'>Teaser</Form.Label>
                <Form.Control
                    id={teaserInputId}
                    as='textarea'
                    value={teaser}
                    onChange={event => setTeaser(event.target.value)}
                    onBlur={onBlur}
                />
            </Form.Group>
        </fieldset>
    );
}

//////////////////////////////////
// Open and save game db source //
//////////////////////////////////

function gameDbStatusToLoadingStatus(status: GameEditorDatabaseStatus, t: TFunction<'game-editor'>): LoadingStatus {
    switch (status.kind) {
        case 'empty':
            return { kind: 'empty' };
        case 'pending':
            return { kind: 'pending' };
        case 'loaded':
            return { kind: 'loaded' };
        case 'failed':
            switch (status.error.kind) {
                case 'parse-database-content':
                    return { kind: 'failed', error: t('database_content_error', { details: status.error.details }) };
                case 'fetch-db':
                    return { kind: 'failed', error: t('database_fetch_error', { url: status.error.url }) };
                case 'file-size-too-large':
                    return { kind: 'failed', error: t('database_too_large_error') };
                case 'run-init-script':
                    return { kind: 'failed', error: t('database_initialize_error', { details: status.error.details }) };
                case 'parse-sql-metadata':
                    return { kind: 'failed', error: t('database_metadata_error', { details: status.error.details }) };
                case 'parse-database-package':
                    return { kind: 'failed', error: t('database_package_error', { details: status.error.details }) };
                case 'unsupported-database-system':
                    return { kind: 'failed', error: t('database_system_error', { details: status.error.details }) };
                case 'unsupported-database-system-version':
                    return { kind: 'failed', error: t('database_system_version_error', { details: status.error.details }) };
                case 'read-sqlite-db':
                    return { kind: 'failed', error: t('database_read_error', { details: status.error.details }) };
                case 'database-engine':
                    return { kind: 'failed', error: t('database_engine_error', { details: status.error.details }) };
                case 'parse-schema':
                    return { kind: 'failed', error: t('database_schema_error', { details: status.error.details }) };
                default: {
                    const _n: never = status.error;
                    return _n;
                }
            }
        default: {
            const _n: never = status;
            return _n;
        }
    }
}

function GameDbSourceWidget({ status, setSource, disabled, commandStatus, onCancel }: {
    status: GameEditorDatabaseStatus,
    setSource: (source: DbSource) => void,
    disabled: boolean,
    commandStatus: CommandControlStatus,
    onCancel?: () => void,
}) {
    const { t } = useTranslation('game-editor');
    const { t: tc } = useTranslation('common');
    const openDbSourceRef = useRef<OpenDbSourceHandle>(null);

    const onSave = () => {
        if (status.kind === 'loaded') {
            if (status.dbData.type === 'sqlite-db') {
                const blob = new Blob(
                    [new Uint8Array(status.dbData.data)],
                    { type: 'application/octet-stream' }
                );
                const url = URL.createObjectURL(blob);

                // Create a temporary link to save the database.
                const link = document.createElement('a');
                link.href = url;
                link.download = 'database.db';
                document.body.appendChild(link); // Append the link to the document
                link.click();

                // Cleanup: remove the link and revoke the Blob URL
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
            else {
                const sql = sqlScriptWithSystemMetadata(
                    status.dbData.sql,
                    status.dbData.system,
                    status.dbData.systemMinVersion,
                );
                const blob = new Blob([sql], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);

                // Create a temporary link to save the database.
                const link = document.createElement('a');
                link.href = url;
                link.download = 'database.sql';
                document.body.appendChild(link); // Append the link to the document
                link.click();

                // Cleanup: remove the link and revoke the Blob URL
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        }
    };

    return (
        <>
            <SourceStatusPanelWithOpenSaveButtons
                onOpen={() => openDbSourceRef.current?.open()}
                tooltipText={tc('button.open_database')}
                status={gameDbStatusToLoadingStatus(status, t)}
                onSave={onSave}
                saveTooltipText={t('database_save')}
                disabled={disabled}
                openStatus={commandStatus}
                onCancelOpen={onCancel}
            />
            <OpenDbSourceModal
                ref={openDbSourceRef}
                onOpenFile={setSource}
            />
        </>
    );
}
