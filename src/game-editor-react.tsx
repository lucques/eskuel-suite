import React, { ReactElement, ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { Badge, Button, Form, InputGroup, ListGroup, Modal } from 'react-bootstrap';
import classNames from 'classnames';
import { DragDropContext, Draggable, DraggableProvidedDraggableProps, DropResult } from "react-beautiful-dnd";
import { StrictModeDroppable } from "./hacks";
import { Tab, TabList, TabPanel, Tabs } from 'react-tabs';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { prism as prismStyle } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { DbData, DbSource, FetchDbFail, InitDbFail, ParseSchemaFail } from "./sql-js-api";
import { Schema } from './schema';
import { ImageSource, Named, UserImageFail, assert, encodeToBase64, materializeBinarySource, reorder } from "./util";
import { Game, Scene, TextScene, SelectScene, ManipulateScene, gameToXML, ImageScene, GameSource, createBlankGame, GameInitStatus, gameInitStatusToLoadingStatus as gameInitStatusToLoadingStatus } from './game-pure';
import { ClickableIcon, EskuelModal, IconActionButton, IconLinkButton, MultiWidget, NewGameFileModal, OpenDbSourceModal, OpenGameSourceModal, OpenImageSourceModal, QueryEditor, SchemaView, UserImage, LoadingBarWithOpenButton, LoadingStatus, LoadingBar, LoadingBarWithOpenSaveButton } from './react';
import { EditorInstance } from './game-editor-instance';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'react-tabs/style/react-tabs.css';
import './screen.css';
const customStyle = {
    // Add other styles if needed
    overflow: 'auto', // This makes the content scrollable
    maxWidth: '100%'
};

export { Game } from './game-pure';


///////////////////
// Wrapper types //
///////////////////

type Editable<T>   = T & { key: string };
type EditableScene = Editable<TextScene> | Editable<ImageScene> | Editable<SelectScene> | Editable<ManipulateScene>;

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

export function MultiEditorComponentView({initialInstances, fileSources}: {initialInstances: EditorInstance[], fileSources: Named<GameSource>[]}) {

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

    const [status, setStatus] = useState<GameInitStatus[]>(instances.map((inst: EditorInstance) => inst.getStatus()));
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

    const onNewInstance = (name: string) => {
        const game: Game = createBlankGame(name);

        onAddInstance({ name, type: 'object', source: game });
    }

    const onAddInstance = (source: Named<GameSource>) => {
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
            <MultiInstanceEditorHeaderView fileSources={fileSources} viewedInstanceIndex={(viewedInstanceIndex !== null && instances[viewedInstanceIndex].getStatus().kind === 'active') ? viewedInstanceIndex : null} onSave={onSave} onSelect={onAddInstance} onCreate={onNewInstance} />
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

function MultiInstanceEditorHeaderView({fileSources, viewedInstanceIndex, onSave, onSelect, onCreate}: {fileSources: Named<GameSource>[], viewedInstanceIndex: number | null, onSave: (index: number) => void, onSelect: (source: Named<GameSource>) => void, onCreate: (name: string) => void}) {

    const [showNewModal, setShowNewModal ] = useState(false);
    const [showOpenModal, setShowOpenModal ] = useState(false);

    return (
        <>
            <div className="header">
                <ul className="header-meta list-group list-group-horizontal">
                    <li className="header-name list-group-item"><strong>SQL-Spieleeditor</strong></li>
                    <li className="header-toolbox list-group-item flex-fill">
                        <IconActionButton type='new'  onClick={() => setShowNewModal(true)} tooltipText='Neues Spiel' />
                        <IconActionButton type='open' onClick={() => setShowOpenModal(true)} tooltipText='Spiel öffnen' />
                        <IconActionButton type='save' onClick={() => { if(viewedInstanceIndex !== null) { onSave(viewedInstanceIndex); } }} disabled={viewedInstanceIndex === null} tooltipText='Spiel herunterladen' />
                    </li>
                    <li className="header-home list-group-item">
                        <IconLinkButton type='home' href="../" tooltipText='Hauptmenü' />
                    </li>
                </ul>
            </div>
            <NewGameFileModal
                onCreate={onCreate}
                show={showNewModal}
                setShow={setShowNewModal}
            />

            <OpenGameSourceModal
                providedFileSources={fileSources}
                onOpenFile={onSelect}
                show={showOpenModal}
                setShow={setShowOpenModal}
            />
        </>
    );
}


export function EditorInstanceView({instance, status}: {instance: EditorInstance, status: GameInitStatus}) {

    //////////////////
    // Current game //
    //////////////////

    const [title, setTitle] = useState<string>('');
    const [teaser, setTeaser] = useState<string>('');
    const [copyright, setCopyright] = useState<string>('');
    const [scenes, setScenes] = useState<EditableScene[]>([]);
    const [loadGameDbWidgetStatus, setLoadGameDbWidgetStatus] = useState<LoadGameDbWidgetStatus>({ kind: 'pending' });

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

    const updateLoadGameDbWidgetStatus = () => {
        Promise.all([instance.getSchema(), instance.getGame()]).then(([schemaResult, gameResult]) => {
            // Success
            if (schemaResult.ok && gameResult.ok) {
                if (gameResult.data.dbData === null) {
                    setLoadGameDbWidgetStatus({ kind: 'empty' });
                }
                else {
                    setLoadGameDbWidgetStatus({ kind: 'loaded', schema: schemaResult.data, dbData: gameResult.data.dbData });
                }
            }
            // Fail
            else {
                // Assertion holds because inst status must be "active"
                assert(gameResult.ok);
                assert(!schemaResult.ok && schemaResult.error.kind !== 'fetch-xml' && schemaResult.error.kind !== 'parse-xml');

                setLoadGameDbWidgetStatus({ kind: 'failed', error: schemaResult.error });
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
                updateLoadGameDbWidgetStatus();
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

    const onSetDbSource = (dbSource: DbSource) => {
        instance.onCommitDbSource(dbSource).then(() => {
            updateLoadGameDbWidgetStatus();
        });
    }

    const onCommitScene = (index: number, scene: Scene) => {
        assert(status.kind === 'active');

        instance.onCommitScene(index, scene).then(() => {
            // Nothing to do
        });
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


    //////////////////////
    // Edit scene modal //
    //////////////////////
    
    // Text scene currently being edited or `null` if none is being edited
    const [editedScene, setEditedScene] = useState<EditableScene | null>(null);
    const onEditSceneStart = (scene: EditableScene) => {
        // Start edit mode
        setEditedScene(scene);
    };
    const onEditSceneEnd = () => {
        // End edit mode
        setEditedScene(null);
    };
    const onEditSceneEndWithSave = (scene: EditableScene) => {
        // Update UI
        setScenes(scenes.map((s) => s.key === scene.key ? scene : s));

        // Propagate to model
        const index = scenes.findIndex((s) => s.key === scene.key);
        instance.onCommitScene(index, scene).then(() => {
            // Nothing to do
        });

        // End edit mode
        setEditedScene(null);
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


    ////////////
    // Render //
    ////////////

    return (
        <>
            {
                status.kind != 'active' &&
                    <LoadingBar status={gameInitStatusToLoadingStatus(status)} />
            }
            {
                status.kind === 'active' &&
                    <div className="editor">
                        <MetaDataView title={title} setTitle={setTitle} teaser={teaser} setTeaser={setTeaser} copyright={copyright} setCopyright={setCopyright} onCommitMetaData={onCommitMetaData} />
                        <EditableScenesWidget scenes={scenes} onEditSceneStart={onEditSceneStart} onAddSceneStart={onAddSceneStart} onDeleteScene={onDeleteScene} onReorderScenes={onReorderScenes} />
                        <div className="editor-sidebar">
                            <LoadGameDbSourceWidget status={loadGameDbWidgetStatus} setSource={onSetDbSource} />
                        </div>
                    </div>
            }
            <EditSceneModal initialScene={editedScene} onHide={onEditSceneEnd} onSaveAndHide={onEditSceneEndWithSave} />
            <AddSceneModal show={addSceneShow} onHide={onAddSceneEnd} onSaveAndHide={onAddSceneEndWithSave} />
        </>
    );
}

function MetaDataView({title, setTitle, teaser, setTeaser, copyright, setCopyright, onCommitMetaData}: {title: string, setTitle: (title: string) => void, teaser: string, setTeaser: (title: string) => void, copyright: string, setCopyright: (title: string) => void, onCommitMetaData: () => void }) {
    return (
        <>
            <div className="d-flex flex-column justify-content-between row-gap-default">
                <InputGroup className="editor-meta-data-title">
                    <InputGroup.Text className="fw-bold">Name:</InputGroup.Text>
                    <Form.Control
                        type="text"
                        value={title}
                        onChange={(e) => setTitle( e.target.value )}
                        onBlur={onCommitMetaData}
                    />
                </InputGroup>
                <InputGroup className="editor-meta-data-copyright">
                    <InputGroup.Text className="fw-bold">Copyright:</InputGroup.Text>
                    <Form.Control
                        type="text"
                        value={copyright}
                        onChange={(e) => setCopyright( e.target.value )}
                        onBlur={onCommitMetaData}
                    />
                </InputGroup>
            </div>
            <div className="editor-meta-data-right">
                <InputGroup>
                    <InputGroup.Text className="fw-bold">Teaser:</InputGroup.Text>
                    <Form.Control
                        as="textarea"
                        rows={3}
                        value={teaser}
                        onChange={(e) => { setTeaser( e.target.value); }}
                        onBlur={onCommitMetaData} />
                </InputGroup>
            </div>
        </>
    );
}

function EditableScenesWidget({ scenes, onEditSceneStart, onAddSceneStart, onDeleteScene, onReorderScenes }: {scenes: EditableScene[], onEditSceneStart: (scene: EditableScene) => void, onAddSceneStart: () => void, onDeleteScene: (scene: EditableScene) => void, onReorderScenes: (start: number, end: number) => void }) {
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
                                                <EditableSceneView scene={scene} deletable={scenes.length > 1} onEditSceneStart={onEditSceneStart} onDeleteScene={onDeleteScene} />
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

function EditableSceneView({scene, deletable, onEditSceneStart, onDeleteScene}: {scene: EditableScene, deletable: boolean, onEditSceneStart: (scene: EditableScene) => void, onDeleteScene: (scene: EditableScene) => void}) {
    if (scene.type === 'text') {
        return <EditableTextSceneView scene={scene} deletable={deletable} onEdit={() => onEditSceneStart(scene)} onDelete={() => onDeleteScene(scene)} />;
    }
    else if (scene.type === 'image') {
        return <EditableImageSceneView scene={scene} deletable={deletable} onEdit={() => onEditSceneStart(scene)} onDelete={() => onDeleteScene(scene)} />;
    }
    else if (scene.type === 'select') {
        return <EditableSelectSceneView scene={scene} deletable={deletable} onEdit={() => onEditSceneStart(scene) } onDelete={() => onDeleteScene(scene)} />;
    }
    else {
        return <EditableManipulateSceneView scene={scene} deletable={deletable} onEdit={() => onEditSceneStart(scene) } onDelete={() => onDeleteScene(scene)} />;
    }
}

function EditableTextSceneView({scene, deletable, onEdit, onDelete}: {scene: Editable<TextScene>, deletable: boolean, onEdit: () => void, onDelete: () => void}) {
    return (
        <ListGroup className="editable-text-scene-view">
            <EditableSceneViewHeader bsVariant="secondary" deletable={deletable} title={<strong><em>Text</em></strong>} onEdit={onEdit} onDelete={onDelete} />
            <ListGroup.Item className="bg-secondary bg-opacity-25 border-secondary">
                {scene.text}
            </ListGroup.Item>
        </ListGroup>
    );
}

function EditableImageSceneView({scene, deletable, onEdit, onDelete}: {scene: Editable<ImageScene>, deletable: boolean, onEdit: () => void, onDelete: () => void}) {
    return (
        <ListGroup className="editable-image-scene-view">
            <EditableSceneViewHeader bsVariant="warning" deletable={deletable} title={<strong><em>Image</em></strong>} onEdit={onEdit} onDelete={onDelete} />
            <ListGroup.Item className="bg-warning bg-opacity-25 border-warning">
                <UserImage base64string={scene.base64string} /> 
            </ListGroup.Item>
        </ListGroup>
    );
}

function EditableSelectSceneView({scene, deletable, onEdit, onDelete}: {scene: Editable<SelectScene>, deletable: boolean, onEdit: () => void, onDelete: () => void}) {
    return (
        <ListGroup className="editable-select-scene-view">
            <EditableSceneViewHeader bsVariant="primary" deletable={deletable} title={<strong><em>Select</em></strong>} onEdit={onEdit} onDelete={onDelete} />
            <ListGroup.Item className="bg-primary bg-opacity-25 border-primary">
                {scene.text}
            </ListGroup.Item>
            <ListGroup.Item className="bg-primary bg-opacity-25 border-primary">
                <div className="d-flex justify-content-between">
                    <p>
                        <strong>SQL-Lösung</strong>
                    </p>
                </div>
                <SyntaxHighlighter language="sql" style={prismStyle} customStyle={customStyle}>
                    {scene.sqlSol}
                </SyntaxHighlighter>
            </ListGroup.Item>
            {
                (scene.isRowOrderRelevant || scene.isColOrderRelevant || scene.areColNamesRelevant) && (
                    <ListGroup.Item className="d-flex bg-primary bg-opacity-25 border-primary col-gap-default">
                        {
                            scene.isRowOrderRelevant ? (
                                <Badge>Zeilen: Reihenfolge relevant</Badge>
                            ) : null
                        }
                        {
                            scene.isColOrderRelevant ? (
                                <Badge>Spalten: Reihenfolge relevant</Badge>
                            ) : null
                        }
                        {
                            scene.areColNamesRelevant ? (
                                <Badge>Spalten: Bezeichnungen relevant</Badge>
                            ) : null
                        }
                    </ListGroup.Item>
                )
            }
            {
                scene.sqlPlaceholder !== '' && (
                    <ListGroup.Item className="bg-primary bg-opacity-25 border-primary">
                        <p>
                            <strong>Platzhalter für das Abfragefeld</strong>
                        </p>
                        <SyntaxHighlighter language="sql">
                            {scene.sqlPlaceholder}
                        </SyntaxHighlighter>
                    </ListGroup.Item>
                )
            }
        </ListGroup>
    );
}

function EditableManipulateSceneView({scene, deletable, onEdit, onDelete}: {scene: Editable<ManipulateScene>, deletable: boolean, onEdit: () => void, onDelete: () => void}) {
    return (
        <ListGroup className="editable-manipulte-scene-view">
            <EditableSceneViewHeader bsVariant="success" deletable={deletable} title={<strong><em>Manipulate</em></strong>} onEdit={onEdit} onDelete={onDelete} />
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
            {
                scene.sqlPlaceholder !== '' && (
                    <ListGroup.Item className="bg-success bg-opacity-25 border-success">
                        <p>
                            <strong>Platzhalter für das Abfragefeld</strong>
                        </p>
                        <SyntaxHighlighter language="sql">
                            {scene.sqlPlaceholder}
                        </SyntaxHighlighter>
                    </ListGroup.Item>
                )
            }
        </ListGroup>
    );
}

function EditableSceneViewHeader({bsVariant, deletable, title, onEdit, onDelete}: {bsVariant: string, deletable: boolean, title: ReactElement, onEdit: () => void, onDelete: () => void}) {
    return (
        <ListGroup.Item className={classNames('editable-scene-view-header', 'd-flex', 'justify-content-between', 'align-items-start', 'bg-'+bsVariant, 'bg-opacity-50', 'border-'+bsVariant)}>
            <p>{title}</p>
            <div>
                <ClickableIcon type='edit' onClick={onEdit} tooltipText='Szene bearbeiten' />
                { deletable && <ClickableIcon type='close' onClick={onDelete} tooltipText='Szene löschen' /> }
            </div>
        </ListGroup.Item>
    );
}

function AddSceneButton({ onAdd }: { onAdd: () => void }) {
    return (
        <div className="add-scene-button">
            <ClickableIcon type={'add'} size={30} onClick={onAdd} tooltipText='Szene hinzufügen' tooltipPlacement='right' />
        </div>
    );
}


////////////
// Modals //
////////////

type SceneType = 'text' | 'image' | 'select' | 'manipulate';

function EditSceneModal ({ initialScene, onHide, onSaveAndHide }: { initialScene: EditableScene | null, onHide: () => void, onSaveAndHide: (scene: EditableScene) => void }) {
    // This state holds the current scene
    // The following invariant holds:
    // `initialScene` is null iff `editedScene` is null
    const [editedScene, setEditedScene] = useState<EditableScene | null>(null);

    const [editType, setEditType] = useState<SceneType | null>(null);

    // This just holds the state for the various tabs
    // - If `null`: Tab is inactive
    // - Otherwise: Tab is active 
    //
    // The following invariant holds:
    // If `initialScene` (and `editedScene`) is not null, then:
    // - exactly one of the following is not null and
    // - all others are null 
    const [initialTextScene, setInitialTextScene] = useState<EditableScene | null>(null);
    const [initialImageScene, setInitialImageScene] = useState<EditableScene | null>(null);
    const [initialSelectScene, setInitialSelectScene] = useState<EditableScene | null>(null);
    const [initialManipulateScene, setInitialManipulateScene] = useState<EditableScene | null>(null);

    useEffect(() => {
        if (initialScene !== null) {
            setEditedScene(initialScene);
            setEditType(initialScene.type);
        }
        else {
            setEditedScene(null);
            setEditType(null);
            setInitialTextScene(null);
            setInitialImageScene(null);
            setInitialSelectScene(null);
            setInitialManipulateScene(null);
        }
    }, [initialScene]);

    useEffect(() => {
        if (editType == 'text') {
            setInitialTextScene(editedScene);
            setInitialImageScene(null);
            setInitialSelectScene(null);
            setInitialManipulateScene(null);
        }
        else if (editType == 'image') {
            setInitialTextScene(null);
            setInitialImageScene(editedScene);
            setInitialSelectScene(null);
            setInitialManipulateScene(null);
        }
        else if (editType == 'select') {
            setInitialTextScene(null);
            setInitialImageScene(null);
            setInitialSelectScene(editedScene);
            setInitialManipulateScene(null);
        }
        else if (editType == 'manipulate') {
            setInitialTextScene(null);
            setInitialImageScene(null);
            setInitialSelectScene(null);
            setInitialManipulateScene(editedScene);
        }
    }, [editType]);

    const handleSave = () => {
        // Assertion holds because the modal is only shown when a scene-to-edit is set
        assert(editedScene !== null);

        onSaveAndHide(editedScene);
    };

    return (
        <EskuelModal show={initialScene !== null} onHide={onHide} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Szene bearbeiten</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form className='form-container'>
                    <ChooseSceneType sceneType={editType} setSceneType={setEditType} />
                    <EditTextSceneTab initialScene={initialTextScene} updateScene={setEditedScene} />
                    <EditImageSceneTab initialScene={initialImageScene} updateScene={setEditedScene} />
                    <EditSelectSceneTab initialScene={initialSelectScene} updateScene={setEditedScene} />
                    <EditManipulateSceneTab initialScene={initialManipulateScene} updateScene={setEditedScene} />
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
        </EskuelModal>
    );
}

function AddSceneModal ({ show, onHide, onSaveAndHide }: { show: boolean, onHide: () => void, onSaveAndHide: (scene: Scene) => void }) {
    // This state holds the current scene
    // The following invariant holds:
    // `show` is false iff `editedScene` is null
    const [editedScene, setEditedScene] = useState<Scene | null>(null);

    const [editType, setEditType] = useState<SceneType | null>(null);

    // This just holds the state for the various tabs
    // - If `null`: Tab is inactive
    // - Otherwise: Tab is active 
    //
    // The following invariant holds:
    // If `show` (and `editedScene`) is true, then:
    // - exactly one of the following is not null and
    // - all others are null
    const [initialTextScene, setInitialTextScene] = useState<Scene | null>(null);
    const [initialImageScene, setInitialImageScene] = useState<Scene | null>(null);
    const [initialSelectScene, setInitialSelectScene] = useState<Scene | null>(null);
    const [initialManipulateScene, setInitialManipulateScene] = useState<Scene | null>(null);

    useEffect(() => {
        if (show) {
            setEditedScene({ type: 'text', text: 'Hier Text einfügen' });
            setEditType('text');
        }
        else {
            setEditedScene(null);
            setEditType(null);
            setInitialTextScene(null);
            setInitialImageScene(null);
            setInitialSelectScene(null);
            setInitialManipulateScene(null);
        }
    }, [show]);

    useEffect(() => {
        if (editType == 'text') {
            setInitialTextScene(editedScene);
            setInitialImageScene(null);
            setInitialSelectScene(null);
            setInitialManipulateScene(null);
        }
        else if (editType == 'image') {
            setInitialTextScene(null);
            setInitialImageScene(editedScene);
            setInitialSelectScene(null);
            setInitialManipulateScene(null);
        }
        else if (editType == 'select') {
            setInitialTextScene(null);
            setInitialImageScene(null);
            setInitialSelectScene(editedScene);
            setInitialManipulateScene(null);
        }
        else if (editType == 'manipulate') {
            setInitialTextScene(null);
            setInitialImageScene(null);
            setInitialSelectScene(null);
            setInitialManipulateScene(editedScene);
        }
    }, [editType]);

    const handleSave = () => {
        // Assertion holds because the modal is only shown when a scene-to-edit is set
        assert(editedScene !== null);

        onSaveAndHide(editedScene);
    };

    return (
        <EskuelModal show={show} onHide={onHide} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Szene hinzufügen</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form className='form-container'>
                    <ChooseSceneType sceneType={editType} setSceneType={setEditType} />
                    <EditTextSceneTab initialScene={initialTextScene} updateScene={setEditedScene} />
                    <EditImageSceneTab initialScene={initialImageScene} updateScene={setEditedScene} />
                    <EditSelectSceneTab initialScene={initialSelectScene} updateScene={setEditedScene} />
                    <EditManipulateSceneTab initialScene={initialManipulateScene} updateScene={setEditedScene} />
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>
                    Schließen
                </Button>
                <Button variant="primary" onClick={handleSave}>
                    Hinzufügen
                </Button>
            </Modal.Footer>
        </EskuelModal>
    );
}

function ChooseSceneType({ sceneType, setSceneType }: { sceneType: SceneType | null, setSceneType: (sceneType: SceneType) => void }) {
    return (
        <Form.Group className='choose-scene-type'>
            <Form.Label><strong>Wähle Szenentyp:</strong></Form.Label>
            <Form.Check
                inline
                type="radio"
                label="Text"
                name="sceneType"
                id="text"
                value="text"
                checked={sceneType === 'text'}
                onChange={() => setSceneType('text')}
            />
            <Form.Check
                inline
                type="radio"
                label="Image"
                name="sceneType"
                id="image"
                value="image"
                checked={sceneType === 'image'}
                onChange={() => setSceneType('image')}
            />
            <Form.Check
                inline
                type="radio"
                label="Select"
                name="sceneType"
                id="select"
                value="select"
                checked={sceneType === 'select'}
                onChange={() => setSceneType('select')}
            />
            <Form.Check
                inline
                type="radio"
                label="Manipulate"
                name="sceneType"
                id="manipulate"
                value="manipulate"
                checked={sceneType === 'manipulate'}
                onChange={() => setSceneType('manipulate')}
            />
        </Form.Group>
    );
}


function EditTextSceneTab<T extends Scene>({ initialScene, updateScene }: { initialScene: T | null, updateScene: (scene: T) => void }) {
    const [editedText, setEditedText] = useState("");

    // Update intial scene every time the `initialScene` prop changes to a
    // non-null value -> the tab is "shown"
    useEffect(() => {
        if (initialScene) {
            // The given scene may be of some other type. In that case, convert.
            if (initialScene.type == 'text' || initialScene.type == 'select' || initialScene.type == 'manipulate') {
                setEditedText(initialScene.text);
            }
        }
    }, [initialScene]);

    // Update scene on:
    // 1) Initially (possibly after conversion)
    // 2) User types something
    useEffect(() => {
        if (initialScene != null) {
            updateScene({ ...initialScene, type: 'text', text: editedText });
        }
    }, [initialScene, editedText]);
    

    return (
        <div style={{ display: initialScene != null ? 'block' : 'none' }}>
            <div className='form-container'>
                <Form.Group>
                    <Form.Label><strong>Text:</strong></Form.Label>
                    <Form.Control
                        as="textarea"
                        rows={8}
                        value={editedText   }
                        onChange={(e) => { setEditedText(e.target.value); }} />
                </Form.Group>
            </div>
        </div>
    );
}

function EditImageSceneTab<T extends Scene>({ initialScene, updateScene }: { initialScene: T | null, updateScene: (scene: T) => void }) {
    const [status, setStatus] = useState<LoadImageSourceStatus>({ kind: 'empty' });

    const [showOpenModal, setShowOpenModal ] = useState(false);

    // Update intial scene every time the `initialScene` prop changes to a
    // non-null value -> the tab is "shown"
    useEffect(() => {
        if (initialScene && initialScene.type == 'image') {
            setStatus({ kind: 'loaded', data: initialScene.base64string} );
        }
    }, [initialScene]);

    // Update scene on:
    // 1) Initially (possibly after conversion)
    // 2) User uploads successfully a new image
    useEffect(() => {
        if (initialScene != null && status.kind === 'loaded') {
            updateScene({ ...initialScene, type: 'image', base64string: status.data });
        }
    }, [initialScene, status]);

    const onSelect = (source: ImageSource) => {
        // Materialize
        const data = materializeBinarySource(source);

        data.then((dataRes) => {
            // Is image fetched correctly?
            if (!dataRes.ok) {
                setStatus({ kind: 'failed', error: dataRes.error });
            }
            else {
                // Is file size within 500KB?
                if (dataRes.data.length > 500*1024) {
                    setStatus({ kind: 'failed', error: { kind: 'file-size-too-large' } });
                }
                else {
                    // Is PNG file valid? Use image-type.
                    const image = new Image();
                    image.src = URL.createObjectURL(new Blob([dataRes.data], { type: 'image/png' }));

                    // If not, place failure
                    image.onerror = () => {
                        setStatus({ kind: 'failed', error: { kind: 'png-file-invalid' } });
                    };
                    image.onload = () => {
                        // Convert to base64
                        const base64string = encodeToBase64(dataRes.data);
                        setStatus({ kind: 'loaded', data: base64string });
                    };
                }
            }
        });
    };

    return (
        <>
            <div style={{ display: initialScene != null ? 'block' : 'none' }}>
                <div className='form-container'>
                    <LoadImageSourcePanel status={status} setSource={onSelect} />
                    {
                        status.kind == 'loaded' && (
                            <UserImage base64string={status.data} /> 
                        )
                    }
                </div>
            </div>
            <OpenImageSourceModal
                providedFileSources={[]}
                show={showOpenModal}
                setShow={setShowOpenModal}
                onOpenFile={onSelect}
            />
        </>
    );
}

function EditSelectSceneTab<T extends Scene>({ initialScene, updateScene }: { initialScene: T | null, updateScene: (scene: T) => void }) {
    const [editedText, setEditedText] = useState("");
    const [editedSqlSol, setEditedSqlSol] = useState("");
    const [editedIsRowOrderRelevant, setEditedIsRowOrderRelevant] = useState(false);
    const [editedIsColOrderRelevant, setEditedIsColOrderRelevant] = useState(false);
    const [editedAreColNamesRelevant, setEditedAreColNamesRelevant] = useState(false);
    const [editedUseSqlPlaceholder, setEditedUseSqlPlaceholder] = useState(false);
    const [editedSqlPlaceholder, setEditedSqlPlaceholder] = useState("");

    // Update intial scene every time the `scene` prop changes -> the tab is "shown"
    useEffect(() => {
        if (initialScene) {
            // The given scene may be of some other type. In that case, convert.
            if (initialScene.type == 'text') {
                setEditedText(initialScene.text);
            }
            else if (initialScene.type == 'select') {
                setEditedText(initialScene.text);
                setEditedSqlSol(initialScene.sqlSol);
                setEditedIsRowOrderRelevant(initialScene.isRowOrderRelevant);
                setEditedIsColOrderRelevant(initialScene.isColOrderRelevant);
                setEditedAreColNamesRelevant(initialScene.areColNamesRelevant);
                setEditedUseSqlPlaceholder(initialScene.sqlPlaceholder != '');
                setEditedSqlPlaceholder(initialScene.sqlPlaceholder);    
            }
            else if (initialScene.type == 'manipulate') {
                setEditedText(initialScene.text);
                setEditedSqlSol(initialScene.sqlSol);
                setEditedUseSqlPlaceholder(initialScene.sqlPlaceholder != '');
                setEditedSqlPlaceholder(initialScene.sqlPlaceholder);    
            }
        }
    }, [initialScene]);

    // Update scene on:
    // 1) Initially (possibly after conversion)
    // 2) User types something
    useEffect(() => {
        if (initialScene != null) {
            updateScene({ ...initialScene, type: 'select', text: editedText, sqlSol: editedSqlSol, sqlPlaceholder: editedSqlPlaceholder, isRowOrderRelevant: editedIsRowOrderRelevant, isColOrderRelevant: editedIsColOrderRelevant, areColNamesRelevant: editedAreColNamesRelevant });
        }

    }, [initialScene, editedText, editedSqlSol, editedIsRowOrderRelevant, editedIsColOrderRelevant, editedAreColNamesRelevant, editedSqlPlaceholder]);

    return (
        <div style={{ display: initialScene != null ? 'block' : 'none' }}>
            <div className='form-container'>
                <div>
                    <label htmlFor={'edit-select-scene-text'} className='mb-2'><strong>Text:</strong></label>
                    <Form.Control
                        id='edit-select-scene-text'
                        as="textarea"
                        rows={5}
                        value={editedText}
                        onChange={(e) => { setEditedText(e.target.value); }} />
                </div>
                <div>
                    <label className='mb-2'><strong>SQL-Lösung:</strong></label>
                    <QueryEditor sql={editedSqlSol} setSql={setEditedSqlSol} height={100}  />
                </div>
                <div>
                    <label className='mb-2'><strong>Optionen:</strong></label>
                    <div className='edit-scene-options'>
                        <Form.Check
                            id={'edit-select-scene-is-row-order-relevant'}
                            type="switch"
                            checked={editedIsRowOrderRelevant}
                            onChange={(e) => { setEditedIsRowOrderRelevant(e.target.checked); }}
                        />
                        <div>
                            <label htmlFor={'edit-select-scene-is-row-order-relevant'}>
                                Zeilen: Reihenfolge für die Lösung relevant?
                            </label>
                        </div>
                        <Form.Check
                            id={'edit-select-scene-is-col-order-relevant'}
                            type="switch"
                            checked={editedIsColOrderRelevant}
                            onChange={(e) => { setEditedIsColOrderRelevant(e.target.checked); }}
                        />
                        <div>
                            <label htmlFor={'edit-select-scene-is-col-order-relevant'}>
                                Spalten: Reihenfolge für die Lösung relevant?
                            </label>
                        </div>
                        <Form.Check
                            id={'edit-select-scene-are-col-names-relevant'}
                            type="switch"
                            checked={editedAreColNamesRelevant}
                            onChange={(e) => { setEditedAreColNamesRelevant(e.target.checked); }}
                        />
                        <div>
                            <label htmlFor={'edit-select-scene-are-col-names-relevant'}>
                                Spalten: Bezeichnungen für die Lösung relevant?
                            </label>
                        </div>
                        <Form.Check
                            id={'edit-select-scene-use-sql-placeholder'}
                            type="switch"
                            checked={editedUseSqlPlaceholder}
                            onChange={(e) => {
                                if (!e.target.checked) {
                                    setEditedSqlPlaceholder('');
                                }
                                setEditedUseSqlPlaceholder(e.target.checked);
                            }}
                        />
                        <div>
                            <Form.Group>
                                <label htmlFor={'edit-select-scene-use-sql-placeholder'} className='mb-2'>Platzhalter für die Eingabe in das Abfragefeld</label>
                                { editedUseSqlPlaceholder &&
                                    <QueryEditor sql={editedSqlPlaceholder} setSql={setEditedSqlPlaceholder} height={100}  />
                                }
                            </Form.Group>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function EditManipulateSceneTab<T extends Scene>({ initialScene, updateScene }: { initialScene: T | null, updateScene: (scene: T) => void }) {
    const [editedText, setEditedText] = useState("");
    const [editedSqlSol, setEditedSqlSol] = useState("");
    const [editedSqlCheck, setEditedSqlCheck] = useState("");
    const [editedUseSqlPlaceholder, setEditedUseSqlPlaceholder] = useState(false);
    const [editedSqlPlaceholder, setEditedSqlPlaceholder] = useState("");

    // Update intial scene every time the `scene` prop changes -> the tab is "shown"
    useEffect(() => {
        if (initialScene) {
            // The given scene may be of some other type. In that case, convert.
            if (initialScene.type == 'text') {
                setEditedText(initialScene.text);
            }
            else if (initialScene.type == 'select') {
                setEditedText(initialScene.text);
                setEditedSqlSol(initialScene.sqlSol);
                setEditedUseSqlPlaceholder(initialScene.sqlPlaceholder != '');
                setEditedSqlPlaceholder(initialScene.sqlPlaceholder);    
            }
            else if (initialScene.type == 'manipulate') {
                setEditedText(initialScene.text);
                setEditedSqlSol(initialScene.sqlSol);
                setEditedSqlCheck(initialScene.sqlCheck);
                setEditedUseSqlPlaceholder(initialScene.sqlPlaceholder != '');
                setEditedSqlPlaceholder(initialScene.sqlPlaceholder);    
            }
        }
    }, [initialScene]);

    // Update scene on:
    // 1) Initially (possibly after conversion)
    // 2) User types something
    useEffect(() => {
        if (initialScene != null) {
            updateScene({ ...initialScene, type: 'manipulate', text: editedText, sqlSol: editedSqlSol, sqlCheck: editedSqlCheck, sqlPlaceholder: editedSqlPlaceholder });
        }
    }, [initialScene, editedText, editedSqlSol, editedSqlCheck, editedSqlPlaceholder]);

    return (
        <div style={{ display: initialScene != null ? 'block' : 'none' }}>
            <div className='form-container'>
                <div>
                    <label htmlFor={'edit-select-scene-text'} className='mb-2'><strong>Text:</strong></label>
                    <Form.Control
                        id='edit-select-scene-text'
                        as="textarea"
                        rows={5}
                        value={editedText}
                        onChange={(e) => { setEditedText(e.target.value); }} />
                </div>
                <div>
                    <label className='mb-2'><strong>SQL-Lösung:</strong></label>
                    <QueryEditor sql={editedSqlSol} setSql={setEditedSqlSol} height={100}  />
                </div>
                <div>
                    <label className='mb-2'><strong>SQL-Check-Abfrage:</strong></label>
                    <QueryEditor sql={editedSqlCheck} setSql={setEditedSqlCheck} height={100}  />
                </div>
                <div>
                    <label className='mb-2'><strong>Optionen:</strong></label>
                    <div className='edit-scene-options'>
                        <Form.Check
                            id={'edit-manipulate-scene-use-sql-placeholder'}
                            type="switch"
                            checked={editedUseSqlPlaceholder}
                            onChange={(e) => {
                                if (!e.target.checked) {
                                    setEditedSqlPlaceholder('');
                                }
                                setEditedUseSqlPlaceholder(e.target.checked);
                            }}
                        />
                        <div>
                            <Form.Group>
                                <label htmlFor={'edit-manipulate-scene-use-sql-placeholder'} className='mb-2'>Platzhalter für die Eingabe in das Abfragefeld</label>
                                { editedUseSqlPlaceholder &&
                                    <QueryEditor sql={editedSqlPlaceholder} setSql={setEditedSqlPlaceholder} height={100}  />
                                }
                            </Form.Group>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


//////////////////////////////////
// Open and load game db source //
//////////////////////////////////

export type LoadGameDbWidgetStatusEmpty   = { kind: 'empty' };
export type LoadGameDbWidgetStatusPending = { kind: 'pending' };
export type LoadGameDbWidgetStatusLoaded  = { kind: 'loaded', schema: Schema, dbData: DbData };
export type LoadGameDbWidgetStatusFailed  = { kind: 'failed', error: FetchDbFail | InitDbFail | ParseSchemaFail };
export type LoadGameDbWidgetStatus = LoadGameDbWidgetStatusEmpty | LoadGameDbWidgetStatusPending | LoadGameDbWidgetStatusLoaded | LoadGameDbWidgetStatusFailed;

function loadGameDbWidgetStatusToLoadingStatus(status: LoadGameDbWidgetStatus): LoadingStatus {
    if (status.kind === 'empty') {
        return { kind: 'empty' };
    }
    else if (status.kind === 'pending') {
        return { kind: 'pending' };
    }
    else if (status.kind === 'failed' && status.error.kind === 'fetch-db') {
        return { kind: 'failed', error: 'Fehler beim Laden der Datenbank-Datei' };
    }
    else if (status.kind === 'failed' && status.error.kind === 'run-init-script') {
        return { kind: 'failed', error: 'Fehler beim Initialisieren: ' + status.error.details };
    }
    else if (status.kind === 'failed' && status.error.kind === 'read-sqlite-db') {
        return { kind: 'failed', error: 'Fehler beim Lesen der Datenbank: ' + status.error.details };
    } 
    else if (status.kind === 'failed' && status.error.kind === 'parse-schema') {
        return { kind: 'failed', error: 'Fehler beim Lesen des Schemas: ' + status.error.details };
    }
    else {
        return { kind: 'loaded' };
    }
};

function LoadGameDbSourceWidget({status, setSource}: {status: LoadGameDbWidgetStatus, setSource: (source: DbSource) => void}) {

    const [showOpenModal, setShowOpenModal ] = useState(false);

    const onSave = () => {
        if (status.kind === 'loaded') {
            if (status.dbData.type === 'sqlite-db') {
                const blob = new Blob([status.dbData.data], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);

                // Create a temporary link to trigger the download
                const link = document.createElement('a');
                link.href = url;
                link.download = 'datenbank.db'; // Name of the file to be downloaded  //TODO
                document.body.appendChild(link); // Append the link to the document
                link.click(); // Trigger the download

                // Cleanup: remove the link and revoke the Blob URL
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
            else {
                const blob = new Blob([status.dbData.sql], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);

                // Create a temporary link to trigger the download
                const link = document.createElement('a');
                link.href = url;
                link.download = 'datenbank.sql'; // Name of the file to be downloaded  //TODO
                document.body.appendChild(link); // Append the link to the document
                link.click(); // Trigger the download

                // Cleanup: remove the link and revoke the Blob URL
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        }
    };

    return (
        <>
            <div>
                <MultiWidget className={'widget-dbsource'} title={'Datenbank'}>
                    <LoadingBarWithOpenSaveButton setShowOpenModal={setShowOpenModal} tooltipText='Datenbank laden' status={loadGameDbWidgetStatusToLoadingStatus(status)} onSave={onSave} saveTooltipText='Datenbank herunterladen' />
                    {
                        status.kind === 'loaded' && (
                            <div className='widget-dbsource-schema'>
                                <SchemaView schema={status.schema} />
                            </div>
                        )
                    }
                </MultiWidget>
            </div>
            <OpenDbSourceModal
                providedFileSources={[]}
                show={showOpenModal}
                setShow={setShowOpenModal}
                onOpenFile={setSource}
            />
        </>
    );
}


////////////////////////////////
// Open and load image source //
////////////////////////////////

export type LoadImageSourceStatusEmpty   = { kind: 'empty' };
export type LoadImageSourceStatusPending = { kind: 'pending' };
export type LoadImageSourceStatusLoaded  = { kind: 'loaded', data: string };
export type LoadImageSourceStatusFailed  = { kind: 'failed', error: UserImageFail };
export type LoadImageSourceStatus = LoadImageSourceStatusEmpty | LoadImageSourceStatusPending | LoadImageSourceStatusLoaded | LoadImageSourceStatusFailed;

const loadImageSourceStatusToLoadingStatus = function (status: LoadImageSourceStatus): LoadingStatus {
    if (status.kind === 'empty') {
        return { kind: 'empty' };
    }
    else if (status.kind === 'pending') {
        return { kind: 'pending' };
    }
    else if (status.kind === 'failed' && status.error.kind === 'fetch') {
        return { kind: 'failed', error: 'Fehler beim Laden der Datei' };
    }
    else if (status.kind === 'failed' && status.error.kind === 'file-size-too-large') {
        return { kind: 'failed', error: 'Dateigröße überschreitet Limit' };
    }
    else if (status.kind === 'failed' && status.error.kind === 'png-file-invalid') {
        return { kind: 'failed', error: 'Datei entspricht nicht PNG-Dateiformat' };
    }
    else {
        return { kind: 'loaded' };
    }
};

function LoadImageSourcePanel({status, setSource}: {status: LoadImageSourceStatus, setSource: (source: ImageSource) => void}) {

    const [showOpenModal, setShowOpenModal ] = useState(false);

    return (
        <>
            <div>
                <LoadingBarWithOpenButton setShowOpenModal={setShowOpenModal} tooltipText='Bild laden' status={loadImageSourceStatusToLoadingStatus(status)} />
            </div>
            <OpenImageSourceModal
                providedFileSources={[]}
                show={showOpenModal}
                setShow={setShowOpenModal}
                onOpenFile={setSource}
            />
        </>
    );
}
