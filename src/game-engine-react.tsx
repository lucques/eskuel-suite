// React
import React, { ReactComponentElement, ReactElement, ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

// React-Bootstrap
import { Accordion, Alert, Button, Card, CloseButton, Form, InputGroup, ListGroup, OverlayTrigger, Table, Tooltip, TooltipProps} from 'react-bootstrap';

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

// react-syntax-highlighter
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

// Custom CSS
import './screen.css';


import { ParseSchemaFail, SqlResult, SqlResultError, SqlResultSucc } from "./sql-js-api";
import { Schema } from './schema';
import { assert } from "./util";
import { GameInstance, Status } from './game-engine-instance';
import { Game, GameState, GameResult, gameSqlResultHash, GameResultCorrect, GameResultMiss, Scene, SchemaStatus } from './game-pure';
import { ClickableIcon, QueryEditor, ResultTableView, SchemaView, Widget } from './react';

export { Game } from './game-pure';


////////////////////
// Global context //
////////////////////

type GameInstanceContextType = {
    sqlValue:    string;
    setSqlValue: React.Dispatch<React.SetStateAction<string>>;
};
const GameInstanceContext = createContext<GameInstanceContextType>({
    sqlValue: '',
    setSqlValue: () => {}
});
export const GameInstanceProvider = ({ children }: { children: ReactNode }) => {
    const [sqlValue, setSqlValue] = useState('');
    return <GameInstanceContext.Provider value={{ sqlValue, setSqlValue }}>{children}</GameInstanceContext.Provider>;
};
export const useSqlValue = () => useContext(GameInstanceContext);


//////////////////////
// React components //
//////////////////////

export function GameInstanceView({instance}: {instance: GameInstance}) {

    ////////////////
    // Game infos //
    ////////////////

    const [game,      setGame]      = useState<Game      | null>(null);
    const updateGame = () => {
        instance.getGame().then(gameRes => {
            setGame(gameRes.ok ? gameRes.data : null);
        });
    }
    const [gameState, setGameState] = useState<GameState | null>(null);
    const updateGameState = () => {
        instance.getGameState().then(gameStateRes => {
            setGameState(gameStateRes.ok ? gameStateRes.data : null);
        });
    }


    //////////////////////////////////////
    // Explicitly track instance status //
    /////////////////////////////////////

    const [status, setStatus] = useState<Status>(instance.getStatus());
    const updateStatus = () => { setStatus(instance.getStatus()); }


    /////////////
    // Results //
    /////////////

    const [results, setResults] = useState<GameResult[]>([]);
    const resetResults = () => { setResults([]); };
    const addResult = (result: GameResult) => {
        setResults((results) => [result, ...results]);
    }

    const onRemoveResult = (result: GameResult) => {
        setResults(results.filter((r) => gameSqlResultHash(r) !== gameSqlResultHash(result)));
    };


    /////////////////////////////////
    // SQL value from query widget //
    /////////////////////////////////

    // Use from global context
    const { sqlValue, setSqlValue } = useSqlValue();
    const resetSqlValue = () => { setSqlValue(''); };
    const prepareSqlValueForNewScene = () => {
        instance.getGame().then(gameRes => {
            if (!gameRes.ok) { return; }
            instance.getGameState().then(gameStateRes => {
                if (!gameStateRes.ok) { return; }
                const game = gameRes.data;
                const gameState = gameStateRes.data;
                const curScene = game.getCurScene(gameState);
                if (curScene.type === 'select' || curScene.type === 'manipulate') {
                    setSqlValue(curScene.sqlPlaceholder);
                }
                else {
                    resetSqlValue();
                }
            });
        });
    };

    
    ////////////////////////////////
    // Trigger resolution on init //
    ////////////////////////////////

    useEffect(() => {
        updateStatus(); // Show at least "pending"

        instance.resolve().then(() => {
            updateStatus(); // Show "active" or "failed"
            updateGame();
            updateGameState();
            prepareSqlValueForNewScene();
        });
    }, []);


    //////////////////
    // User actions //
    //////////////////

    // We assert here that the game is in status "active"

    const onReset = () => {
        assert(gameState !== null);

        instance.onReset().then(() => {
            updateGameState();
            resetResults();
            prepareSqlValueForNewScene();
        });
    }

    const onNextScene = () => {
        assert(gameState !== null);

        instance.onNextScene().then(() => {
            updateGameState();
            prepareSqlValueForNewScene();
        });
    }

    // SQL query `sqlValue` is taken from global context
    const onSubmitQuery = () => {
        assert(gameState !== null)

        instance.onSubmitQuery(sqlValue).then(r => {
            // Update UI only if correct
            if (r.type === 'correct') {
                resetSqlValue();
                updateGameState();
            }

            // Add result in either case
            addResult(r);
        });
    };

    const onResetDbInCurScene = () => {
        assert(gameState !== null)

        instance.onResetDbInCurScene().then(() => {
        });
    };

    const onShowHint = () => {
        assert(gameState !== null)

        instance.onShowHint().then(r => {
            updateGameState();
            addResult(r);
        });
    };


    ////////////
    // Render //
    ////////////

    const [layout, setLayout] = useState([
        { i: "scene", x: 0, y: 0, w: 5, h: 9 },
        { i: "query", x: 0, y: 9, w: 5, h: 6 },
        { i: "schema", x: 0, y: 15, w: 5, h: 7 },
        { i: "results", x: 5, y: 0, w: 7, h: 22 }
    ]);

    if (status.kind === 'active' && game !== null && gameState !== null) {
        return (
            <div>
                <div className={classNames('game-header')}>
                    <div className={classNames('game-meta-data-view')}>
                        <Card className="game-meta-data-left">
                            <Card.Body>
                                <div className="game-meta-data-title">
                                    <h1>{game.title}</h1>
                                </div>
                                <div className="game-meta-data-sub">
                                    {game.copyright}
                                    <Button onClick={onReset}>Neustart</Button>
                                </div>
                            </Card.Body>
                        </Card>
                        <Card className="game-meta-data-teaser">
                            <Card.Body>
                                {game.teaser}
                            </Card.Body>
                        </Card>
                    </div>
                    <div className={classNames('d-flex', 'align-items-center')}>
                    </div>
                </div>
                <GridLayout
                    autoSize={true}
                    layout={layout}
                    cols={12}
                    rowHeight={30}
                    width={1250}
                    margin={[10, 10]}
                    containerPadding={[0, 0]}
                    draggableHandle=".widget-header"
                >
                    <div key="scene">
                        <SceneWidget game={game} gameState={gameState} onNextScene={onNextScene} />
                    </div>
                    <div key="query">
                        <QueryWidget game={game} s={gameState} onSubmit={onSubmitQuery} onResetDbInCurScene={onResetDbInCurScene} onShowHint={onShowHint} />
                    </div>
                    <div key="schema">
                        <SchemaWidget instance={instance} />
                    </div>
                    <div key="results">
                        <ResultsWidget results={results} onRemoveResult={onRemoveResult} />
                    </div>
                </GridLayout>
            </div>
        );
    }
    else {
        return (
            <StatusView status={status} />
        );
    }
}

function StatusView({status}: {status: Status}) {
    if (status.kind === 'pending') {
        return (
            <Alert className="status-view" variant="info">
                <Alert.Heading>Lade...</Alert.Heading>
            </Alert>
        );
    }
    else if (status.kind === 'failed' && status.error.kind === 'fetch-xml') {
        return (
            <Alert className="status-view" variant="danger">
                <Alert.Heading>Fehler beim Einlesen der Spieldatei</Alert.Heading>
                URL: {status.error.url}
            </Alert>
        );
    }
    else if (status.kind === 'failed' && status.error.kind === 'parse-xml') {
        return (
            <Alert className="status-view" variant="danger">
                <Alert.Heading>Fehler beim Einlesen der Spieldatei</Alert.Heading>
                Fehlermeldung: {status.error.details}
            </Alert>
        );
    }
    else if (status.kind === 'failed' && status.error.kind === 'run-init-script')  {
        return (
            <Alert className="status-view" variant="danger">
                <Alert.Heading>Fehler beim Ausführen des initialen SQL-Skripts</Alert.Heading>
                Fehlermeldung: {status.error.details}
            </Alert>
        );
    }
}

function SceneWidget({game, gameState, onNextScene}: {game: Game, gameState: GameState, onNextScene: () => void}) {
    if (gameState.curSceneIndex >= game.scenes.length) {
        return <p>Ende</p>;
    }
    else {
        const scene = game.scenes[gameState.curSceneIndex];
        return (
            <Widget className={'widget-scene'} title={'Szene ' + (gameState.curSceneIndex+1) + ' / ' + game.scenes.length}>
                {
                    game.isFinished(gameState)
                    ?
                        <SceneView scene={scene} />
                    :
                        <SceneWithNextButtonView scene={scene} nextButtonDisabled={game.isCurSceneUnsolvedTask(gameState)} onNextScene={onNextScene} />
                }
            </Widget>
        );
    }
}

function SceneWithNextButtonView({scene, nextButtonDisabled, onNextScene}: {scene: Scene, nextButtonDisabled: boolean, onNextScene: () => void}) {
    if (scene.type == 'image') {
        return (
            <>
                <div className="text-center">
                    <img src={'data:image/png;base64,' + scene.base64string} alt="" />
                </div>
                <div className="text-center">
                    <Button onClick={onNextScene} disabled={nextButtonDisabled}>Weiter</Button>
                </div>
            </>
        );
    }
    else {
        return (
            <>
                <RenderWithLineBreaks text={scene.text} />
                <div className="text-center">
                    <Button onClick={onNextScene} disabled={nextButtonDisabled}>Weiter</Button>
                </div>
            </>
        );
    }
}

function SceneView({scene}: {scene: Scene}) {
    if (scene.type == 'image') {
        return (
            <div className="text-center">
                <img src={'data:image/png;base64,' + scene.base64string} alt="" />
            </div>
        );
    }
    else {
        return (
            <div>
                <RenderWithLineBreaks text={scene.text} />
            </div>
        );
    }
}

// TODO integrate properly
interface RenderWithLineBreaksProps {
    text: string;
  }
  
  const RenderWithLineBreaks: React.FC<RenderWithLineBreaksProps> = ({ text }) => {
    // Split text on newlines
    const parts = text.split('\n');
  
    return (
      <>
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {part}
            {index !== parts.length - 1 && <br />}
          </React.Fragment>
        ))}
      </>
    );
  };


