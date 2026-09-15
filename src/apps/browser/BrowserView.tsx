import styles from '../../screen.module.css';

import React, { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { Effect } from 'effect';
import { BrowserSession } from './session';
import type {
    BrowserCommandStatus,
    BrowserSessionError,
    BrowserSessionSnapshot,
    BrowserURI,
    ResultEntry,
} from './session';
import { AddPanelOptions, DockviewApi, DockviewReadyEvent, IDockviewPanelHeaderProps, IDockviewPanelProps } from "dockview-core";
import { DockviewReact } from "dockview-react";
import { CommandCancelButton, CommandTriggerButton } from '../../gui-helpers/command-controls/CommandControls';
import { DATABASE_RESULTS_PANEL_MIN_HEIGHT, DATABASE_RESULTS_PANEL_MIN_WIDTH } from '../../gui-helpers/dockview/database-results-panel';
import { getDockviewTheme } from "../../gui-helpers/dockview/themes";
import { useSettings } from "../../settings/settings";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import type { CodeEditorHandle } from '../../gui-helpers/code-editor/CodeEditor';
import { SqlEditor } from '../../gui-helpers/code-editor/SqlEditor';
import { SchemaView } from '../../schema/SchemaView';
import type { SchemaStatus } from '../../schema/status';
import { useContextOrDie } from '../../standard-lib';
import { chooseInitialBrowserViewLayout, type BrowserViewLayout } from './layout';
import type { BrowserViewHandle } from './handle';
import { NonreadyView } from '../../gui-helpers/nonready-view/NonreadyView';
import type { ErrorPresentation } from '../../gui-helpers/nonready-view/NonreadyView';
import { databaseSourceErrorToPresentation, sessionErrorToPresentation } from '../../initialization/error-presentation';
import { ResultEntryView } from './ResultEntryView';
import { DatabaseAboutModal } from '../../gui-helpers/database-about-modal/DatabaseAboutModal';
import { PackageLicensesButton } from '../../gui-helpers/package-licenses-button/PackageLicensesButton';
import viewStyles from './BrowserView.module.css';




////////////////////////////////////////
// React context: Dockview <-> Panels //
////////////////////////////////////////

type BrowserViewContextValue = {
    uri: BrowserURI,
    session: BrowserSession,
    results: ResultEntry[],
    schemaStatus: SchemaStatus,
    commandStatus: BrowserCommandStatus,
    
    onSqlSubmit: () => void,
    onCancelCommand: () => void,
    onRemoveResult: (id: number) => void,

    // Register/unregister SQL editor handle
    registerSqlEditorHandle: (handle: CodeEditorHandle | null) => void;
    unregisterSqlEditorHandle: () => void;
}

const BrowserViewContext = createContext<BrowserViewContextValue | null>(null);
const useBrowserViewContext = (): BrowserViewContextValue => useContextOrDie(BrowserViewContext);


/////////////////////
// React component //
/////////////////////

export const BrowserView = React.forwardRef<BrowserViewHandle, {
    uri: BrowserURI;
    session: BrowserSession;
}>(({uri, session}, ref) => {
    const { t } = useTranslation('common');
    const snapshot: BrowserSessionSnapshot = useSyncExternalStore(
        onStoreChange => session.subscribe(onStoreChange),
        () => session.getSnapshot(),
        () => session.getSnapshot(),
    );
    const readyViewHandleRef = useRef<BrowserViewHandle>(null);

    const handle = React.useMemo<BrowserViewHandle>(() => ({
        applyLayout: layout => readyViewHandleRef.current?.applyLayout(layout),
    }), []);
    React.useImperativeHandle(ref, () => handle, [handle]);

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
                error={browserSessionErrorToPresentation(snapshot.error, t)}
            />
        );
    }
    else if (snapshot.kind === 'ready') {
        return (
            <ReadyBrowserView
                ref={readyViewHandleRef}
                uri={uri}
                session={session}
                snapshot={snapshot}
            />
        );
    }
    else { const _n: never = snapshot; return _n; }
});

