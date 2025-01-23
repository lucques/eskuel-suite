import React from 'react';
import { createRoot } from 'react-dom/client';
import { assert } from "./util";
import { GameInstance } from './game-engine-instance';
import { GameInstanceProvider, GameInstanceView } from './game-engine-react';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'react-tabs/style/react-tabs.css';
import './screen.css';

export { Game } from './game-pure';


////////////////////////////
// Exported class for use //
////////////////////////////

export class GameComponent {
    private instance: GameInstance;

    constructor(readonly divId: string, url: string) {
        this.instance = new GameInstance({ type: 'xml', source: { type: 'fetch', url } });
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