function QueryWidget({game, s, onSubmit, onResetDbInCurScene, onShowHint}: {game: Game, s: GameState, onSubmit: () => void, onResetDbInCurScene: () => void, onShowHint: () => void}) {
    // Use the SQL value from global context
    const { sqlValue, setSqlValue } = useSqlValue();

    return (
        <Widget className={'widget-query'} title="SQL-Abfrage">
            <QueryEditor sql={sqlValue} setSql={setSqlValue} height={80} disabled={!game.isCurSceneUnsolvedTask(s)} />
            <div className='d-flex justify-content-between col-gap-default'>
                <Button variant="primary" disabled={!game.isCurSceneUnsolvedTask(s)} onClick={() => { onSubmit(); }}>Ausführen</Button>
                <div className='d-flex justify-content-between col-gap-default'>
                    <OverlayTrigger
                        placement="left"
                        delay={{ show: 0, hide: 0 }}
                        overlay={(props: TooltipProps) => (
                            <Tooltip {...props}>Datenbank in aktueller Szene zurücksetzen</Tooltip>
                          )}>
                        <Button variant="primary" disabled={!game.isCurSceneUnsolvedTask(s)} onClick={() => { onResetDbInCurScene(); }}>↺</Button>
                    </OverlayTrigger>
                    <Button variant="primary" disabled={!game.isCurSceneUnsolvedTask(s)} onClick={() => { onShowHint(); }}>Tipp</Button>
                </div>
            </div>
        </Widget>
    );
}

