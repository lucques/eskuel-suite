import React from 'react';
import { createRoot } from 'react-dom/client';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'react-tabs/style/react-tabs.css';
import './screen.css';
import { assert, getFilenameWithoutExtension, Named } from "./util";
import { EditorInstance as EditorInstance } from './game-editor-instance';
import { EditorInstanceView, MultiEditorComponentView } from './game-editor-react';
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

    private fileSources: Named<GameSource>[] = [];
    private instances: EditorInstance[] = [];

    constructor(readonly divId: string) { }

    addUrl(url: string) {
        const name = getFilenameWithoutExtension(url);

        this.fileSources.push({ type: 'xml', source: { type: 'fetch', url }, name });
    }

    addAndOpenUrl(url: string) {
        const name = getFilenameWithoutExtension(url);
        const namedGame: Named<GameSource> = { type: 'xml', source: { type: 'fetch', url }, name };
        const newInstance = new EditorInstance(name, namedGame);

        this.fileSources.push(namedGame);
        this.instances.push(newInstance);
    }

    init() {
        const div = document.getElementById(this.divId);
        assert(div !== null, `Element with id ${this.divId} not found`);

        const root = createRoot(div);
        root.render(
            <React.StrictMode>
                <div className='eskuel'>
                    <div className='app-game-editor'>
                        <MultiEditorComponentView initialInstances={this.instances} fileSources={this.fileSources} />
                    </div>
                </div>
            </React.StrictMode>
        );
    }
}