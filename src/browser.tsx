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

    private fileSources: Named<DbSource>[] = [];
    private instances: BrowserInstance[] = [];

    constructor(readonly divId: string) { }

    addUrl(url: string) {
        this.fileSources.push(makeNamedDbSource(url));
    }

    addAndOpenUrl(url: string) {
        const namedDbSource = makeNamedDbSource(url);
        const newInstance = new BrowserInstance(namedDbSource.name, namedDbSource);

        this.fileSources.push(namedDbSource);
        this.instances.push(newInstance);
    }

    init() {
        const div = document.getElementById(this.divId);
        assert(div !== null, `Element with id ${this.divId} not found`);

        const root = createRoot(div);
        root.render(
            <React.StrictMode>
                <div className='eskuel'>
                    <div className='app-browser'>
                        <MultiBrowserComponentView initialInstances={this.instances} fileSources={this.fileSources} />
                    </div>
                </div>
            </React.StrictMode>
        );
    }
}