// React
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { assertGameCatalog } from '../../catalog';
import { assert, type WithFilename } from '../../util';
import { App } from './App';
import type { GameSource } from '../../game/loader';
import { SettingsProvider } from '../../settings/settings';
import type { GameConsoleAppOptions } from '../component-options';
import { createGameUrlSource } from '../url-source';
import { initializeAppLanguage } from '../initialize-language';

export { Game } from '../../game/model';



////////////////////////////
// Exported class for use //
////////////////////////////

export class GameConsoleApp {

    private readonly initialFileSource: WithFilename<GameSource> | undefined;

    constructor(
        readonly divId: string,
        private readonly options: GameConsoleAppOptions = {},
    ) {
        const catalog = this.options.gameCatalog ?? [];
        assertGameCatalog(catalog);
        if (this.options.initialGameUrl !== undefined) {
            this.initialFileSource = createGameUrlSource(this.options.initialGameUrl);
        }
        else {
            this.initialFileSource = undefined;
        }
    }

    async init(): Promise<void> {
        const div = document.getElementById(this.divId);
        assert(div !== null, `Element with id ${this.divId} not found`);

        await initializeAppLanguage(this.options.initialLanguage);
        const root = createRoot(div);
        root.render(
            <StrictMode>
                <SettingsProvider onLanguageChange={this.options.onLanguageChange}>
                    <App
                        gameCatalog={this.options.gameCatalog}
                        initialFileSource={this.initialFileSource}
                        initiallySkipFirstScenes={this.options.initiallySkipFirstScenes}
                        linksCenterLeft={this.options.linksCenterLeft}
                        linksRight={this.options.linksRight}
                        persistGameProgress={this.options.persistGameProgress}
                    />
                </SettingsProvider>
            </StrictMode>
        );
    }
}
