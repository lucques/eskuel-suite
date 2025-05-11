// React
import { createRoot } from 'react-dom/client';
import React from 'react';

// Local
import { BrowserInstance } from './browser-instance';
import { MultiBrowserComponentView } from './browser-react';

import { assert, getFilenameExtension, getFilenameWithoutExtension, Named } from "./util";
import { DbSource, makeNamedDbSource } from './sql-js-api';


////////////////////////////
// Exported class for use //
////////////////////////////

/**
 * Provides a pluggable web component. Given a div id, it will render the browser view into the div after calling `init()`.
 */
export class MultiBrowserComponent {

    private fileSources: Map<string, Named<DbSource>> = new Map();
    private instances: BrowserInstance[] = [];

    constructor(readonly divId: string) { }

    addUrl(url: string) {
        assert(this.fileSources.get(url) === undefined, `File source for url ${url} already exists`);

        this.fileSources.set(url, makeNamedDbSource(url));
    }

    openUrl(url: string) {
        const namedDbSource = this.fileSources.get(url);

        assert(namedDbSource !== undefined, `File source for url ${url} not found`);

        const newInstance = new BrowserInstance(namedDbSource.name, namedDbSource);
        this.instances.push(newInstance);
    }

    addAndOpenUrl(url: string) {
        this.addUrl(url);
        this.openUrl(url);
    }

    init() {
        const div = document.getElementById(this.divId);
        assert(div !== null, `Element with id ${this.divId} not found`);

        const fileSourcesList = Array.from(this.fileSources.values());

        const root = createRoot(div);
        root.render(
            <React.StrictMode>
                <div className='eskuel'>
                    <div className='app-browser'>
                        <MultiBrowserComponentView initialInstances={this.instances} fileSources={fileSourcesList} />
                    </div>
                </div>
            </React.StrictMode>
        );
    }
}