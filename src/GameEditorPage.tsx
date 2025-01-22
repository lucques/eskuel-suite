import React from 'react';
import { MultiEditorComponentView } from './game-editor-react';
import { GameSource } from './game-pure';
import { getFilenameWithoutExtension, Named } from './util';

function GameEditorPage() {

    const fileSources: Named<GameSource>[] = [];

    const addUrl = (url: string) => {
        const name = getFilenameWithoutExtension(url);

        fileSources.push({ type: 'xml', source: { type: 'fetch', url }, name });
    }

    addUrl('./res/games/baufirma/baufirma.xml');
    addUrl('./res/games/jack-frost/jack-frost.xml');
    addUrl('./res/games/ozean/ozean.xml');
    addUrl('./res/games/island/island.xml');
    addUrl('./res/games/sql-jungle/sql-jungle.xml');

    return (
        <div className="p-4">
            <div className='eskuel'>
                <div className='app-browser'>
                    <MultiEditorComponentView fileSources={fileSources} initialInstances={[]}/>
                </div>
            </div>
        </div>
    );
  }

export default GameEditorPage;
