import React from 'react';
import { MultiBrowserComponentView } from './browser-react';
import { DbSource, makeNamedDbSource } from './sql-js-api';
import { BrowserInstance } from './browser-instance';
import { Named } from './util';

function BrowserPage() {

    const fileSources: Named<DbSource>[] = [];
    const instances: BrowserInstance[] = [];

    const addUrl = (url: string) => {
        fileSources.push(makeNamedDbSource(url));
    }

    const addAndOpenUrl = (url: string) => {
        const namedDbSource = makeNamedDbSource(url);
        const newInstance = new BrowserInstance(namedDbSource.name, namedDbSource);

        fileSources.push(namedDbSource);
        instances.push(newInstance);
    }

    addAndOpenUrl('./res/dbs/fahrschule.sql');
    addAndOpenUrl('./res/dbs/onlineshop.sql');

    addUrl('./res/dbs/eisdiele.sql');
    addUrl('./res/dbs/obst-gemuese.sql');
    addUrl('./res/dbs/cafe.sql');
    addUrl('./res/dbs/cafe-sqlite.db');
    addUrl('./res/dbs/pizzeria-mit-redundanz.sql');
    addUrl('./res/games/baufirma/baufirma.sql');
    addUrl('./res/games/island/island.sql');
    addUrl('./res/games/jack-frost/jack-frost.sql');
    addUrl('./res/games/ozean/ozean.sql');
    addUrl('./res/games/sql-jungle/sql-jungle.sql');
    
    return (
        <div className="p-4">
            <div className='eskuel'>
                <div className='app-browser'>
                    <MultiBrowserComponentView initialInstances={instances} fileSources={fileSources} />
                </div>
            </div>
        </div>
    );
  }

export default BrowserPage;
  
