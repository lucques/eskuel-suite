import 'bootstrap-icons/font/bootstrap-icons.css';
import type { GameCatalogEntry } from '../../catalog';
import { assert } from '../../util';
import type { WithFilename } from '../../util';
import type { GameSource } from '../../game/loader';
import { useEffect, useRef, useState } from 'react';
import type { GameConsoleSession } from './session';
import { IconActionButton } from '../../gui-helpers/icon-button/IconActionButton';
import { OpenGameGameSourceModal as OpenGameSourceModal, type OpenGameSourceHandle } from '../../gui-helpers/open-modal/OpenGameGameSourceModal';
import { useTranslation } from 'react-i18next';
import { Topbar, TopbarActionsLeft, TopbarActionsRight, TopbarLinksRight, TopbarTitle } from '../../gui-helpers/topbar/Topbar';
import { ButtonGroup } from 'react-bootstrap';
import { DarkModeToggle } from '../../gui-helpers/dark-mode-toggle/DarkModeToggle';
import { LanguageSwitcher } from '../../gui-helpers/language-switcher/LanguageSwitcher';
import styles from '../../screen.module.css';
import { ConfirmLeaveModal } from '../../gui-helpers/confirm-leave-modal/ConfirmLeaveModal';
import { AppThemeScope } from '../../gui-helpers/app-theme/AppTheme';
import { LayoutSwitcher, type LayoutOption } from '../../gui-helpers/layout-switcher/LayoutSwitcher';
import type { GameConsoleViewHandle } from './handle';
import type { GameConsoleViewLayout } from './layout';
import { createWebBrowserGameSession } from '../../platform/webbrowser/create-game-session';
import { createGameCheckpointStore } from './checkpoint';
import type { GameCheckpointStore } from './checkpoint';
import { GameConsoleView } from './GameConsoleView';
import { GameConsoleViewWithPersistence } from './GameConsoleViewWithPersistence';
import type { LocalizedLink } from '../component-options';
import { LocalizedNavigationLinks } from '../LocalizedNavigationLinks';

/////////////////////
// React component //
/////////////////////

