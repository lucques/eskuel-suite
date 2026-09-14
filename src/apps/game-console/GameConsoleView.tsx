import sharedStyles from '../../screen.module.css';
import styles from './GameConsoleView.module.css';


// React
import React, { createContext, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Effect } from 'effect';

// React-Bootstrap
import { OverlayTrigger, Tooltip, TooltipProps} from 'react-bootstrap';

import { GameConsoleSession } from './session';
import type { GameConsoleCommandStatus, GameConsoleSessionError, ResultEntry } from './session';
import type { Game } from '../../game/model';
import { useContextOrDie } from '../../standard-lib';
import { useSettings } from '../../settings/settings';
import type { CodeEditorHandle } from '../../gui-helpers/code-editor/CodeEditor';
import { SqlEditor } from '../../gui-helpers/code-editor/SqlEditor';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { AddPanelOptions, DockviewApi, DockviewReadyEvent, IDockviewPanelHeaderProps, IDockviewPanelProps } from 'dockview-core';
import { DockviewReact } from 'dockview-react';
import { SchemaView } from '../../schema/SchemaView';
import type { SchemaStatus } from '../../schema/status';
import { CommandCancelButton, CommandTriggerButton } from '../../gui-helpers/command-controls/CommandControls';
import { getCommandControlStatus } from '../../gui-helpers/command-controls/command-control-status';
import { DATABASE_RESULTS_PANEL_MIN_HEIGHT, DATABASE_RESULTS_PANEL_MIN_WIDTH } from '../../gui-helpers/dockview/database-results-panel';
import { getDockviewTheme } from '../../gui-helpers/dockview/themes';
import { SceneNavbar } from './SceneNavbar';
import { createOrdinaryHintViewState, getHintControls, revealNextOrdinaryHint } from './hints';
import { MetaDataView } from './MetaDataView';
import { SceneContentView, SceneStatusBar } from './SceneContentView';
import { ResultEntryView } from './ResultEntryView';
import type { GameConsoleViewHandle } from './handle';
import { chooseInitialGameConsoleViewLayout, type GameConsoleViewLayout } from './layout';
import { getCurScene, getCurSceneStatus, getSkippedTaskCount, getSolvedTaskCount, getTaskCount, hasNextScene, isCurSceneTask, isCurSceneUnsolvedTask, isFinished } from './game-progress';
import type { GameProgress } from './game-progress';
import { NonreadyView } from '../../gui-helpers/nonready-view/NonreadyView';
import type { ErrorPresentation } from '../../gui-helpers/nonready-view/NonreadyView';
import {
    databaseSourceErrorToPresentation,
    gameLoadErrorToPresentation,
    sessionErrorToPresentation,
} from '../../initialization/error-presentation';

export { Game } from '../../game/model';


////////////////////////////////////////
// React context: Dockview <-> Panels //
////////////////////////////////////////

type GameConsoleViewContextValue = {
    session: GameConsoleSession,
    game: Game,
    gameProgress: GameProgress,
    results: ResultEntry[],
    schemaStatus: SchemaStatus,
    editor: {
        value: string,
        revision: number,
    },
    commandStatus: GameConsoleCommandStatus,

    onReset: () => void,
    onSqlSubmit: () => void,
    onNextScene: () => void,
    onResetDbInCurScene: () => void,
    onShowOrdinaryHint: () => void,
    onShowSolutionHint: () => void,
    onResetSolutionHint: () => void,
    onShowSolution: () => void,
    onCancelCommand: () => void,
    onRemoveResult: (id: number) => void,

    // Register SQL editor handle
    registerSqlEditorHandle: (handle: CodeEditorHandle | null) => void;
};
const GameConsoleViewContext = createContext<GameConsoleViewContextValue | null>(null);
const useGameConsoleViewContext = (): GameConsoleViewContextValue => useContextOrDie(GameConsoleViewContext);


