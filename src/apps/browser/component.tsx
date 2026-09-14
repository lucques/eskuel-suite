
// React
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';

// Local
import { BrowserSession } from './session';

import { assertDatabaseCatalog } from '../../catalog';
import { assert } from "../../util";
import { App } from "./App";
import { SettingsProvider } from "../../settings/settings";
import type { BrowserAppOptions } from '../component-options';
import { createDatabaseUrlSource } from '../url-source';
import { initializeAppLanguage } from '../initialize-language';


////////////////////////////
// Exported class for use //
////////////////////////////

/**
 * Provides a pluggable web component. Given a div id, it will render the browser view into the div after calling `init()`.
 */
export class BrowserApp {

    private readonly instances: BrowserSession[];

    constructor(readonly divId: string, private readonly options: BrowserAppOptions = {}) {
        const catalog = this.options.databaseCatalog ?? [];
        assertDatabaseCatalog(catalog);
        const urlInstances = (this.options.initialDatabaseUrls ?? []).map(url => {
            const source = createDatabaseUrlSource(url);
            return new BrowserSession(source.filename, source);
        });
        this.instances = urlInstances;
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
                        initialInstances={this.instances}
                        databaseCatalog={this.options.databaseCatalog}
                        linksCenterLeft={this.options.linksCenterLeft}
                        linksRight={this.options.linksRight}
                    />
                </SettingsProvider>
            </StrictMode>
        );
    }
}