function SchemaWidget({instance}: {instance: GameInstance}) {
    const [schemaStatus, setSchemaStatus] = useState<SchemaStatus>( { kind: 'pending' } );

    // Update the schema status initially
    useEffect(() => {
        setSchemaStatus({ kind: 'pending' });

        instance.getSchema().then((schemaResult) => {
            // Success
            if (schemaResult.ok) {
                setSchemaStatus({ kind: 'loaded', data: schemaResult.data });
            }
            // Failed to parse
            else {
                // Assertion holds because inst status must be "active"
                assert(schemaResult.error.kind === 'parse-schema');

                setSchemaStatus({ kind: 'failed', error: schemaResult.error });
            }
        });
    }, []);

    return (
        <Widget className={'widget-schema'} title={'Schema'}>
            {
                schemaStatus.kind === 'pending' ? (
                    <p className='schema-status'>Lade...</p>
                )
                : schemaStatus.kind === 'failed' ? (
                    <p className='schema-status'>Fehler beim Einlesen des Schemas: {schemaStatus.error.details}</p>
                )
                :
                    <SchemaView schema={schemaStatus.data} />
            }
        </Widget>
    );
}

function ResultsWidget ({ results, onRemoveResult }: {results: GameResult[], onRemoveResult: (result: GameResult) => void }) {
    const resultViews = results.map((result) => {
        const onClose = () => { onRemoveResult(result); }

        return <GameResultView key={gameSqlResultHash(result)} result={result} onClose={onClose} />;
    });

    return (
        <Widget className={'widget-results'} title={'Ergebnisse'}>
            {resultViews}
        </Widget>
    );
}