/////////////////////
// React component //
/////////////////////

export const GameConsoleView = React.forwardRef<GameConsoleViewHandle, {
    session: GameConsoleSession;
}>(({session}, ref) => {

    const { darkMode } = useSettings();
    const { t } = useTranslation('common');

    const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
    const getSnapshot = useCallback(() => session.getSnapshot(), [session]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    //////////
    // Refs //
    //////////

    const sqlEditorHandleRef = useRef<CodeEditorHandle | null>(null);
    const widgetDockApiRef = useRef<DockviewApi | null>(null);
    const highestResultIdRef = useRef(-1);
    const newestResultId = snapshot.kind === 'ready'
        ? snapshot.results[0]?.id ?? -1
        : -1;


    /////////////////////
    // Manipulate refs //
    /////////////////////

    const registerSqlEditorHandle = (handle: CodeEditorHandle | null) => {
        sqlEditorHandleRef.current = handle;
    };

    const handle = React.useMemo<GameConsoleViewHandle>(() => ({
        applyLayout: (layout) => {
            if (widgetDockApiRef.current) {
                applyGameConsoleViewLayout(widgetDockApiRef.current, layout);
            }
        },
    }), []);
    React.useImperativeHandle(ref, () => handle, [handle]);

    ////////////////////////////////
    // Trigger resolution on init //
    ////////////////////////////////

    useEffect(() => {
        Effect.runFork(session.resolve());
    }, [session]);

    useEffect(() => {
        if (newestResultId > highestResultIdRef.current) {
            highestResultIdRef.current = newestResultId;
            widgetDockApiRef.current?.getPanel('Results')?.api.setActive();
        }
    }, [newestResultId]);

    const editorRevision = snapshot.kind === 'ready' ? snapshot.editor.revision : null;
    const editorValue = snapshot.kind === 'ready' ? snapshot.editor.value : '';

    useEffect(() => {
        if (editorRevision !== null) {
            sqlEditorHandleRef.current?.setValue(editorValue);
        }
    }, [editorRevision, editorValue]);


    //////////////////
    // User actions //
    //////////////////

    const onReset = () => {
        Effect.runFork(session.dispatch({ type: 'restart' }));
    };

    const onNextScene = () => {
        Effect.runFork(session.dispatch({ type: 'next-scene', origin: 'navbar' }));
    };

    const onNextSceneFromContent = () => {
        Effect.runFork(session.dispatch({ type: 'next-scene', origin: 'scene-content' }));
    };

    const onPreviousScene = () => {
        Effect.runFork(session.dispatch({ type: 'previous-scene' }));
    };

    const onSkipScene = () => {
        Effect.runFork(session.dispatch({ type: 'skip-scene' }));
    };

    const onSubmitSql = () => {
        if (sqlEditorHandleRef.current) {
            Effect.runFork(session.dispatch(
                { type: 'submit-sql', sql: sqlEditorHandleRef.current.getValue() },
            ));
        }
    };

    const onResetDbInCurScene = () => {
        Effect.runFork(session.dispatch({ type: 'reset-db-in-current-scene' }));
    };

    const onShowOrdinaryHint = () => {
        Effect.runFork(session.dispatch({ type: 'show-ordinary-hint' }));
    };

    const onShowSolutionHint = () => {
        Effect.runFork(session.dispatch({ type: 'show-solution-hint' }));
    };

    const onResetSolutionHint = () => {
        Effect.runFork(session.dispatch({ type: 'reset-solution-hint' }));
    };

    const onShowSolution = () => {
        Effect.runFork(session.dispatch({ type: 'show-solution' }));
    };

    const onRemoveResult = (id: number) => {
        session.removeResult(id);
    };


    ////////////
    // Render //
    ////////////

    const onReady = (event: DockviewReadyEvent) => {
        widgetDockApiRef.current = event.api;
        applyGameConsoleViewLayout(event.api, chooseInitialGameConsoleViewLayout());
    };

    if (snapshot.kind === 'ready') {
        const { game, progress: gameProgress, schemaStatus, results, editor, commandStatus } = snapshot;
        const commandRunning = commandStatus.kind !== 'idle';
        const canGoPrevious = gameProgress.curSceneIndex > 0
            || (getCurSceneStatus(gameProgress) === 'task-skipped' && !hasNextScene(game, gameProgress));
        const canGoNext = hasNextScene(game, gameProgress) && !isCurSceneUnsolvedTask(game, gameProgress);
        const canSkip = getCurSceneStatus(gameProgress) === 'task-unsolved';

        return (
            <div style={{ height: '100%', minHeight: 0 }} className='d-flex flex-column' aria-busy={commandRunning}>
                <MetaDataView
                    title={game.title}
                    copyright={game.copyright}
                    teaser={game.teaser}
                    packageInfo={snapshot.packageInfo}
                />
                <GameConsoleViewContext.Provider value={{
                    session,
                    game,
                    gameProgress,
                    results,
                    schemaStatus,
                    editor,
                    commandStatus,
                    onReset,
                    onSqlSubmit: onSubmitSql,
                    onNextScene: onNextSceneFromContent,
                    onResetDbInCurScene,
                    onShowOrdinaryHint,
                    onShowSolutionHint,
                    onResetSolutionHint,
                    onShowSolution,
                    onCancelCommand: () => session.cancelRunningCommand(),
                    onRemoveResult,
                    registerSqlEditorHandle
                }}>
                    <SceneNavbar
                        current={gameProgress.curSceneIndex + 1}
                        total={game.scenes.length}
                        canGoPrevious={canGoPrevious}
                        canGoNext={canGoNext}
                        canSkip={canSkip}
                        commandStatus={commandStatus}
                        skippedCount={getSkippedTaskCount(gameProgress)}
                        onPrevious={onPreviousScene}
                        onNext={onNextScene}
                        onSkip={onSkipScene}
                        onReset={onReset}
                    />
                    <div style={{ flex: 1, minHeight: 0 }} className='border border-dark-subtle border-top-0'>
                        <DockviewReact
                            theme={getDockviewTheme(darkMode, false, true)}
                            onReady={onReady}
                            components={components}
                            tabComponents={tabComponents}
                        />
                    </div>
                </GameConsoleViewContext.Provider>
            </div>
        );
    }
    else if (snapshot.kind === 'loading') {
        return (
            <NonreadyView kind='loading' />
        );
    }
    else if (snapshot.kind === 'failed') {
        return (
            <NonreadyView
                kind='failed'
                error={gameSessionErrorToPresentation(snapshot.error, t)}
            />
        );
    }
    else {
        const _n: never = snapshot;
        return _n;
    }
});

function gameSessionErrorToPresentation(
    error: GameConsoleSessionError,
    t: TFunction<'common'>,
): ErrorPresentation {
    switch (error.kind) {
        case 'fetch-xml':
        case 'fetch-game-package':
        case 'parse-xml':
        case 'parse-game-package':
        case 'file-size-too-large':
        case 'image-resource-limit':
            return gameLoadErrorToPresentation(error, t);
        case 'run-init-script':
        case 'parse-sql-metadata':
        case 'unsupported-database-system':
        case 'unsupported-database-system-version':
        case 'read-sqlite-db':
        case 'database-engine':
            return databaseSourceErrorToPresentation(error, t);
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

// Each panel has its own ID because there exists at most one instance of each

type PanelID = keyof typeof components;

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

    return panel;
}

const getTabComponentKey = (type: PanelID): keyof typeof tabComponents => {
    switch (type) {
        case 'Scene':
            return 'SceneTab';
        case 'Sql':
            return 'SqlTab';
        case 'Results':
            return 'ResultsTab';
        case 'Schema':
            return 'SchemaTab';
    }
}

const components = {
    Scene: (props: IDockviewPanelProps) => {
        const ctx = useGameConsoleViewContext();
        const sceneIndex = ctx.gameProgress.curSceneIndex;
        const scene = getCurScene(ctx.game, ctx.gameProgress);
        const [ordinaryHintViewState, setOrdinaryHintViewState] = useState(() => createOrdinaryHintViewState(sceneIndex));

        useEffect(() => {
            setOrdinaryHintViewState(createOrdinaryHintViewState(sceneIndex));
        }, [ctx.game, sceneIndex]);

        const activeOrdinaryHintViewState = ordinaryHintViewState.sceneIndex === sceneIndex
            ? ordinaryHintViewState
            : createOrdinaryHintViewState(sceneIndex);
        const sceneStatus = getCurSceneStatus(ctx.gameProgress);
        const gameFinished = isFinished(ctx.game, ctx.gameProgress);
        const skippedTaskCount = getSkippedTaskCount(ctx.gameProgress);
        const solvedTaskCount = getSolvedTaskCount(ctx.gameProgress);
        const taskCount = getTaskCount(ctx.game);
        const showNextButton = hasNextScene(ctx.game, ctx.gameProgress) && sceneStatus === 'nontask-unseen';
        const showSceneStatusBar = gameFinished || isCurSceneTask(ctx.game, ctx.gameProgress);
        const commandInProgress = ctx.commandStatus.kind !== 'idle';
        const nextStatus = getCommandControlStatus(
            ctx.commandStatus,
            command => command.type === 'next-scene' && command.origin === 'scene-content',
        );
        const ordinaryHintStatus = getCommandControlStatus(
            ctx.commandStatus,
            command => command.type === 'show-ordinary-hint',
        );
        const solutionHintStatus = getCommandControlStatus(
            ctx.commandStatus,
            command => command.type === 'show-solution-hint',
        );
        const resetHintsStatus = getCommandControlStatus(
            ctx.commandStatus,
            command => command.type === 'reset-solution-hint',
        );
        const solutionStatus = getCommandControlStatus(
            ctx.commandStatus,
            command => command.type === 'show-solution',
        );
        const {
            taskScene, totalHintCount, hasNextOrdinaryHint,
            showOrdinaryHintButton, ordinaryHintDisabled, showSolutionHintButton, solutionHintDisabled, showResetHintsButton,
        } = getHintControls(scene, sceneStatus, activeOrdinaryHintViewState, ordinaryHintStatus !== 'idle');

        const onShowNextOrdinaryHint = () => {
            if (taskScene !== null && hasNextOrdinaryHint) {
                const ordinaryHint = taskScene.ordinaryHints[activeOrdinaryHintViewState.nextOrdinaryHintIndex];
                setOrdinaryHintViewState(revealNextOrdinaryHint(scene, activeOrdinaryHintViewState));
                if (ordinaryHint.type === 'expected-result') {
                    ctx.onShowOrdinaryHint();
                }
            }
        };

        const onResetHints = () => {
            setOrdinaryHintViewState(createOrdinaryHintViewState(sceneIndex));
            if (sceneStatus === 'task-solved-by-sol-hint') {
                ctx.onResetSolutionHint();
            }
        };

        return (
            <div className={styles.scenePanel}>
                <div className={styles.sceneScrollableContent}>
                    <div className={styles.sceneContent}>
                        <SceneContentView
                            scene={scene}
                            showNextButton={showNextButton}
                            nextDisabled={commandInProgress}
                            nextStatus={nextStatus}
                            onNext={ctx.onNextScene}
                            revealedOrdinaryTextHints={gameFinished
                                ? []
                                : activeOrdinaryHintViewState.revealedOrdinaryTextHints}
                        />
                    </div>
                </div>
                {
                    !showSceneStatusBar
                    ? null
                    : <SceneStatusBar
                        sceneStatus={sceneStatus}
                        gameFinished={gameFinished}
                        skippedTaskCount={skippedTaskCount}
                        solvedTaskCount={solvedTaskCount}
                        taskCount={taskCount}
                        onShowOrdinaryHint={onShowNextOrdinaryHint}
                        onShowSolutionHint={ctx.onShowSolutionHint}
                        onResetHints={onResetHints}
                        onShowSolution={ctx.onShowSolution}
                        onCancelOrdinaryHint={ctx.onCancelCommand}
                        onCancelSolutionHint={ctx.onCancelCommand}
                        onCancelSolution={ctx.onCancelCommand}
                        ordinaryHintStatus={ordinaryHintStatus}
                        solutionHintStatus={solutionHintStatus}
                        resetHintsStatus={resetHintsStatus}
                        solutionStatus={solutionStatus}
                        showOrdinaryHintButton={showOrdinaryHintButton}
                        nextOrdinaryHintNumber={taskScene === null
                            ? 1
                            : Math.min(activeOrdinaryHintViewState.nextOrdinaryHintIndex + 1, taskScene.ordinaryHints.length)}
                        ordinaryHintCount={taskScene?.ordinaryHints.length ?? 0}
                        totalHintCount={totalHintCount}
                        ordinaryHintDisabled={ordinaryHintDisabled}
                        showSolutionHintButton={showSolutionHintButton}
                        solutionHintDisabled={solutionHintDisabled}
                        showResetHintsButton={showResetHintsButton}
                        disabled={commandInProgress}
                    />
                }
            </div>
        );
    },
    Sql: (props: IDockviewPanelProps) => {
        const ctx = useGameConsoleViewContext();
        const { darkMode } = useSettings();
        const { t } = useTranslation('game-console');
        const { t: tc } = useTranslation('common');
        const commandInProgress = ctx.commandStatus.kind !== 'idle';
        const resetStatus = getCommandControlStatus(
            ctx.commandStatus,
            command => command.type === 'reset-db-in-current-scene',
        );
        const sqlStatus = getCommandControlStatus(
            ctx.commandStatus,
            command => command.type === 'submit-sql',
        );

        ////////////
        // Render //
        ////////////

        return (
            <div className={`${sharedStyles.padded} ${styles.sqlPanel}`}>
                <div className={styles.sqlPanelContent}>
                    <div className={styles.sqlEditor}>
                        <SqlEditor
                            ref={ctx.registerSqlEditorHandle}
                            uri={ctx.session.sqlEditorURI}
                            initialValue={ctx.editor.value}
                            darkMode={darkMode}
                            readOnly={commandInProgress}
                        />
                    </div>
                    <div className={styles.sqlActions}>
                        <div className='d-flex align-items-center gap-2'>
                            <OverlayTrigger
                                placement='bottom'
                                flip
                                delay={{ show: 0, hide: 0 }}
                                overlay={(overlayProps: TooltipProps) => (
                                    <Tooltip {...overlayProps}>{t('reset_scene_tooltip')}</Tooltip>
                                )}>
                                <CommandTriggerButton
                                    disabled={commandInProgress}
                                    compactSize='sm'
                                    onClick={ctx.onResetDbInCurScene}
                                    status={resetStatus}
                                >
                                    {t('reset_scene')}
                                </CommandTriggerButton>
                            </OverlayTrigger>
                        </div>
                        <div className='d-flex align-items-center gap-2'>
                            <CommandCancelButton
                                compactSize='sm'
                                onClick={ctx.onCancelCommand}
                                status={sqlStatus}
                            />
                            <CommandTriggerButton
                                disabled={commandInProgress}
                                compactSize='sm'
                                variant='primary'
                                onClick={ctx.onSqlSubmit}
                                status={sqlStatus}
                                runningLabel={tc('sql.executing')}
                            >
                                {tc('sql.execute')}
                            </CommandTriggerButton>
                        </div>
                    </div>
                </div>
            </div>
        );
    },
    Results: (props: IDockviewPanelProps) => {
        const ctx = useGameConsoleViewContext();
    
        const resultViews = ctx.results.map((entry) => {
            const onClose = () => { ctx.onRemoveResult(entry.id); }

            return <ResultEntryView key={entry.id} entry={entry} onClose={onClose} />;
        });

        return (
            <div className={sharedStyles.scrollableContent}>
                <div className={`${sharedStyles.padded} ${sharedStyles.resultsList}`}>
                    {resultViews}
                </div>
            </div>
        );
    },
    Schema: (props: IDockviewPanelProps) => {
        const ctx = useGameConsoleViewContext();
    
        return (
            <div className={sharedStyles.scrollableContent}>
                <div className={`${sharedStyles.padded} h-100`}>
                    <SchemaView schemaStatus={ctx.schemaStatus} />
                </div>
            </div>
        );
    }
}

const tabComponents = {
    SceneTab: (props: IDockviewPanelHeaderProps) => {
        const { t } = useTranslation('game-console');

        return <>
            <div className="widget-tab-title">
                <strong>{t('scene_tab')}</strong>
            </div>
        </>
    },
    SqlTab: (props: IDockviewPanelHeaderProps) => {
        const { t } = useTranslation('game-console');

        return <>
            <div className="widget-tab-title">
                <strong>{t('sql_tab')}</strong>
            </div>
        </>
    },
    ResultsTab: (props: IDockviewPanelHeaderProps) => {
        const { t } = useTranslation('game-console');

        return <>
            <div className="widget-tab-title">
                <strong>{t('results_tab')}</strong>
            </div>
        </>
    },
    SchemaTab: (props: IDockviewPanelHeaderProps) => {
        const { t } = useTranslation('game-console');

        return <>
            <div className="widget-tab-title">
                <strong>{t('schema_tab')}</strong>
            </div>
        </>
    },
}


//////////////////////
// Dockview layouts //
//////////////////////

const applyGameConsoleViewLayout = (api: DockviewApi, layout: GameConsoleViewLayout) => {
    api.clear();

    if (layout === 'desktop') {
        const scenePanel = api.addPanel(makePanel('Scene'));

        const sqlPanel = makePanel('Sql');
        sqlPanel.position = { direction: 'below' };
        const addedSqlPanel = api.addPanel(sqlPanel);

        const schemaPanel = makePanel('Schema');
        schemaPanel.position = { direction: 'left', referencePanel: 'Sql' };
        const addedSchemaPanel = api.addPanel(schemaPanel);

        addedSqlPanel.api.setSize({
            height: Math.round((scenePanel.api.height + addedSqlPanel.api.height) * 0.5),
        });
        addedSchemaPanel.api.setSize({
            width: Math.round((addedSqlPanel.api.width + addedSchemaPanel.api.width) * 0.5),
        });

        const resultsPanel = makePanel('Results');
        resultsPanel.position = { direction: 'right' };
        api.addPanel(resultsPanel);
    }
    else if (layout === 'mobile') {
        const scenePanel = api.addPanel(makePanel('Scene'));

        const sqlPanelOptions = makePanel('Sql');
        sqlPanelOptions.position = { direction: 'within', referencePanel: 'Scene' };
        sqlPanelOptions.inactive = true;
        api.addPanel(sqlPanelOptions);

        const schemaPanel = makePanel('Schema');
        schemaPanel.position = { direction: 'within', referencePanel: 'Scene' };
        schemaPanel.inactive = true;
        api.addPanel(schemaPanel);

        const resultsPanel = makePanel('Results');
        resultsPanel.position = { direction: 'below', referencePanel: 'Scene' };
        api.addPanel(resultsPanel);

        scenePanel.api.setActive();
    }
    else { const _n: never = layout; }
};