const ReadyBrowserView = React.forwardRef<BrowserViewHandle, {
    uri: BrowserURI;
    session: BrowserSession;
    snapshot: Extract<BrowserSessionSnapshot, { kind: 'ready' }>;
}>(({ uri, session, snapshot }, ref) => {
    const { darkMode } = useSettings();
    const [aboutModalOpen, setAboutModalOpen] = React.useState(false);
    const widgetDockApiRef = useRef<DockviewApi | null>(null);
    const sqlEditorHandleRef = useRef<CodeEditorHandle | null>(null);
    const highestResultIdRef = useRef(-1);
    const newestResultId = snapshot.results[0]?.id ?? -1;
    const packageInfo = session.getDatabasePackageInfo();
    const registerSqlEditorHandle = (handle: CodeEditorHandle | null) => {
        sqlEditorHandleRef.current = handle;
    };
    const unregisterSqlEditorHandle = () => {
        sqlEditorHandleRef.current = null;
    };

    const handle = React.useMemo<BrowserViewHandle>(() => ({
        applyLayout: layout => {
            if (widgetDockApiRef.current) {
                applyBrowserViewLayout(widgetDockApiRef.current, layout);
            }
        },
    }), []);
    React.useImperativeHandle(ref, () => handle, [handle]);

    useEffect(() => {
        if (newestResultId > highestResultIdRef.current) {
            highestResultIdRef.current = newestResultId;
            widgetDockApiRef.current?.getPanel('Results')?.api.setActive();
        }
    }, [newestResultId]);

    const onSqlSubmit = () => {
        if (sqlEditorHandleRef.current) {
            Effect.runFork(session.dispatch({
                type: 'execute-sql',
                sql: sqlEditorHandleRef.current.getValue(),
            }));
        }
    };

    const onReady = (event: DockviewReadyEvent) => {
        widgetDockApiRef.current = event.api;
        applyBrowserViewLayout(event.api, chooseInitialBrowserViewLayout());
    }

    return (
        <div className={viewStyles.databaseView}>
            {packageInfo === null
                ? null
                : <div className={viewStyles.databaseTitleBar}>
                    <strong className={viewStyles.databaseTitle}>
                        {packageInfo.descriptor.title ?? session.getFilename()}
                    </strong>
                    <PackageLicensesButton onClick={() => setAboutModalOpen(true)} />
                </div>}
            <BrowserViewContext.Provider value={{
                uri,
                session,
                schemaStatus: snapshot.schemaStatus,
                results: snapshot.results,
                commandStatus: snapshot.commandStatus,
                onSqlSubmit,
                onCancelCommand: () => session.cancelRunningCommand(),
                onRemoveResult: id => session.removeResult(id),
                registerSqlEditorHandle,
                unregisterSqlEditorHandle
            }}>
                <div className={viewStyles.dockviewArea}>
                    <DockviewReact
                        theme={getDockviewTheme(darkMode, false, true)}
                        onReady={onReady}
                        components={components}
                        tabComponents={tabComponents}
                    />
                </div>
            </BrowserViewContext.Provider>
            {packageInfo === null
                ? null
                : <DatabaseAboutModal
                    info={packageInfo}
                    show={aboutModalOpen}
                    onHide={() => setAboutModalOpen(false)}
                />}
        </div>
    );
});

function browserSessionErrorToPresentation(
    error: BrowserSessionError,
    t: TFunction<'common'>,
): ErrorPresentation {
    switch (error.kind) {
        case 'parse-database-content':
        case 'fetch-db':
        case 'file-size-too-large':
        case 'run-init-script':
        case 'parse-sql-metadata':
        case 'parse-database-package':
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
        case 'Sql':
            return 'SqlTab';
        case 'Results':
            return 'ResultsTab';
        case 'Schema':
            return 'SchemaTab';
    }
}

