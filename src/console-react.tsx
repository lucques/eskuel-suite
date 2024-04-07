// React
import React, { ReactComponentElement, ReactElement, ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

// React-Bootstrap
import { Accordion, Alert, Button, Card, CloseButton, Form, InputGroup, ListGroup, Modal, OverlayTrigger, Table, Tooltip, TooltipProps} from 'react-bootstrap';

// classnames
import classNames from 'classnames';

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


import { ParseSchemaFail, SqlResult, SqlResultError, SqlResultSucc } from "./sql-js-api";
import { Schema } from './schema';
import { FileSource, NamedFileSource, assert } from "./util";
import { GameInstance, Status } from './game-engine-instance';
import { Game, GameState, GameResult, gameSqlResultHash, GameResultCorrect, GameResultMiss, Scene } from './game-pure';
import { ClickableIcon, IconActionButton, IconLinkButton, OpenFileModal, ResultTableView, Widget } from './react';
import { GameInstanceProvider, GameInstanceView } from './game-engine-react';

export { Game } from './game-pure';


//////////////////////
// React components //
//////////////////////

export function GameConsoleView({fileSources, initialFileSource = undefined, initiallySkipFirstScenes = undefined}: {fileSources: NamedFileSource[], initialFileSource?: NamedFileSource, initiallySkipFirstScenes?: number}) {
    
    const [instance, setInstance] = useState<GameInstance | null>(null);

    useEffect(() => {
        // Initialize console with game?
        if (initialFileSource !== undefined) {
            setInstance(new GameInstance(initialFileSource, initiallySkipFirstScenes));
        }
    }, []);

    const onSelectGame = (source: FileSource) => {
        setInstance(new GameInstance(source));
    }

    return (
        <>
            <GameConsoleHeaderView fileSources={fileSources} onSelectGame={onSelectGame} />
            {
                instance === null
                ?
                    <p>Klicke auf 📂, um ein Spiel zu öffnen.</p>
                :
                    <GameInstanceProvider key={instance.id}>
                        <GameInstanceView instance={instance} />
                    </GameInstanceProvider>
            }
        </>
    );
}

function GameConsoleHeaderView({fileSources, onSelectGame}: {fileSources: NamedFileSource[], onSelectGame: (source: FileSource) => void}) {

    const [showOpenModal, setShowOpenModal ] = useState(false);

    return (
        <>
            <div className="header">
                <ul className="header-meta list-group list-group-horizontal">
                    <li className="header-name list-group-item"><strong>SQL-Spielekonsole</strong></li>
                    <li className="header-toolbox list-group-item flex-fill">
                        <IconActionButton type='open' onClick={() => setShowOpenModal(true)} disabled={false} />
                    </li>
                    <li className="header-home list-group-item">
                        <IconLinkButton type='home' href="../" />
                    </li>
                </ul>
                <OpenFileModal title="Spiel laden" fileUploadTitle='Spieldatei hochladen' fileIconType='file-xml' fileAccept='.xml' providedFileSources={fileSources} show={showOpenModal} setShow={setShowOpenModal} onOpenFile={onSelectGame} />
            </div>
        </>
    );
}


