import React from 'react';
import { GameConsoleView } from './console-react';
import { getFilenameWithoutExtension, Named } from './util';
import { makeNamedDbSource } from './sql-js-api';
import { GameSource } from './game-pure';

function GameConsolePage() {

    const fileSources: Named<GameSource>[] = [];

    const addUrl = (url: string): void => {
        const name = getFilenameWithoutExtension(url);

        fileSources.push({ type: 'xml', source: { type: 'fetch', url}, name });
    }

    addUrl('./res/games/baufirma/baufirma.xml');
    addUrl('./res/games/jack-frost/jack-frost.xml');
    addUrl('./res/games/ozean/ozean.xml');
    addUrl('./res/games/island/island.xml');
    addUrl('./res/games/island-dev/island-dev.xml');
    addUrl('./res/games/sql-jungle/sql-jungle.xml');

    return (
        <div className="p-4">
            <div className='eskuel'>
                <div className='app-browser'>
                    <GameConsoleView fileSources={fileSources}/>
                </div>
            </div>
        </div>
    );
  }

export default GameConsolePage;