const components = {
    Sql: (props: IDockviewPanelProps) => {
        const ctx = useBrowserViewContext();
        const { darkMode } = useSettings();
        const { t } = useTranslation("common");

        const commandInProgress = ctx.commandStatus.kind !== 'idle';
        const initialValue = ctx.schemaStatus.kind === 'loaded' && ctx.schemaStatus.data.length > 0
            ? `SELECT * FROM ${ctx.schemaStatus.data[0].name}`
            : undefined;


        ////////////
        // Render //
        ////////////

        return (
            <div className={styles.padded} style={{ height: '100%' }}>
                <div style={{ display: "flex", flexDirection: "column", height: '100%' }}>
                    <div style={{ flex: '1 1 auto', minHeight: '2rem' }}>
                        <SqlEditor
                            ref={ctx.registerSqlEditorHandle}
                            uri={ctx.session.sqlEditorURI}
                            initialValue={initialValue}
                            darkMode={darkMode}
                            readOnly={commandInProgress}
                        />
                    </div>
                    <div style={{ display: "flex", flex: '0 0 auto', gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                        <CommandCancelButton
                            compactSize='sm'
                            onClick={ctx.onCancelCommand}
                            status={ctx.commandStatus.kind}
                        />
                        <CommandTriggerButton
                            compactSize='sm'
                            variant="primary"
                            onClick={ctx.onSqlSubmit}
                            status={ctx.commandStatus.kind}
                            runningLabel={t('sql.executing')}
                            disabled={commandInProgress}
                        >
                            {t("sql.execute")}
                        </CommandTriggerButton>
                    </div>
                </div>
            </div>
        );
    },
    Results: (props: IDockviewPanelProps) => {
        const ctx = useBrowserViewContext();
    
        const resultViews = ctx.results.map((entry) => {
            const onClose = () => { ctx.onRemoveResult(entry.id); }

            return <ResultEntryView key={entry.id} entry={entry} onClose={onClose} />;
        });

        return (
            <div className={styles.scrollableContent}>
                <div className={`${styles.padded} ${styles.resultsList}`}>
                    {resultViews}
                </div>
            </div>
        );
    },
    Schema: (props: IDockviewPanelProps) => {
        const ctx = useBrowserViewContext();
    
        return (
            <div className={styles.scrollableContent}>
                <div className={`${styles.padded} h-100`}>
                    <SchemaView schemaStatus={ctx.schemaStatus} />
                </div>
            </div>
        );
    }
}

const tabComponents = {
    SqlTab: (props: IDockviewPanelHeaderProps) => {
        const { t } = useTranslation('browser');

        return <>
            <div className="widget-tab-title">
                <strong>{t('sql_tab')}</strong>
            </div>
        </>
    },
    ResultsTab: (props: IDockviewPanelHeaderProps) => {
        const { t } = useTranslation('browser');

        return <>
            <div className="widget-tab-title">
                <strong>{t('results_tab')}</strong>
            </div>
        </>
    },
    SchemaTab: (props: IDockviewPanelHeaderProps) => {
        const { t } = useTranslation('browser');

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

const applyBrowserViewLayout = (api: DockviewApi, layout: BrowserViewLayout) => {
    api.clear();

    if (layout === "desktop") {
        const sqlPanel = api.addPanel(makePanel('Sql'));

        const schemaPanel = makePanel('Schema');
        schemaPanel.position = { direction: 'below' };
        api.addPanel(schemaPanel);

        const resultsPanel = makePanel('Results');
        resultsPanel.position = { direction: 'right' };
        api.addPanel(resultsPanel);

        sqlPanel.api.setActive();
    }
    else if (layout === "mobile") {
        const sqlPanel = api.addPanel(makePanel('Sql'));

        const schemaPanel = makePanel('Schema');
        schemaPanel.position = { direction: 'within', referencePanel: 'Sql' };
        schemaPanel.inactive = true;
        api.addPanel(schemaPanel);

        const resultsPanel = makePanel('Results');
        resultsPanel.position = { direction: 'below', referencePanel: 'Sql' };
        api.addPanel(resultsPanel);

        sqlPanel.group.api.setSize({ height: 200 });
        sqlPanel.api.setActive();
    }
    else { const _n: never = layout; }
};
