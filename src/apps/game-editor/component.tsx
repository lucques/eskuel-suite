import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { assertGameCatalog } from '../../catalog';
import { SettingsProvider } from '../../settings/settings';
import { assert } from '../../util';
import { App } from './App';
import type { GameEditorSession } from './session';
import { createWebBrowserGameEditorSession } from '../../platform/webbrowser/create-game-editor-session';
import type { GameEditorAppOptions } from '../component-options';
import { createIndexedDBGameDocumentDraftStore } from './draft-store';
import { AppWithPersistence } from './AppWithPersistence';
import { createGameUrlSource } from '../url-source';
import { initializeAppLanguage } from '../initialize-language';

export { Game } from '../../game/model';

export class GameEditorApp {
    private readonly sessions: GameEditorSession[];

    constructor(readonly divId: string, private readonly options: GameEditorAppOptions = {}) {
        const catalog = this.options.gameCatalog ?? [];
        assertGameCatalog(catalog);
        const urlSessions = (this.options.initialGameUrls ?? []).map(url => {
            const source = createGameUrlSource(url);
            return createWebBrowserGameEditorSession(source.filename, source);
        });
        this.sessions = urlSessions;
    }

    init(): Promise<void> {
        return renderEditor(this.divId, this.sessions, this.options);
    }
}

async function renderEditor(
    divId: string,
    initialSessions: GameEditorSession[],
    options: GameEditorAppOptions,
): Promise<void> {
    const div = document.getElementById(divId);
    assert(div !== null, `Element with id ${divId} not found`);

    await initializeAppLanguage(options.initialLanguage);
    const app = options.persistGameDrafts === true && typeof window.indexedDB !== 'undefined'
        ? <AppWithPersistence
            initialSessions={initialSessions}
            gameCatalog={options.gameCatalog}
            linksCenterLeft={options.linksCenterLeft}
            linksRight={options.linksRight}
            draftStore={createIndexedDBGameDocumentDraftStore()}
        />
        : <App
            initialSessions={initialSessions}
            gameCatalog={options.gameCatalog}
            linksCenterLeft={options.linksCenterLeft}
            linksRight={options.linksRight}
        />;

    createRoot(div).render(
        <StrictMode>
            <SettingsProvider onLanguageChange={options.onLanguageChange}>
                {app}
            </SettingsProvider>
        </StrictMode>
    );
}
