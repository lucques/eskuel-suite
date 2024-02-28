// React
import { createRoot } from 'react-dom/client';
import React from 'react';

// Local
import { BrowserInstance } from './browser-instance';
import { MultiBrowserComponentView } from './browser-react';

import { NamedFileSource, assert, getFilenameWithoutExtension } from "./util";


////////////////////////////
// Exported class for use //
////////////////////////////

/**
 * Provides a pluggable web component. Given a div id, it will render the browser view into the div after calling `init()`.
 */
export class MultiBrowserComponent {

    private fileSources: NamedFileSource[] = [];
    private instances: BrowserInstance[] = [];

    constructor(readonly divId: string) { }

    addUrl(url: string) {
        const name = getFilenameWithoutExtension(url);

        this.fileSources.push({ type: 'fetch', url, name });
    }

    addAndOpenUrl(url: string) {
        const name = getFilenameWithoutExtension(url);
        const db = new BrowserInstance(name, {
            type: 'fetch',
            url: url
        });

        this.fileSources.push({ type: 'fetch', url, name });
        this.instances.push(db);
    }

    init() {
        const div = document.getElementById(this.divId);
        assert(div !== null, `Element with id ${this.divId} not found`);

        const root = createRoot(div);
        root.render(
            <React.StrictMode>
                <div className='eskuel app-browser'>
                    <MultiBrowserComponentView initialInstances={this.instances} fileSources={this.fileSources} />
                </div>
            </React.StrictMode>
        );
    }
}