function GameResultView({result, onClose}: {result: GameResult, onClose: () => void}) {
    if (result.type === 'correct' && result.res.type === 'succ') {
        return <GameResultCorrectSuccView res={result.res} onClose={onClose} />;
    }
    else if (result.type === 'correct' && result.res.type === 'error') {
        return <GameResultCorrectErrorView error={result.res} onClose={onClose} />;
    }
    else if (result.type === 'miss' && result.res.type === 'succ') {
        return <GameResultMissSuccView res={result.res} onClose={onClose} />;
    }
    else if (result.type === 'miss' && result.res.type === 'error') {
        return <GameResultMissErrorView error={result.res} onClose={onClose} />;
    }
    else if (result.type === 'hint-select') {
        return <GameResultHintSelectView expectedResult={result.expectedResult} onClose={onClose} />;
    }
    else if (result.type === 'hint-manipulate') {
        return <GameResultHintManipulateView checkResult={result.checkResult} onClose={onClose} />;
    }
}

function GameResultCorrectSuccView({res, onClose}: {res: SqlResultSucc, onClose: () => void}) {
    return (
        <ListGroup className="result-view">
            <ResultViewHeader bsVariant="success" title={<strong>Gelöst!</strong>} onClose={onClose} />
            <ListGroup.Item className="bg-success bg-opacity-25 border-success">
                <SyntaxHighlighter language="sql">
                    {res.sql}
                </SyntaxHighlighter>
            </ListGroup.Item>
            {res.result.length === 0 ? <ListGroup.Item className='text-center'><em>(Ergebnis enthält keine Zeilen)</em></ListGroup.Item> : null}
            {res.result.map((r, i) => <ResultTableView key={i} result={r} className={'bg-success bg-opacity-25 border-success'} />)}
        </ListGroup>
    );
}

function GameResultCorrectErrorView({error, onClose}: {error: SqlResultError, onClose: () => void}) {
    return (
        <ListGroup className="result-view">
            <ResultViewHeader bsVariant="success" title={<strong>Gelöst!</strong>} onClose={onClose} />
            <ListGroup.Item className="bg-success bg-opacity-25 border-success">
                <SyntaxHighlighter language="sql">
                    {error.sql}
                </SyntaxHighlighter>
            </ListGroup.Item>
            <ListGroup.Item className={classNames('result-view-explanation', 'border-success')}>
                <p className="last-child"><strong>Fehlermeldung:</strong> {error.message}</p>
            </ListGroup.Item>
        </ListGroup>
    );
}

function GameResultMissSuccView({res, onClose}: {res: SqlResultSucc, onClose: () => void}) {
    return (
        <ListGroup className="result-view">
            <ResultViewHeader bsVariant="warning" title={<em>Noch nicht gelöst</em>} onClose={onClose} />
            <ListGroup.Item className="bg-warning bg-opacity-25 border-warning">
                <SyntaxHighlighter language="sql">
                    {res.sql}
                </SyntaxHighlighter>
            </ListGroup.Item>
            {res.result.length === 0 ? <ListGroup.Item className='text-center'><em>(Ergebnis enthält keine Zeilen)</em></ListGroup.Item> : null}
            {res.result.map((r, i) => <ResultTableView key={i} result={r} className={'bg-warning bg-opacity-25 border-warning'} />)}
        </ListGroup>
    );
}

