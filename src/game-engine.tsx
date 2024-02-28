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

// react-syntax-highlighter
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

// Custom CSS
import './screen.css';


import { StaticDb, RunInitScriptFail, FetchInitScriptFail } from "./sql-js-api";
import { ColInfo, TableInfo } from './schema';
import { NamedFileSource, assert, getFilenameWithoutExtension } from "./util";
import { GameInstance } from './game-engine-instance';
import { GameInstanceProvider, GameInstanceView } from './game-engine-react';
import { GameConsoleView } from './console-react';

export { Game } from './game-pure';



////////////////////////////
// Exported class for use //
////////////////////////////

export class GameConsoleComponent {

    private fileSources: NamedFileSource[] = [];
    private initialFileSource: NamedFileSource | null = null;

    constructor(readonly divId: string, url?: string) {
        if (url !== undefined && url !== null) {
            this.initialFileSource = { type: 'fetch', url, name: getFilenameWithoutExtension(url) };
        }
    }

    addUrl(url: string) {
        const name = getFilenameWithoutExtension(url);

        this.fileSources.push({ type: 'fetch', url, name });
    }

    init() {
        const div = document.getElementById(this.divId);
        assert(div !== null, `Element with id ${this.divId} not found`);

        const root = createRoot(div);
        root.render(
            <React.StrictMode>
                <div className='eskuel app-game-console'>
                    <GameConsoleView fileSources={this.fileSources} initialFileSource={this.initialFileSource} />
                </div>
            </React.StrictMode>
        );
    }
}

export class GameComponent {
    private instance: GameInstance;

    constructor(readonly divId: string, url: string, skipFirstScenes: number) {
        this.instance = new GameInstance({ type: 'fetch', url });
        this.instance.onSkipMultipleScenes(skipFirstScenes);
    }

    init() {
        const div = document.getElementById(this.divId);
        assert(div !== null, `Element with id ${this.divId} not found`);

        const root = createRoot(div);
        root.render(
            <React.StrictMode>
                <div className='eskuel app-game-console'>
                    <GameInstanceProvider>
                        <GameInstanceView instance={this.instance} />
                    </GameInstanceProvider>
                </div>
            </React.StrictMode>
        );
    }
}