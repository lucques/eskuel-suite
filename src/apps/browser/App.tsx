import { createContext, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { DatabaseCatalogEntry } from '../../catalog';
import { BrowserSession } from './session';
import type { BrowserSessionSnapshot, BrowserURI } from './session';
import { assert, WithFilename } from "../../util";

import "bootstrap-icons/font/bootstrap-icons.css";
import { DbSource } from '../../database/source';
import { DockviewApi, DockviewReadyEvent, IDockviewPanelHeaderProps, IDockviewPanelProps, IWatermarkPanelProps } from "dockview-core";
import { OpenDbSourceModal, type OpenDbSourceHandle } from '../../gui-helpers/open-modal/OpenDbSourceModal';
import { DockviewReact } from "dockview-react";
import { BrowserView } from './BrowserView';
import { type BrowserViewLayout } from './layout';
import type { BrowserViewHandle } from './handle';
import { ButtonGroup, Spinner } from "react-bootstrap";
import { DarkModeToggle } from "../../gui-helpers/dark-mode-toggle/DarkModeToggle";
import { useTranslation } from "react-i18next";
import { getDockviewTheme } from "../../gui-helpers/dockview/themes";
import { IconActionButton } from "../../gui-helpers/icon-button/IconActionButton";
import { useSettings } from "../../settings/settings";
import { useContextOrDie } from "../../standard-lib";

import styles from '../../screen.module.css';
import { LanguageSwitcher } from "../../gui-helpers/language-switcher/LanguageSwitcher";
import { LayoutSwitcher, type LayoutOption } from "../../gui-helpers/layout-switcher/LayoutSwitcher";
import { ConfirmLeaveModal } from "../../gui-helpers/confirm-leave-modal/ConfirmLeaveModal";
import { Topbar, TopbarActionsLeft, TopbarActionsRight, TopbarLinksRight, TopbarTitle } from "../../gui-helpers/topbar/Topbar";
import { AppThemeScope } from '../../gui-helpers/app-theme/AppTheme';
import { DockviewTabCloseButton } from '../../gui-helpers/dockview/DockviewTabCloseButton';
import { DockviewTabButton } from '../../gui-helpers/dockview/DockviewTabButton';
import type { LocalizedLink } from '../component-options';
import { LocalizedNavigationLinks } from '../LocalizedNavigationLinks';

/////////////////////
// React component //
/////////////////////

export function App({
    initialInstances,
    databaseCatalog = [],
    linksCenterLeft = undefined,
    linksRight = undefined,
}: {
    initialInstances: BrowserSession[],
    databaseCatalog?: readonly DatabaseCatalogEntry[],
    linksCenterLeft?: readonly LocalizedLink[],
    linksRight?: readonly LocalizedLink[],
}) {
    const { t } = useTranslation('browser');
    const { t: tc, i18n } = useTranslation('common');
    const browserDockLayoutOptions = [
        { value: 'desktop', label: <span className='d-inline-flex align-items-center gap-2'><i className='bi bi-window-desktop' />{tc('layout.desktop')}</span> },
        { value: 'mobile', label: <span className='d-inline-flex align-items-center gap-2'><i className='bi bi-phone' />{tc('layout.mobile')}</span> },
    ] satisfies readonly LayoutOption<BrowserViewLayout>[];
    const { settings, darkMode } = useSettings();
    const activeLanguage = i18n.resolvedLanguage ?? i18n.language;


    const initiallyOpenedBrowsers: Partial<Record<BrowserURI, BrowserSession>> =
        Object.fromEntries(
            initialInstances.map((instance) => [instance.uri, instance])
        )
    

    ///////////
    // State //
    ///////////

    const [browsers, setBrowsers] = useState<Partial<Record<BrowserURI, BrowserSession>>>(initiallyOpenedBrowsers);
    const openBrowserCount = Object.values(browsers).filter(browser => browser !== undefined).length;
    const canOpenDatabase = openBrowserCount < settings.maxOpenDatabases;


    ////////////////
    // References //
    ////////////////

    const dockApiRef = useRef<DockviewApi | null>(null);
    const browserViewHandleRefs = useRef<Partial<Record<BrowserURI, BrowserViewHandle>>>({});
    const openDbSourceRef = useRef<OpenDbSourceHandle>(null);

    const registerBrowserViewHandle = useCallback((uri: BrowserURI, handle: BrowserViewHandle) => {
        browserViewHandleRefs.current = { ...browserViewHandleRefs.current, [uri]: handle };
    }, []);

    const unregisterBrowserViewHandle = useCallback((uri: BrowserURI) => {
        const nextHandles = { ...browserViewHandleRefs.current };
        delete nextHandles[uri];
        browserViewHandleRefs.current = nextHandles;
    }, []);

    const onSelectBrowserViewLayout = (layout: BrowserViewLayout) => {
        const activePanel = dockApiRef.current?.activePanel;
        if (!activePanel) {
            return;
        }

        const params = activePanel.params as BrowserParams;
        browserViewHandleRefs.current[params.uri]?.applyLayout(layout);
    };


    ////////////////////////
    // State manipulation //
    ////////////////////////

    const onAddBrowser = (source: WithFilename<DbSource>) => {
        if (!canOpenDatabase) {
            return;
        }

        const newSession = new BrowserSession(source.filename, source);

        // Update state
        setBrowsers(prev => ({ ...prev, [newSession.uri]: newSession }));
    
        // Update dock
        addBrowserPanel(newSession);
    }
    
    const onRemoveBrowser = (uri: BrowserURI) => {
        browsers[uri]?.dispose();

        // Update state
        setBrowsers(prev => {
            const copy = { ...prev };
            delete copy[uri];
            return copy;
        });

        // Update dock
        removeBrowserPanel(uri);
    }


    /////////////////////////
    // Open database modal //
    /////////////////////////

    const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(null);

    // Start "open" mode
    const onOpenDatabaseStart = () => {
        if (canOpenDatabase) {
            openDbSourceRef.current?.open();
        }
    };

    const onOpenDatabaseEndWithConfirm = (source: WithFilename<DbSource>) => {

        // Commit changes
        onAddBrowser(source);

    };


    ////////////////////
    // Dockview: Init //
    ////////////////////

    const onReady = (event: DockviewReadyEvent) => {
        // Save API
        dockApiRef.current = event.api;

        // Load initial programs and worlds
        for (const browser of Object.values(browsers)) {
            if (!browser) { continue; }
            addBrowserPanel(browser);
        }
    };


    ////////////////////////////
    // Dockview: Manipulation //
    ////////////////////////////

    const addBrowserPanel = (browser: BrowserSession) => {
        if (dockApiRef.current) {
            dockApiRef.current.addPanel({
                id: browser.uri,
                component:    'BrowserPanel' satisfies keyof typeof components,
                tabComponent: 'BrowserTab'   satisfies keyof typeof tabComponents,
                params: { uri: browser.uri },
            });
        }
    };

    const removeBrowserPanel = (uri: BrowserURI) => {
        if (dockApiRef.current) {
            const panel = dockApiRef.current.getPanel(uri);
            if (panel) {
                dockApiRef.current.removePanel(panel);
            }
        }
    };

    const onLeaveAppCancel = () => {
        setPendingNavigationUrl(null);
    };

    const onLeaveAppConfirm = () => {
        assert(pendingNavigationUrl !== null);
        window.location.href = pendingNavigationUrl;
    };


    ////////////
    // Render //
    ////////////

    return (
        <AppThemeScope theme='browser' className={styles.root}>
            {
                /////////////
                // Top bar //
                /////////////
            }
            <Topbar>
                <TopbarTitle>
                    <span className="text-body">{t('title')}</span>
                </TopbarTitle>
                <TopbarActionsLeft>
                    <div className='d-flex align-items-center gap-1'>
                        <IconActionButton
                            onClick={onOpenDatabaseStart}
                            disabled={!canOpenDatabase}
                            tooltipText={tc('button.open_database')}
                            variant='primary-subtle'
                            compactSize='sm'
                        >
                            <i className='bi bi-folder2-open' />
                        </IconActionButton>
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
                            layouts={browserDockLayoutOptions}
                            onSelect={onSelectBrowserViewLayout}
                            id="browser-layout-switcher"
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
            {
                //////////
                // Tabs //
                //////////
            }
            <AppContext.Provider value={{
                browsers,
                onOpenDatabaseStart,
                onRemoveBrowser,
                registerBrowserViewHandle,
                unregisterBrowserViewHandle,
            }}>
                <div className={styles.contentArea}>
                    <DockviewReact
                        theme={getDockviewTheme(darkMode, true, false)}
                        onReady={onReady}
                        components={components}
                        tabComponents={tabComponents}
                        watermarkComponent={BrowserWatermark}
                    />
                </div>
            </AppContext.Provider>
            {
                ////////////
                // Modals //
                ////////////
            }
            <OpenDbSourceModal
                ref={openDbSourceRef}
                databaseCatalog={databaseCatalog}
                onOpenFile={onOpenDatabaseEndWithConfirm}
            />
            <ConfirmLeaveModal
                show={pendingNavigationUrl !== null}
                onHide={onLeaveAppCancel}
                onConfirm={onLeaveAppConfirm}
            />
        </AppThemeScope>
    );
}


//////////////////////////////////////////////
// React context: App <----> Browser panels //
//////////////////////////////////////////////

type AppContextVal = {
    browsers: Partial<Record<BrowserURI, BrowserSession>>;

    onOpenDatabaseStart: () => void;
    onRemoveBrowser: (uri: BrowserURI) => void;
    registerBrowserViewHandle: (uri: BrowserURI, handle: BrowserViewHandle) => void;
    unregisterBrowserViewHandle: (uri: BrowserURI) => void;
}

const AppContext = createContext<AppContextVal | null>(null);
const useAppContext = (): AppContextVal => useContextOrDie(AppContext);


/////////////////////////
// Dockview Components //
/////////////////////////

type BrowserParams = { uri: BrowserURI };

const components = {
    BrowserPanel
};

const tabComponents = {
    BrowserTab
}

function BrowserWatermark(props: IWatermarkPanelProps) {
    const { t } = useTranslation('browser');

    return (
        <div className="d-inline-flex gap-2 p-3">
            <i className="bi bi-database-fill-add" />
            <span>{t('no_database_opened')}</span>
        </div>
    );
}

function BrowserPanel(props: IDockviewPanelProps<BrowserParams>) {
    const {
        browsers,
        registerBrowserViewHandle,
        unregisterBrowserViewHandle,
    } = useAppContext();
    const session = browsers[props.params.uri];
    assert(session !== undefined);

    const browserViewHandleRef = useRef<BrowserViewHandle>(null);
    useEffect(() => {
        if (browserViewHandleRef.current) {
            registerBrowserViewHandle(session.uri, browserViewHandleRef.current);
        }

        return () => {
            unregisterBrowserViewHandle(session.uri);
        };
    }, [registerBrowserViewHandle, unregisterBrowserViewHandle, session.uri]);

    return (
        <BrowserView
            ref={browserViewHandleRef}
            key={session.uri}
            uri={session.uri}
            session={session}
        />
    );
}

function BrowserTab(props: IDockviewPanelHeaderProps<BrowserParams>) {
    const appCtx = useAppContext();
    const session = appCtx.browsers[props.params.uri];
    assert(session !== undefined);

    const snapshot = useSyncExternalStore(
        onStoreChange => session.subscribe(onStoreChange),
        () => session.getSnapshot(),
        () => session.getSnapshot(),
    );
    const status = browserSnapshotToTabStatus(snapshot);

    return (
        <div data-testid='browser-session-tab' className='d-flex gap-2 align-items-center h-100'>
            <i className='bi bi-database' />
            {session.getFilename()}
            <BrowserTabButton status={status} onClose={() => appCtx.onRemoveBrowser(session.uri)} />
        </div>
    );
};



////////////////////////////////////////////
// Dockview Components: Group tab headers //
////////////////////////////////////////////

export function BrowserTabButton({status, onClose}: {
    status: BrowserTabStatus,
    onClose: () => void
}) {
    return (
        <div className={styles.tabIconSet}>
            <span className={styles.hideOnHover}>
                <BrowserTabStatusIcon status={status} onClose={onClose} />
            </span>
            <span className={styles.showOnHover}>
                <DockviewTabCloseButton variant='hover' onClick={onClose} />
            </span>
        </div>
    )
}

function BrowserTabStatusIcon({ status, onClose }: {
    status: BrowserTabStatus,
    onClose: () => void,
}) {
    const { t } = useTranslation('common');

    switch (status) {
        case 'pending':
            return (
                <Spinner animation='border' role='status' as='span' size='sm'>
                    <span className='visually-hidden'>{t('common.loading')}</span>
                </Spinner>
            );
        case 'active':
            return <DockviewTabCloseButton variant='default' onClick={onClose} />;
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

type BrowserTabStatus = 'pending' | 'active' | 'failed';

function browserSnapshotToTabStatus(snapshot: BrowserSessionSnapshot): BrowserTabStatus {
    switch (snapshot.kind) {
        case 'loading':
            return 'pending';
        case 'failed':
            return 'failed';
        case 'ready':
            switch (snapshot.commandStatus.kind) {
                case 'idle':
                    return 'active';
                case 'running':
                case 'rebuilding-after-cancellation':
                    return 'pending';
                default: { const _n: never = snapshot.commandStatus; return _n; }
            }
        default: { const _n: never = snapshot; return _n; }
    }
}