function GameResultMissErrorView({error, onClose}: {error: SqlResultError, onClose: () => void}) {
    return (
        <ListGroup className="result-view">
            <ResultViewHeader bsVariant="danger" title={<em>Noch nicht gelöst</em>} onClose={onClose} />
            <ListGroup.Item className="bg-danger bg-opacity-25 border-danger">
                <SyntaxHighlighter language="sql">
                    {error.sql}
                </SyntaxHighlighter>
            </ListGroup.Item>
            <ListGroup.Item className={classNames('result-view-explanation', 'bg-danger', 'bg-opacity-25', 'border-danger')}>
                <p className="last-child"><strong>Fehlermeldung:</strong> {error.message}</p>
            </ListGroup.Item>
        </ListGroup>
    );
}

function GameResultHintSelectView({expectedResult, onClose}: {expectedResult: SqlResult, onClose: () => void}) {
    if (expectedResult.type === 'succ') {
        return (
            <ListGroup className="result-view">
                <ResultViewHeader bsVariant="info" title={<em>Tipp: Erwartetes Ergebnis:</em>} onClose={onClose} />
                {expectedResult.result.length === 0 ? <ListGroup.Item className='text-center'><em>(Ergebnis enthält keine Zeilen)</em></ListGroup.Item> : null}
                {expectedResult.result.map((r, i) => <ResultTableView key={i} result={r} className={'bg-info bg-opacity-25 border-info'} />)}
            </ListGroup>
        );
    }
    else {
        return (
            <ListGroup className="result-view">
                <ResultViewHeader bsVariant="info" title={<em>Tipp: Erwartetes Ergebnis:</em>} onClose={onClose} />
                <ListGroup.Item className={classNames('result-view-explanation', 'bg-info', 'bg-opacity-25', 'border-info')}>
                    <p className="last-child"><strong>Fehlermeldung:</strong> {expectedResult.message}</p>
                </ListGroup.Item>
            </ListGroup>
        );
    }
}

function GameResultHintManipulateView({checkResult, onClose}: {checkResult: SqlResult, onClose: () => void}) {
    if (checkResult.type === 'succ') {
        return (
            <ListGroup className="result-view">
                <ResultViewHeader bsVariant="info" title={<em>Tipp</em>} onClose={onClose} />
                <ListGroup.Item className="bg-info bg-opacity-25 border-info">
                    <p>
                        Tipp: Die Datenbank muss so manipuliert werden, dass die Abfrage <SyntaxHighlighter language="sql">{checkResult.sql}</SyntaxHighlighter> das folgende Ergebnis liefert:
                    </p>
                </ListGroup.Item>
                {checkResult.result.length === 0 ? <ListGroup.Item className='text-center'><em>(Ergebnis enthält keine Zeilen)</em></ListGroup.Item> : null}
                {checkResult.result.map((r, i) => <ResultTableView key={i} result={r} className={'bg-info bg-opacity-25 border-info'} />)}
            </ListGroup>
        );
    }
    else {
        return (
            <ListGroup className="result-view">
                <ResultViewHeader bsVariant="info" title={<em>Tipp</em>} onClose={onClose} />
                <ListGroup.Item className="bg-info bg-opacity-25 border-info">
                    <p>
                        Tipp: Die Datenbank muss so manipuliert werden, dass die Abfrage <SyntaxHighlighter language="sql">{checkResult.sql}</SyntaxHighlighter> das folgende Ergebnis liefert:
                    </p>
                </ListGroup.Item>
                <ListGroup.Item className={classNames('result-view-explanation', 'bg-info', 'bg-opacity-25', 'border-info')}>
                    <p className="last-child"><strong>Fehlermeldung:</strong> {checkResult.message}</p>
                </ListGroup.Item>
            </ListGroup>
        );
    }
}

function ResultViewHeader({bsVariant, title, onClose}: {bsVariant: string, title: ReactElement, onClose: () => void}) {
    return (
        <ListGroup.Item className={classNames('result-view-header', 'd-flex', 'justify-content-between', 'align-items-start', 'bg-'+bsVariant, 'bg-opacity-50', 'border-'+bsVariant)}>
            <p>{title}</p>
            <ClickableIcon onClick={onClose} type={'close'} disabled={false} />
        </ListGroup.Item>
    );
}