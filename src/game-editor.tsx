// React
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

// React-Bootstrap
import { Alert, Button, Card, CloseButton, Form, ListGroup, Table} from 'react-bootstrap';

// classnames
import classNames from 'classnames';

// sql.js
import initSqlJs from 'sql.js';

// monaco
// import * as monaco from 'monaco-editor';
// import { loader } from '@monaco-editor/react';
// import Editor from '@monaco-editor/react';
// loader.config({ monaco });

// react-grid-layout
import GridLayout from "react-grid-layout";
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// react-tabs
import { Tab, TabList, TabPanel, Tabs } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';

// Custom CSS
import './screen.css';


import { StaticDb, RunInitScriptFail, FetchDbFail } from "./sql-js-api";
import { ColInfo, TableInfo } from './schema';
import { assert, getFilenameWithoutExtension, Named, Source } from "./util";
import { GameInstance } from './game-engine-instance';
import { GameInstanceProvider, GameInstanceView } from './game-engine-react';
import { EditorInstance as EditorInstance } from './game-editor-instance';
import { EditorInstanceView, MultiEditorComponentView } from './game-editor-react';
import { BrowserInstance } from './browser-instance';
import { MultiBrowserComponentView } from './browser-react';
import { GameSource } from './game-pure';

export { Game } from './game-pure';



////////////////////////////
// Exported class for use //
////////////////////////////

export class GameEditorComponent {
    private instance: EditorInstance;

    constructor(readonly divId: string, name: string, url: string) {
        this.instance = new EditorInstance(name, { type: 'xml', source: { type: 'fetch', url }});
    }

    init() {
        const div = document.getElementById(this.divId);
        assert(div !== null, `Element with id ${this.divId} not found`);

        const root = createRoot(div);
        root.render(
            <React.StrictMode>
                <div className='eskuel'>
                    <div className='app-game-editor'>
                        <EditorInstanceView instance={this.instance} status={{
                            kind: 'pending'
                        }} />
                    </div>
                </div>
            </React.StrictMode>
        );
    }
}

export class MultiEditorComponent {

    private fileSources: Map<string, Named<GameSource>> = new Map();
    private instances: EditorInstance[] = [];

    constructor(readonly divId: string) { }

    addUrl(url: string) {
        assert(this.fileSources.get(url) === undefined, `File source for url ${url} already exists`);

        const name = getFilenameWithoutExtension(url);

        this.fileSources.set(url, { type: 'xml', source: { type: 'fetch', url }, name });
    }

    openUrl(url: string) {
        const namedGame = this.fileSources.get(url);

        assert(namedGame !== undefined, `File source for url ${url} not found`);

        const newInstance = new EditorInstance(namedGame.name, namedGame);
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
                    <div className='app-game-editor'>
                        <MultiEditorComponentView initialInstances={this.instances} fileSources={fileSourcesList} />
                    </div>
                </div>
            </React.StrictMode>
        );
    }
}