export function App({
    gameCatalog = [],
    initialFileSource = undefined,
    initiallySkipFirstScenes = undefined,
    linksCenterLeft = undefined,
    linksRight = undefined,
    checkpointStore = undefined,
    persistGameProgress = true,
}: {
    gameCatalog?: readonly GameCatalogEntry[],
    initialFileSource?: WithFilename<GameSource>,
    initiallySkipFirstScenes?: number,
    linksCenterLeft?: readonly LocalizedLink[],
    linksRight?: readonly LocalizedLink[],
    checkpointStore?: GameCheckpointStore,
    persistGameProgress?: boolean,
}) {
    const { t } = useTranslation('game-console');
    const { t: tc, i18n } = useTranslation('common');
    const gameConsoleDockLayoutOptions = [
        { value: 'desktop', label: <span className='d-inline-flex align-items-center gap-2'><i className='bi bi-window-desktop' />{tc('layout.desktop')}</span> },
        { value: 'mobile', label: <span className='d-inline-flex align-items-center gap-2'><i className='bi bi-phone' />{tc('layout.mobile')}</span> },
    ] satisfies readonly LayoutOption<GameConsoleViewLayout>[];
    const activeLanguage = i18n.resolvedLanguage ?? i18n.language;
    
    ///////////
    // State //
    ///////////

    const [store] = useState<GameCheckpointStore | null>(() => persistGameProgress
        ? checkpointStore ?? createBrowserGameCheckpointStore()
        : null);
    const [activeGame, setActiveGame] = useState<ActiveGame | null>(() => createInitialActiveGame(
        initialFileSource,
        initiallySkipFirstScenes,
    ));
    const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(null);


    ////////////////
    // References //
    ////////////////

    const gameConsoleViewHandleRef = useRef<GameConsoleViewHandle>(null);
    const openGameSourceRef = useRef<OpenGameSourceHandle>(null);
    const sessionLifecycleRef = useRef<{ session: GameConsoleSession, generation: number } | null>(null);
    const sessionGenerationRef = useRef(0);

    useEffect(() => {
        if (activeGame === null) {
            sessionLifecycleRef.current = null;
            return undefined;
        }
        else {
            const session = activeGame.session;
            const generation = ++sessionGenerationRef.current;
            sessionLifecycleRef.current = { session, generation };
            return () => {
                queueMicrotask(() => {
                    const current = sessionLifecycleRef.current;
                    if (current === null || current.session !== session || current.generation === generation) {
                        session.dispose();
                    }
                });
            };
        }
    }, [activeGame]);

    const onSelectGameConsoleViewLayout = (layout: GameConsoleViewLayout) => {
        gameConsoleViewHandleRef.current?.applyLayout(layout);
    };

    ////////////////////////
    // State manipulation //
    ////////////////////////

    const onSelectGame = (source: GameSource) => {
        activeGame?.session.dispose();
        setActiveGame(createActiveGame(source));
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
        <AppThemeScope theme='game-console' className={styles.root}>
            {
                /////////////
                // Top bar //
                /////////////
            }
            <Topbar>
                <TopbarTitle>
                    <span className='text-body'>{t('title')}</span>
                </TopbarTitle>
                <TopbarActionsLeft>
                    <div className='d-flex align-items-center gap-1'>
                        <IconActionButton onClick={() => openGameSourceRef.current?.open()} disabled={false} tooltipText={tc('button.open_game')} variant='primary-subtle' compactSize='sm'>
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
                            layouts={gameConsoleDockLayoutOptions}
                            onSelect={onSelectGameConsoleViewLayout}
                            id='game-console-layout-switcher'
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
                // Game //
                //////////
            }
            {
                activeGame === null
                ?
                    <div className={styles.contentArea}>
                        <div className='d-inline-flex gap-2 p-3'>
                            <span>{t('no_game_opened')}</span>
                        </div>
                    </div>
                :
                    <div className={styles.contentArea}>
                        {store === null
                            ? <GameConsoleView
                                key={activeGame.session.sqlEditorURI}
                                ref={gameConsoleViewHandleRef}
                                session={activeGame.session}
                            />
                            : <GameConsoleViewWithPersistence
                                key={activeGame.session.sqlEditorURI}
                                ref={gameConsoleViewHandleRef}
                                session={activeGame.session}
                                source={activeGame.source}
                                checkpointStore={store}
                                baseUrl={getCurrentPageUrl()}
                            />}
                    </div>
            }
            {
                ////////////
                // Modals //
                ////////////
            }
            <OpenGameSourceModal
                ref={openGameSourceRef}
                gameCatalog={gameCatalog}
                onOpenFile={onSelectGame}
            />
            <ConfirmLeaveModal
                show={pendingNavigationUrl !== null}
                onHide={onLeaveAppCancel}
                onConfirm={onLeaveAppConfirm}
                body={t('confirm_leave_body')}
            />
        </AppThemeScope>
    );
}

type ActiveGame = {
    source: GameSource,
    session: GameConsoleSession,
};

function createInitialActiveGame(
    initialFileSource: WithFilename<GameSource> | undefined,
    initiallySkipFirstScenes: number | undefined,
): ActiveGame | null {
    if (initialFileSource !== undefined) {
        return createActiveGame(initialFileSource, initiallySkipFirstScenes);
    }
    else {
        return null;
    }
}

function createActiveGame(
    source: GameSource,
    initiallySkipFirstScenes?: number,
): ActiveGame {
    return {
        source,
        session: createWebBrowserGameSession(source, initiallySkipFirstScenes),
    };
}

function createBrowserGameCheckpointStore(): GameCheckpointStore {
    if (typeof window === 'undefined') {
        return createGameCheckpointStore();
    }
    else {
        try {
            return createGameCheckpointStore(window.localStorage);
        }
        catch (error: unknown) {
            console.error('Failed to initialize SQL game checkpoint storage:', error);
            return createGameCheckpointStore();
        }
    }
}

function getCurrentPageUrl(): string {
    return typeof window === 'undefined' ? 'http://localhost/' : window.location.href;
}
