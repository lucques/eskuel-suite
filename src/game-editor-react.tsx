// React
import React, { ReactComponentElement, ReactElement, ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

// React-Bootstrap
import { Alert, Button, Card, CloseButton, Form, InputGroup, ListGroup, Modal, OverlayTrigger, Table, Tooltip, TooltipProps} from 'react-bootstrap';

// classnames
import classNames from 'classnames';

// react-grid-layout
import GridLayout from "react-grid-layout";
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// react-beaturiful-dnd
import { DragDropContext, Draggable, DraggableProvidedDraggableProps, DropResult } from "react-beautiful-dnd";
import { StrictModeDroppable } from "./hacks";

// react-tabs
import { Tab, TabList, TabPanel, Tabs } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';

// react-syntax-highlighter
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

// Custom CSS
import './screen.css';


import { ParseSchemaFail, RunInitScriptFail, SqlResult, SqlResultError, SqlResultSucc } from "./sql-js-api";
import { Schema } from './schema';
import { NamedFileSource, assert, reorder } from "./util";
import { GameInstance, Status } from './game-engine-instance';
import { Game, GameState, GameResult, gameSqlResultHash, GameResultCorrect, GameResultMiss, Scene, TextScene, SelectScene, ManipulateScene, gameToXML } from './game-pure';
import { ClickableIcon, IconActionButton, IconLinkButton, OpenModal, ResultTableView, TableInfoView, Widget } from './react';
import { EditorInstance } from './game-editor-instance';
import { BrowserInstance } from './browser-instance';
import { EditDbModal } from './browser-react';

export { Game } from './game-pure';


///////////////////
// Wrapper types //
///////////////////

type EditableTextScene = TextScene & { key: string };
type EditableSelectScene = SelectScene & { key: string };
type EditableManipulateScene = ManipulateScene & { key: string };
type EditableScene = EditableTextScene | EditableSelectScene | EditableManipulateScene;

let nextEditableSceneKey = 0;
function createEditableScene(scene: Scene): EditableScene {
    return { ...scene, key: (nextEditableSceneKey++).toString() };
}


////////////////////
// Global context //
////////////////////

type EditorInstanceContextType = {
    sqlValue:    string;
    setSqlValue: React.Dispatch<React.SetStateAction<string>>;
};
const EditorInstanceContext = createContext<EditorInstanceContextType>({
    sqlValue: '',
    setSqlValue: () => {}
});
export const EditorInstanceProvider = ({ children }: { children: ReactNode }) => {
    const [sqlValue, setSqlValue] = useState('');
    return <EditorInstanceContext.Provider value={{ sqlValue, setSqlValue }}>{children}</EditorInstanceContext.Provider>;
};
export const useSqlValue = () => useContext(EditorInstanceContext);


//////////////////////
// React components //
//////////////////////

export function MultiEditorComponentView({initialInstances, fileSources}: {initialInstances: EditorInstance[], fileSources: NamedFileSource[]}) {

    const [instances, setInstances] = useState(initialInstances);


    ///////////////////
    // View instance //
    ///////////////////

    /**
     * Index of the currently viewed instance in `instances` or `null` if no db is viewed
     */
    const [viewedInstanceIndex, setViewedInstanceIndex] = useState<number | null>(initialInstances.length > 0 ? 0 : null);
    /**
     * This is a workaround: This counter is used to force re-rendering of the currently viewed instance.
     * It should always be called together with `setViewedInstanceIndex`.
     * 
     * TODO: Replace `viewedInstanceIndex` with a solution based on useReducer?
     */
    const [viewedInstanceCounter, setViewedInstanceCounter] = useState(0);
    const viewedInstanceIndexChanged = () => setViewedInstanceCounter(viewedInstanceCounter + 1);


    //////////////////////////////////////
    // Explicitly track instance status //
    //////////////////////////////////////

    const [status, setStatus] = useState<Status[]>(instances.map((inst: EditorInstance) => inst.getStatus()));
    const updateStatus = () => { setStatus(instances.map((inst: EditorInstance) => inst.getStatus())); }
    const updateStatusForSingle = (index: number) => {
        setStatus((status) => {
            const newStatus = [...status];
            newStatus[index] = instances[index].getStatus();
            return newStatus;
        });
    };

    useEffect(() => {
        updateStatus();
    }, [instances]);

    useEffect(() => {
        if (viewedInstanceIndex !== null) {
            // Show at least "pending"
            updateStatusForSingle(viewedInstanceIndex);

            // Resolve and...
            instances[viewedInstanceIndex!].resolve().then((_) => {
                // ...show "succ" or "fail"
                updateStatusForSingle(viewedInstanceIndex);
            });
        }
    }, [viewedInstanceIndex, viewedInstanceCounter]);
    // The `viewedInstanceCounter` is used to force re-rendering of the currently viewed inst (see also above)


    //////////////////
    // Add instance //
    //////////////////

    const onAddInstance = (source: NamedFileSource) => {
        const newInstance = new EditorInstance(source.name, source);
        const newIndex = instances.length;

        // Update instances
        setInstances([...instances, newInstance]);

        // Jump to new instance
        setViewedInstanceIndex(newIndex);
    }


    /////////////////////
    // Remove instance //
    /////////////////////

    const onRemoveInstance = (index: number) => {
        const newInstances = instances.filter((_, i) => i !== index);

        // Update instances
        setInstances(instances.filter((_, i) => i !== index));

        // Select instance at next position
        setViewedInstanceIndex(index < newInstances.length ? index : index > 0 ? index-1 : null);
        viewedInstanceIndexChanged(); // Force re-rendering of the currently viewed instance (part of the above-described hack)
    };


    /////////////////////
    // Download as XML //
    /////////////////////

    const onSave = (index: number) => {
        const inst = instances[index];

        inst.getGame().then(gameRes => {
            if (gameRes.ok) {
                const game = gameRes.data;
                const xml = gameToXML(game);

                // Convert the XML string to a Blob
                const blob = new Blob([xml], { type: 'application/xml' });

                // Create a URL for the Blob
                const url = URL.createObjectURL(blob);
            
                // Create a temporary link to trigger the download
                const link = document.createElement('a');
                link.href = url;
                link.download = inst.getName() + '.xml'; // Name of the file to be downloaded  //TODO
                document.body.appendChild(link); // Append the link to the document
                link.click(); // Trigger the download
            
                // Cleanup: remove the link and revoke the Blob URL
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        });
    };


    ////////////
    // Render //
    ////////////

    // Tab buttons
    const tabs = instances.map((instance, index) => {
        return (
            <Tab key={instance.id}>
                {instance.getName()}
                <ClickableIcon type='close' onClick={() => { onRemoveInstance(index); } } disabled={false} />
            </Tab>
        )
    });

    // Tab panels
    const panels = instances.map((instance) => {
        const status = instance.getStatus();
        return (
            <TabPanel key={instance.id}>
                <EditorInstanceView instance={instance} status={status} />
            </TabPanel>
        );
    });

    return (
        // TODO: Handle this differently, status must go to `MultiInstanceEditorHeaderView` somehow, not via `viewedInstanceIndex`
        <>
            <MultiInstanceEditorHeaderView fileSources={fileSources} viewedInstanceIndex={(viewedInstanceIndex !== null && instances[viewedInstanceIndex].getStatus().kind === 'active') ? viewedInstanceIndex : null} onSave={onSave} onSelect={onAddInstance} />
            <div>
                <Tabs selectedIndex={viewedInstanceIndex ?? 0} onSelect={(index) => { setViewedInstanceIndex(index); setViewedInstanceCounter(viewedInstanceCounter+1); }} forceRenderTabPanel={true}>
                    <TabList className='tabbed-header'>
                        {tabs}
                    </TabList>
                    {panels}
                </Tabs>
            </div>
        </>
    );
}

function MultiInstanceEditorHeaderView({fileSources, viewedInstanceIndex, onSave, onSelect}: {fileSources: NamedFileSource[], viewedInstanceIndex: number | null, onSave: (index: number) => void, onSelect: (source: NamedFileSource) => void}) {

    const [showOpenModal, setShowOpenModal ] = useState(false);

    return (
        <>
            <div className="header">
                <ul className="header-meta list-group list-group-horizontal">
                    <li className="header-name list-group-item"><strong>SQL-Spielekonsole</strong></li>
                    <li className="header-toolbox list-group-item flex-fill">
                        <IconActionButton type='open' onClick={() => setShowOpenModal(true)} />
                        <IconActionButton type='save' onClick={() => { if(viewedInstanceIndex !== null) { onSave(viewedInstanceIndex); } }} disabled={viewedInstanceIndex === null} />
                    </li>
                    <li className="header-home list-group-item">
                        <IconLinkButton type='home' href="../" />
                    </li>
                </ul>
                <OpenModal title="Spiel laden" fileSources={fileSources} show={showOpenModal} setShow={setShowOpenModal} onOpenFile={onSelect} />
            </div>             
        </>
    );
}

export function EditorInstanceView({instance, status}: {instance: EditorInstance, status: Status}) {

    //////////////////
    // Current game //
    //////////////////

    const [title, setTitle] = useState<string>('');
    const [teaser, setTeaser] = useState<string>('');
    const [copyright, setCopyright] = useState<string>('');
    const [initialSqlScript, setInitialSqlScript] = useState<string>('');
    const [initialSqlScriptCounter, setInitialSqlScriptCounter] = useState<number>(0); // TODO: Hack to force re-render
    const changeInitialSqlScriptCounter = () => { setInitialSqlScriptCounter((c) => c + 1); }
    const [scenes, setScenes] = useState<EditableScene[]>([]);

    const updateMetaData = () => {
        instance.getGame().then(gameRes => {
            if (gameRes.ok) {
                const game = gameRes.data;

                setTitle(game.title);
                setTeaser(game.teaser);
                setCopyright(game.copyright);
            }
        });
    }

    const updateInitialSqlScript = () => {
        instance.getGame().then(gameRes => {
            if (gameRes.ok) {
                const game = gameRes.data;

                setInitialSqlScript(game.initialSqlScript);

                // Hack to force re-render
                changeInitialSqlScriptCounter();
            }
        });
    }

    const initScenes = () => {
            instance.getGame().then(gameRes => {
            if (gameRes.ok) {
                const game = gameRes.data;

                setScenes(game.scenes.map(createEditableScene));
            }
        });
    }


    ////////////////////////////////
    // Trigger resolution on init //
    ////////////////////////////////      
    
    useEffect(() => {
        instance.resolve().then((s) => {               
            if (s.ok) {
                updateMetaData();
                updateInitialSqlScript();
                initScenes();
            }
        });
    }, []);


    //////////////////
    // User actions //
    //////////////////

    // We assert here that the game is in status "active"

    const onCommitMetaData = () => {
        assert(status.kind === 'active');

        instance.onCommitMetaData(title, teaser, copyright).then(() => {
            // Nothing to do
        });
    }

    const onCommitInitialSqlScript = () => {
        assert(status.kind === 'active');

        instance.onCommitInitialSqlScript(initialSqlScript).then(() => {
            updateInitialSqlScript();
        });
    }

    const onCommitScene = (index: number, scene: Scene) => {
        assert(status.kind === 'active');

        instance.onCommitScene(index, scene).then(() => {
            // Nothing to do
        });
    }

    const onAddScene = (scene: Scene) => {
        // TODO
        // const newScene = createEditableScene(scene);
        // setScenes((scenes) => [...scenes, newScene]);
    }

    const onDeleteScene = (scene: EditableScene) => {       
        // Delete in UI
        setScenes(scenes.filter((s) => s.key !== scene.key));
        
        // Propagate to model
        const index = scenes.findIndex((s) => s.key === scene.key);
        instance.onDeleteScene(index).then(() => {
            // Nothing to do
        });
    };

    const onReorderScenes = (start: number, end: number) => {
        // Reorder in UI
        setScenes(reorder(scenes, start, end));
  
        // Propagate to model
        const indices = reorder(Array.from({length: scenes.length}, (_, i) => i), start, end);
        instance.onReorderScenes(indices).then(() => {
            // Nothing to do
        });
    };


    ///////////////////////////
    // Edit text scene modal //
    ///////////////////////////
    
    // Text scene currently being edited or `null` if none is being edited
    const [editedTextScene, setEditedTextScene] = useState<EditableTextScene | null>(null);
    const onEditTextSceneStart = (scene: EditableTextScene) => {
        // Start edit mode
        setEditedTextScene(scene);
    };
    const onEditTextSceneEnd = () => {
        // End edit mode
        setEditedTextScene(null);
    };
    const onEditTextSceneEndWithSave = (scene: EditableTextScene) => {
        // Assertion holds by UI design
        assert(editedTextScene !== null);

        // Update UI
        setScenes(scenes.map((s) => s.key === scene.key ? scene : s));

        // Propagate to model
        const index = scenes.findIndex((s) => s.key === scene.key);
        instance.onCommitScene(index, scene).then(() => {
            // Nothing to do
        });

        // End edit mode
        setEditedTextScene(null);
    };


    /////////////////////////////
    // Edit select scene modal //
    /////////////////////////////
    
    // Text scene currently being edited or `null` if none is being edited
    const [editedSelectScene, setEditedSelectScene] = useState<EditableSelectScene | null>(null);
    const onEditSelectSceneStart = (scene: EditableSelectScene) => {
        // Start edit mode
        setEditedSelectScene(scene);
    };
    const onEditSelectSceneEnd = () => {
        // End edit mode
        setEditedSelectScene(null);
    };
    const onEditSelectSceneEndWithSave = (scene: EditableSelectScene) => {
        // Assertion holds by UI design
        assert(editedSelectScene !== null);

        // Update UI
        setScenes(scenes.map((s) => s.key === scene.key ? scene : s));

        // Propagate to model
        const index = scenes.findIndex((s) => s.key === scene.key);
        instance.onCommitScene(index, scene).then(() => {
            // Nothing to do
        });

        // End edit mode
        setEditedSelectScene(null);
    };


    /////////////////////////////////
    // Edit manipulate scene modal //
    /////////////////////////////////
    
    // Text scene currently being edited or `null` if none is being edited
    const [editedManipulateScene, setEditedManipulateScene] = useState<EditableManipulateScene | null>(null);
    const onEditManipulateSceneStart = (scene: EditableManipulateScene) => {
        // Start edit mode
        setEditedManipulateScene(scene);
    };
    const onEditManipulateSceneEnd = () => {
        // End edit mode
        setEditedManipulateScene(null);
    };
    const onEditManipulateSceneEndWithSave = (scene: EditableManipulateScene) => {
        // Assertion holds by UI design
        assert(editedManipulateScene !== null);

        // Update UI
        setScenes(scenes.map((s) => s.key === scene.key ? scene : s));

        // Propagate to model
        const index = scenes.findIndex((s) => s.key === scene.key);
        instance.onCommitScene(index, scene).then(() => {
            // Nothing to do
        });

        // End edit mode
        setEditedManipulateScene(null);
    };


    /////////////////////
    // Add scene modal //
    /////////////////////

    const [addSceneShow, setAddSceneShow] = useState<boolean>(false);
    const onAddSceneStart = () => {
        // Start edit mode
        setAddSceneShow(true);
    };
    const onAddSceneEnd = () => {
        // End edit mode
        setAddSceneShow(false);
    };
    const onAddSceneEndWithSave = (scene: Scene) => {
        // Update UI
        setScenes([...scenes, createEditableScene(scene)]);

        // Propagate to model
        instance.onAddScene(scene).then(() => {
            // Nothing to do
        });

        // End edit mode
        setAddSceneShow(false);
    };



    //////////////////////
    // Helper functions //
    //////////////////////

    // const extractGame = () => {
    //     const newScenes = scenes.map((scene) => {
    //         const { key, ...sceneData } = scene;
    //         return sceneData;
    //     });
        
    //     return new Game(title, teaser, copyright, initialSqlScript, newScenes);
    // }


    ////////////
    // Render //
    ////////////

    return (
        <>
            <StatusView status={status} />
            {
                status.kind === 'active' ? (
                    <div>
                        <div className="editor-header">
                            <MetaDataView title={title} setTitle={setTitle} teaser={teaser} setTeaser={setTeaser} copyright={copyright} setCopyright={setCopyright} onCommitMetaData={onCommitMetaData} />
                        </div>
                        <div className="editor-body">
                            <EditableScenesWidget scenes={scenes} onEditTextSceneStart={onEditTextSceneStart} onEditSelectSceneStart={onEditSelectSceneStart} onEditManipulateSceneStart={onEditManipulateSceneStart} onAddSceneStart={onAddSceneStart} onDeleteScene={onDeleteScene} onReorderScenes={onReorderScenes} />
                            <div className="editor-sidebar">
                                <InitScriptWidget instance={instance} initialSqlScript={initialSqlScript} setInitialSqlScript={setInitialSqlScript} onCommitInitialSqlScript={onCommitInitialSqlScript} />
                                <SchemaWidget instance={instance} initialSqlScriptCounter={initialSqlScriptCounter} />
                            </div>
                        </div>
                    </div>
                )
                : null
            }
            <EditTextSceneModal scene={editedTextScene} onHide={onEditTextSceneEnd} onSaveAndHide={onEditTextSceneEndWithSave} />
            <EditSelectSceneModal scene={editedSelectScene} onHide={onEditSelectSceneEnd} onSaveAndHide={onEditSelectSceneEndWithSave} />
            <EditManipulateSceneModal scene={editedManipulateScene} onHide={onEditManipulateSceneEnd} onSaveAndHide={onEditManipulateSceneEndWithSave} />
            <AddSceneModal show={addSceneShow} onHide={onAddSceneEnd} onSaveAndHide={onAddSceneEndWithSave}  />
        </>
    );
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
}

function MetaDataView({title, setTitle, teaser, setTeaser, copyright, setCopyright, onCommitMetaData}: {title: string, setTitle: (title: string) => void, teaser: string, setTeaser: (title: string) => void, copyright: string, setCopyright: (title: string) => void, onCommitMetaData: () => void }) {
    return (
        <div className="editor-meta-data-view">
            <InputGroup className="editor-meta-data-title">
                <InputGroup.Text className="fw-bold">Name:</InputGroup.Text>
                <Form.Control
                    type="text"
                    value={title}
                    onChange={(e) => setTitle( e.target.value )}
                    onBlur={onCommitMetaData}
                />
            </InputGroup>
            <div className="editor-meta-data-more">
                <InputGroup>
                    <InputGroup.Text className="fw-bold">Teaser:</InputGroup.Text>
                    <Form.Control
                        type="text"
                        value={teaser}
                        onChange={(e) => setTeaser( e.target.value )}
                        onBlur={onCommitMetaData}
                    />
                </InputGroup>
                <InputGroup>
                    <InputGroup.Text className="fw-bold">Copyright:</InputGroup.Text>
                    <Form.Control
                        type="text"
                        value={copyright}
                        onChange={(e) => setCopyright( e.target.value )}
                        onBlur={onCommitMetaData}
                    />
                </InputGroup>
            </div>
        </div>
    );
}

function InitScriptWidget({instance, initialSqlScript, setInitialSqlScript, onCommitInitialSqlScript}: {instance: EditorInstance, initialSqlScript: string, setInitialSqlScript: (initScript: string) => void, onCommitInitialSqlScript: () => void}) {
    return (
        <Widget className={'widget-initscript'} bodyClassName={'widget-initscript-body'} title={'Initiales SQL-Skript'}>
            <Form.Group>
                <Form.Control
                    as="textarea"
                    rows={6}
                    value={initialSqlScript}
                    onChange={(e) => { setInitialSqlScript(e.target.value); }}
                    onBlur={onCommitInitialSqlScript}
                />
            </Form.Group>
        </Widget>
    );
}

type SchemaStatusPending = { kind: 'pending' };
type SchemaStatusLoaded  = { kind: 'loaded', data: Schema };
type SchemaStatusFailed  = { kind: 'failed', error: RunInitScriptFail | ParseSchemaFail };
type SchemaStatus        = SchemaStatusPending | SchemaStatusLoaded | SchemaStatusFailed;

function SchemaWidget({instance, initialSqlScriptCounter}: {instance: EditorInstance, initialSqlScriptCounter: number}) {
    const [initScriptStatus, setInitScriptStatus] = useState<SchemaStatus>( { kind: 'pending' } );

    // Update the schema status initially
    useEffect(() => {
        setInitScriptStatus({ kind: 'pending' });
        
        instance.getSchema().then((schemaResult) => {
            // Success
            if (schemaResult.ok) {
                setInitScriptStatus({ kind: 'loaded', data: schemaResult.data });
            }
            // Fail
            else {
                // Assertion holds because inst status must be "active"
                assert(schemaResult.error.kind === 'run-init-script' || schemaResult.error.kind === 'parse-schema');

                setInitScriptStatus({ kind: 'failed', error: schemaResult.error });
            }
        });
    }, [initialSqlScriptCounter]);

    return (
        <Widget className={'widget-schema'} bodyClassName='widget-schema-body' title={'Schema'}>
            {initScriptStatus.kind === 'pending' ? (
                <p className='initscript-status'>Lade...</p>
            )
            : initScriptStatus.kind === 'failed' ? (
                initScriptStatus.error.kind === 'run-init-script' ? (
                    <p className='initscript-status'>Fehler beim Ausführen des initialen SQL-Skripts: {initScriptStatus.error.details}</p>
                )
                : (
                    <p className='initscript-status'>Fehler beim Einlesen des Schemas: {initScriptStatus.error.details}</p>
                )
            ): (
                <>
                <Table className="widget-schema-table">
                    <tbody>
                        {
                            initScriptStatus.data.map((tableInfo) =>
                                <TableInfoView key={tableInfo.name} tableInfo={tableInfo} />
                            )
                        }
                    </tbody>
                </Table>
                <div className="widget-schema-caption">
                    <small><u>unterstrichen</u>: Primärschlüssel&nbsp;&nbsp;&nbsp;<br/><em>kursiv</em>: Fremdschlüssel</small>
                </div>
                </>
            )}
        </Widget>
    );
}

function EditableScenesWidget({ scenes, onEditTextSceneStart, onEditSelectSceneStart, onEditManipulateSceneStart, onAddSceneStart, onDeleteScene, onReorderScenes }: {scenes: EditableScene[], onEditTextSceneStart: (scene: EditableTextScene) => void, onEditSelectSceneStart: (scene: EditableSelectScene) => void, onEditManipulateSceneStart: (scene: EditableManipulateScene) => void, onAddSceneStart: () => void, onDeleteScene: (scene: EditableScene) => void, onReorderScenes: (start: number, end: number) => void }) {
    const getItemStyle = (isDragging: boolean, draggableStyle: DraggableProvidedDraggableProps) => ({
        // some basic styles to make the items look a bit nicer
        userSelect: "none",
        padding: 8 * 2,
        margin: `0 0 ${8}px 0`,
      
        // change background colour if dragging
        background: isDragging ? "lightgreen" : "grey",
      
        // styles we need to apply on draggables
        ...draggableStyle
    });

    const onDragEnd = (result: DropResult) => {
        // Ignore if dropped outside the list
        if (!result.destination) {
            return;
        }
    
        onReorderScenes(result.source.index, result.destination.index);
    }

    return (
        <div className="editable-scenes-container">
            <DragDropContext onDragEnd={onDragEnd}>
                <StrictModeDroppable droppableId="droppable">
                    { (provided) => (
                        <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                        >
                            {scenes.map((scene, index) => {
                                return (
                                    <Draggable key={scene.key} draggableId={scene.key} index={index}>
                                        {(provided) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                {...provided.dragHandleProps}
                                            >
                                                <EditableSceneView scene={scene} onEditTextSceneStart={onEditTextSceneStart} onEditSelectSceneStart={onEditSelectSceneStart} onEditManipulateSceneStart={onEditManipulateSceneStart} onDeleteScene={onDeleteScene} />
                                            </div>
                                        )}
                                    </Draggable>
                                )
                            })}
                            {provided.placeholder}
                        </div>
                    )}
                </StrictModeDroppable>
            </DragDropContext>
            <AddSceneButton onAdd={onAddSceneStart} />
        </div>
    );
}

function EditableSceneView({scene, onEditTextSceneStart, onEditSelectSceneStart, onEditManipulateSceneStart, onDeleteScene}: {scene: EditableScene, onEditTextSceneStart: (scene: EditableTextScene) => void, onEditSelectSceneStart: (scene: EditableSelectScene) => void, onEditManipulateSceneStart: (scene: EditableManipulateScene) => void, onDeleteScene: (scene: EditableScene) => void}) {
    if (scene.type === 'text') {
        return <EditableTextSceneView scene={scene} onEdit={() => onEditTextSceneStart(scene)} onDelete={() => onDeleteScene(scene)} />;
    }
    else if (scene.type === 'select') {
        return <EditableSelectSceneView scene={scene} onEdit={() => onEditSelectSceneStart(scene) } onDelete={() => onDeleteScene(scene)} />;
    }
    else {
        return <EditableManipulateSceneView scene={scene} onEdit={() => onEditManipulateSceneStart(scene) } onDelete={() => onDeleteScene(scene)} />;
    }
}

function EditableTextSceneView({scene, onEdit, onDelete}: {scene: EditableTextScene, onEdit: () => void, onDelete: () => void}) {
    return (
        <ListGroup className="editable-text-scene-view">
            <EditableSceneViewHeader bsVariant="secondary" title={<strong><em>Text</em></strong>} onEdit={onEdit} onDelete={onDelete} />
            <ListGroup.Item className="bg-secondary bg-opacity-25 border-secondary">
                {scene.text}
            </ListGroup.Item>
        </ListGroup>
    );
}

function EditableSelectSceneView({scene, onEdit, onDelete}: {scene: EditableSelectScene, onEdit: () => void, onDelete: () => void}) {
    console.log(scene);
    return (
        <ListGroup className="editable-select-scene-view">
            <EditableSceneViewHeader bsVariant="primary" title={<strong><em>Select</em></strong>} onEdit={onEdit} onDelete={onDelete} />
            <ListGroup.Item className="bg-primary bg-opacity-25 border-primary">
                {scene.text}
            </ListGroup.Item>
            <ListGroup.Item className="bg-primary bg-opacity-25 border-primary">
                <div className="d-flex justify-content-between">
                    <p>
                        <strong>SQL-Lösung</strong>
                    </p>
                    {
                        scene.isOrderRelevant ? <p><strong>Sortierung ist relevant</strong></p> : null
                    }
                </div>
                <SyntaxHighlighter language="sql">
                    {scene.sqlSol}
                </SyntaxHighlighter>
            </ListGroup.Item>
            {
                scene.sqlPlaceholder !== '' ? (
                    <ListGroup.Item className="bg-primary bg-opacity-25 border-primary">
                        <p>
                            <strong>Platzhalter für das Abfragefeld</strong>
                        </p>
                        <SyntaxHighlighter language="sql">
                            {scene.sqlPlaceholder}
                        </SyntaxHighlighter>
                    </ListGroup.Item>
                ) : null
            }
        </ListGroup>
    );
}

function EditableManipulateSceneView({scene, onEdit, onDelete}: {scene: EditableManipulateScene, onEdit: () => void, onDelete: () => void}) {
    return (
        <ListGroup className="editable-manipulte-scene-view">
            <EditableSceneViewHeader bsVariant="success" title={<strong><em>Manipulate</em></strong>} onEdit={onEdit} onDelete={onDelete} />
            <ListGroup.Item className="bg-success bg-opacity-25 border-success">
                {scene.text}
            </ListGroup.Item>
            <ListGroup.Item className="bg-success bg-opacity-25 border-success">
                <p>
                    <strong>SQL-Lösung</strong>
                </p>
                <SyntaxHighlighter language="sql">
                    {scene.sqlSol}
                </SyntaxHighlighter>
            </ListGroup.Item>
            <ListGroup.Item className="bg-success bg-opacity-25 border-success">
                <p>
                    <strong>SQL-Prüfabfrage</strong>
                </p>
                <SyntaxHighlighter language="sql">
                    {scene.sqlCheck}
                </SyntaxHighlighter>
            </ListGroup.Item>
        </ListGroup>
    );
}

function EditableSceneViewHeader({bsVariant, title, onEdit, onDelete}: {bsVariant: string, title: ReactElement, onEdit: () => void, onDelete: () => void}) {
    return (
        <ListGroup.Item className={classNames('editable-scene-view-header', 'd-flex', 'justify-content-between', 'align-items-start', 'bg-'+bsVariant, 'bg-opacity-50', 'border-'+bsVariant)}>
            <p>{title}</p>
            <div>
                <ClickableIcon type='edit' onClick={onEdit} disabled={false} />
                <ClickableIcon type='close' onClick={onDelete} disabled={false} />
            </div>
        </ListGroup.Item>
    );
}

function AddSceneButton({ onAdd }: { onAdd: () => void }) {
    return (
        <div className="add-scene-button">
            <ClickableIcon type={'add'} disabled={false} onClick={onAdd}  />
        </div>
    );
}


////////////
// Modals //
////////////

function EditTextSceneModal ({ scene, onHide, onSaveAndHide }: { scene: EditableTextScene | null, onHide: () => void, onSaveAndHide: (scene: EditableTextScene) => void }) {
    const [editedText, setEditedText] = useState("");

    const handleShow = () => {
        // Assertion holds because the modal is only shown when a text-scene-to-edit is set
        assert(scene !== null);

        setEditedText(scene.text);
    }

    const handleSave = () => {
        // Assertion holds because the modal is only shown when a text-scene-to-edit is set
        assert(scene !== null);

        onSaveAndHide({ ...scene, text: editedText });
    };

    return (
        <Modal className="edit-text-scene-modal" show={scene !== null} onHide={onHide} onShow={handleShow} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Text-Szene bearbeiten</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <Form.Group>
                        <Form.Label>Text:</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={8}
                            value={editedText   }
                            onChange={(e) => { setEditedText(e.target.value); }} />
                    </Form.Group>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>
                    Schließen
                </Button>
                <Button variant="primary" onClick={handleSave}>
                    Speichern
                </Button>
            </Modal.Footer>
        </Modal>
    );
}

function EditSelectSceneModal ({ scene, onHide, onSaveAndHide }: { scene: EditableSelectScene | null, onHide: () => void, onSaveAndHide: (scene: EditableSelectScene) => void }) {
    const [editedText, setEditedText] = useState("");
    const [editedSqlSol, setEditedSqlSol] = useState("");
    const [editedSqlPlaceholder, setEditedSqlPlaceholder] = useState("");
    const [editedIsOrderRelevant, setEditedIsOrderRelevant] = useState(false);

    const handleShow = () => {
        // Assertion holds because the modal is only shown when a text-scene-to-edit is set
        assert(scene !== null);

        setEditedText(scene.text);
        setEditedSqlSol(scene.sqlSol);
        setEditedSqlPlaceholder(scene.sqlPlaceholder);
        setEditedIsOrderRelevant(scene.isOrderRelevant);
    }

    const handleSave = () => {
        // Assertion holds because the modal is only shown when a text-scene-to-edit is set
        assert(scene !== null);

        onSaveAndHide({ ...scene, text: editedText, sqlSol: editedSqlSol, sqlPlaceholder: editedSqlPlaceholder, isOrderRelevant: editedIsOrderRelevant });
    };

    return (
        <Modal className="edit-select-scene-modal" show={scene !== null} onHide={onHide} onShow={handleShow} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Select-Szene bearbeiten</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <Form.Group>
                        <Form.Label>Text:</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={8}
                            value={editedText}
                            onChange={(e) => { setEditedText(e.target.value); }} />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label>SQL-Lösung:</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={4}
                            value={editedSqlSol}
                            onChange={(e) => { setEditedSqlSol(e.target.value); }} />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label>Platzhalter für die Eingabe in das Abfragefeld:</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={4}
                            value={editedSqlPlaceholder}
                            onChange={(e) => { setEditedSqlPlaceholder(e.target.value); }} />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label></Form.Label>
                        <Form.Check
                            type="switch"
                            label="Sortierung der Zeilen für die Lösung relevant?"
                        />
                    </Form.Group>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>
                    Schließen
                </Button>
                <Button variant="primary" onClick={handleSave}>
                    Speichern
                </Button>
            </Modal.Footer>
        </Modal>
    );
}

function EditManipulateSceneModal({ scene, onHide, onSaveAndHide }: { scene: EditableManipulateScene | null, onHide: () => void, onSaveAndHide: (scene: EditableManipulateScene) => void }) {
    const [editedText, setEditedText] = useState("");
    const [editedSqlSol, setEditedSqlSol] = useState("");
    const [editedSqlCheck, setEditedSqlCheck] = useState("");
    const [editedSqlPlaceholder, setEditedSqlPlaceholder] = useState("");

    const handleShow = () => {
        // Assertion holds because the modal is only shown when a text-scene-to-edit is set
        assert(scene !== null);

        setEditedText(scene.text);
        setEditedSqlSol(scene.sqlSol);
        setEditedSqlCheck(scene.sqlCheck);
        setEditedSqlPlaceholder(scene.sqlPlaceholder);
    }

    const handleSave = () => {
        // Assertion holds because the modal is only shown when a text-scene-to-edit is set
        assert(scene !== null);

        onSaveAndHide({ ...scene, text: editedText, sqlSol: editedSqlSol, sqlCheck: editedSqlCheck, sqlPlaceholder: editedSqlPlaceholder });
    };

    return (
        <Modal className="edit-manipulate-scene-modal" show={scene !== null} onHide={onHide} onShow={handleShow} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Manipulate-Szene bearbeiten</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <Form.Group>
                        <Form.Label>Text:</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={8}
                            value={editedText}
                            onChange={(e) => { setEditedText(e.target.value); }} />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label>SQL-Lösung:</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={4}
                            value={editedSqlSol}
                            onChange={(e) => { setEditedSqlSol(e.target.value); }} />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label>SQL-Check-Abfrage:</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={4}
                            value={editedSqlCheck}
                            onChange={(e) => { setEditedSqlCheck(e.target.value); }} />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label>Platzhalter für die Eingabe in das Abfragefeld:</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={4}
                            value={editedSqlPlaceholder}
                            onChange={(e) => { setEditedSqlPlaceholder(e.target.value); }} />
                    </Form.Group>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>
                    Schließen
                </Button>
                <Button variant="primary" onClick={handleSave}>
                    Speichern
                </Button>
            </Modal.Footer>
        </Modal>
    );
}

type SceneType = 'text' | 'select' | 'manipulate';

function AddSceneModal({ show, onHide, onSaveAndHide }: { show: boolean, onHide: () => void, onSaveAndHide: (scene: Scene) => void }) {
    const [sceneType, setSceneType] = useState<SceneType>('text');
    const [editedText, setEditedText] = useState("");

    const handleShow = () => {
        setEditedText('');
        setSceneType('text');
    }

    const handleSave = () => {
        const scene: Scene = sceneType === 'text'
            ? { type: 'text', text: editedText }
            : sceneType === 'select'
            ? { type: 'select', text: editedText, sqlSol: '', sqlPlaceholder: '', isOrderRelevant: false }
            : { type: 'manipulate', text: editedText, sqlSol: '', sqlCheck: '', sqlPlaceholder: '' };

        onSaveAndHide(scene);
    };

    return (
        <Modal className="edit-manipulate-scene-modal" show={show} onHide={onHide} onShow={handleShow} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Szene hinzufügen</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <Form.Group>
                        <Form.Label>Choose a scene type:</Form.Label>
                        <Form.Check
                            type="radio"
                            label="Text"
                            name="sceneType"
                            id="text"
                            value="text"
                            checked={sceneType === 'text'}
                            onChange={() => setSceneType('text')}
                        />
                        <Form.Check
                            type="radio"
                            label="Select"
                            name="sceneType"
                            id="select"
                            value="select"
                            checked={sceneType === 'select'}
                            onChange={() => setSceneType('select')}
                        />
                        <Form.Check
                            type="radio"
                            label="Manipulate"
                            name="sceneType"
                            id="manipulate"
                            value="manipulate"
                            checked={sceneType === 'manipulate'}
                            onChange={() => setSceneType('manipulate')}
                        />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label>Text:</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={8}
                            value={editedText}
                            onChange={(e) => { setEditedText(e.target.value); }} />
                    </Form.Group>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>
                    Abbrechen
                </Button>
                <Button variant="primary" onClick={handleSave}>
                    Hinzufügen
                </Button>
            </Modal.Footer>
        </Modal>
    );
}


/////////////////
// Save button //
/////////////////

function SaveGameAsXMLButton({instance}: {instance: EditorInstance}) {
    // const handleDownloadXML = () => {
    //     instance.getGame().then(gameRes => {
    //         if (gameRes.ok) {
    //             const game = gameRes.data;
    //             const xml = gameToXML(game);

    //             // Convert the XML string to a Blob
    //             const blob = new Blob([xml], { type: 'application/xml' });

    //             // Create a URL for the Blob
    //             const url = URL.createObjectURL(blob);
            
    //             // Create a temporary link to trigger the download
    //             const link = document.createElement('a');
    //             link.href = url;
    //             link.download = 'example.xml'; // Name of the file to be downloaded  //TODO
    //             document.body.appendChild(link); // Append the link to the document
    //             link.click(); // Trigger the download
            
    //             // Cleanup: remove the link and revoke the Blob URL
    //             document.body.removeChild(link);
    //             URL.revokeObjectURL(url);
    //         }
    //     });
    // };
    
    return (
        <button onClick={()=>{}}>Download XML</button>
    );
}