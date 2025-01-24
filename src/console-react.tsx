import React, { useEffect, useState } from 'react';
import { Named } from "./util";
import { GameInstance } from './game-engine-instance';
import { GameSource } from './game-pure';
import { Icon, IconActionButton, IconLinkButton, OpenGameSourceModal } from './react';
import { GameInstanceProvider, GameInstanceView } from './game-engine-react';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'react-tabs/style/react-tabs.css';
import './screen.css';

export { Game } from './game-pure';


//////////////////////
// React components //
//////////////////////

export function GameConsoleView({fileSources, initialFileSource = undefined, initiallySkipFirstScenes = undefined}: {fileSources: Named<GameSource>[], initialFileSource?: Named<GameSource>, initiallySkipFirstScenes?: number}) {
    
    const [instance, setInstance] = useState<GameInstance | null>(null);

    useEffect(() => {
        // Initialize console with game?
        if (initialFileSource !== undefined) {
            setInstance(new GameInstance(initialFileSource, initiallySkipFirstScenes));
        }
    }, []);

    const onSelectGame = (source: GameSource) => {
        setInstance(new GameInstance(source));
    }

    return (
        <>
            <GameConsoleHeaderView fileSources={fileSources} onSelectGame={onSelectGame} />
            {
                instance === null
                ?
                    <p>Klicke auf <Icon type='open' size={15} />, um ein Spiel zu öffnen.</p>
                :
                    <GameInstanceProvider key={instance.id}>
                        <GameInstanceView instance={instance} />
                    </GameInstanceProvider>
            }
        </>
    );
}

function GameConsoleHeaderView({fileSources, onSelectGame}: {fileSources: Named<GameSource>[], onSelectGame: (source: GameSource) => void}) {

    const [showOpenModal, setShowOpenModal ] = useState(false);

    return (
        <>
            <div className="header">
                <ul className="header-meta list-group list-group-horizontal">
                    <li className="header-name list-group-item"><strong>SQL-Spielekonsole</strong></li>
                    <li className="header-toolbox list-group-item flex-fill">
                        <IconActionButton type='open' onClick={() => setShowOpenModal(true)} disabled={false} tooltipText='Spiel öffnen' />
                    </li>
                    <li className="header-home list-group-item">
                        <IconLinkButton type='home' href="../" tooltipText='Hauptmenü' />
                    </li>
                </ul>
                <OpenGameSourceModal
                    providedFileSources={fileSources}
                    onOpenFile={onSelectGame}
                    show={showOpenModal}
                    setShow={setShowOpenModal}
                />
            </div>
        </>
    );
}
