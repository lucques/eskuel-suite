// React
import React, { useEffect, useState } from 'react';

// React-Bootstrap
import { Alert, Button, Card, CloseButton, Form, ListGroup, Modal, Table} from 'react-bootstrap';

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

// Local
import { ColInfo, Schema, TableInfo } from './schema';
import { BrowserInstance, Status } from './browser-instance';
import { RunInitScriptFail, FetchInitScriptFail, SqlResult, ParseSchemaFail, sqlResultHash } from "./sql-js-api";

import { FileSource, NamedFileSource, assert } from "./util";
import { TableInfoView, Widget, ResultTableView, ClickableIcon, OpenModal, IconActionButton, IconLinkButton } from './react';


//////////////////////
// React components //
//////////////////////

export function MultiBrowserComponentView({initialInstances, fileSources}: {initialInstances: BrowserInstance[], fileSources: NamedFileSource[]}) {

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

    const [status, setStatus] = useState<Status[]>(instances.map((inst: BrowserInstance) => inst.getStatus()));
    const updateStatus = () => { setStatus(instances.map((inst: BrowserInstance) => inst.getStatus())); }
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
        const newInstance = new BrowserInstance(source.name, source);
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


    ///////////////////
    // Edit instance //
    ///////////////////

    // Index of the instance currently being edited or `null` if none is being edited
    const [editedInstanceIndex, setEditedInstanceIndex] = useState<number | null>(null);

    const onEditStart = (index: number) => {
        // Start edit mode
        setEditedInstanceIndex(index);
    };
    const onEditEnd = () => {
        // End edit mode
        setEditedInstanceIndex(null);
    };
    const onEditEndWithSave = (name: string, sql: string) => {
        // Assertion holds by UI design
        assert(editedInstanceIndex !== null);

        // Mutate the instance; thereby invalidate schema
        instances[editedInstanceIndex].setName(name);
        instances[editedInstanceIndex].setInitialSqlScript(sql);

        // Now update status
        updateStatusForSingle(editedInstanceIndex);

        // Update currently viewed inst if it was just edited
        // (part of the above-described hack)
        if (editedInstanceIndex === viewedInstanceIndex) {
            viewedInstanceIndexChanged();
        }

        // End edit mode
        setEditedInstanceIndex(null);
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
                <BrowserInstanceView instance={instance} status={status} />
            </TabPanel>
        );
    });

    return (
        <>
            <MultiInstanceBrowserHeaderView fileSources={fileSources} viewedInstanceIndex={viewedInstanceIndex} onEditStart={onEditStart} onSelect={onAddInstance} />
            <div>
                <Tabs selectedIndex={viewedInstanceIndex ?? 0} onSelect={(index) => { setViewedInstanceIndex(index); setViewedInstanceCounter(viewedInstanceCounter+1); }} forceRenderTabPanel={true}>
                    <TabList className='tabbed-header'>
                        {tabs}
                    </TabList>
                    {panels}
                </Tabs>
            </div>
            <EditDbModal instance={editedInstanceIndex !== null ? instances[editedInstanceIndex] : null} onHide={onEditEnd} onSaveAndHide={onEditEndWithSave} />
        </>
    );
}

function MultiInstanceBrowserHeaderView({fileSources, viewedInstanceIndex, onEditStart, onSelect}: {fileSources: NamedFileSource[], viewedInstanceIndex: number | null, onEditStart: (index: number) => void, onSelect: (source: NamedFileSource) => void}) {

    const [showOpenModal, setShowOpenModal ] = useState(false);

    return (
        <>
            <div className="header">
                <ul className="header-meta list-group list-group-horizontal">
                    <li className="header-name list-group-item"><strong>SQL-Browser</strong></li>
                    <li className="header-toolbox list-group-item flex-fill">
                        <IconActionButton type='open' onClick={() => setShowOpenModal(true)} />
                        <IconActionButton type='edit' onClick={() => { if(viewedInstanceIndex !== null) { onEditStart(viewedInstanceIndex); } }} disabled={viewedInstanceIndex === null} />
                    </li>
                    <li className="header-home list-group-item">
                        <IconLinkButton type='home' href="../" />
                    </li>
                </ul>
                <OpenModal title="Datenbank laden" fileSources={fileSources} show={showOpenModal} setShow={setShowOpenModal} onOpenFile={onSelect} />
            </div>             
        </>
    );
}

function BrowserInstanceView({instance, status}: {instance: BrowserInstance, status: Status}) {

    /////////////
    // Results //
    /////////////
    const [results, setResults] = useState<SqlResult[]>([]);

    const removeResult = (result: SqlResult) => {
        setResults(results.filter((r) => sqlResultHash(r) !== sqlResultHash(result)));
    };


    //////////////////
    // User actions //
    //////////////////

    const onQuerySubmit = (sql: string) => {
        instance.exec(sql).then(result => {
            // Assertion holds because query button is only enabled when status is "succ"
            // TODO there is a minute chance an error gets thrown, handle later.
            assert(result.ok);

            setResults((results) => [result.data, ...results]);
        });
    };



    ///////////////
    // Rendering //
    ///////////////

    const [layout, setLayout] = useState([
        { i: "query", x: 0, y: 0, w: 5, h: 8 },
        { i: "schema", x: 0, y: 8, w: 5, h: 8 },
        { i: "results", x: 5, y: 0, w: 7, h: 16 }
    ]);

    return (
        <>
            <StatusView status={status} />
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
                <div key="query">
                    <QueryWidget status={status} onSubmit={onQuerySubmit} />
                </div>
                <div key="schema">
                    <SchemaWidget instance={instance} status={status} />
                </div>
                <div key="results">
                    <ResultsWidget results={results} removeResult={removeResult} />
                </div>
            </GridLayout>
        </>
    );
}

function StatusView({status}: {status: Status}) {
    if (status.kind === 'pending') {
        return (
            <Alert className="status-view" variant="warning">
                Lade...
            </Alert>
        );
    }
    else if (status.kind === 'failed' && status.error.kind === 'fetch-init-script') {
        return (
            <Alert className="status-view" variant="danger">
                Fehler beim Laden der Skript-Datei <code>{status.error.url}</code>
            </Alert>
        );
    }
    else if (status.kind === 'failed' && status.error.kind === 'run-init-script') {
        return (
            <Alert className="status-view" variant="danger">
                Fehler beim Ausführen des Initial-SQL-Skripts: {status.error.details}
            </Alert>
        );
    }
}

function QueryWidget({status, onSubmit}: {status: Status, onSubmit: (sql: string) => void}) {
    const [sql, setSql] = useState('SELECT * FROM kunde');

    return (
        <Widget className={'widget-query'} title="SQL-Abfrage">
            <div className={'widget-query-editor'}>
                <Form.Control
                    as="textarea"
                    rows={6}
                    value={sql}
                    onChange={(e) => { setSql(e.target.value); }} />

            </div>
            <Button variant="primary" onClick={() => { onSubmit(sql); }} disabled={status.kind !== 'active'}>Ausführen</Button>
        </Widget>
    );

    // <Editor
    //     height="100%"
    //     language="sql"
    //     onChange={(value, event) => { setSql(value ?? ''); }}
    //     value={sql}
    //     options={
    //         {
    //             fontSize: 20,
    //             lineNumbers: 'off',
    //             minimap: { enabled: false },
    //             automaticLayout: true,
    //             readOnly: false
    //         }
    //     } />
}

type SchemaStatusPending = { kind: 'pending' };
type SchemaStatusLoaded  = { kind: 'loaded', data: Schema };
type SchemaStatusFailed  = { kind: 'failed', error: FetchInitScriptFail | RunInitScriptFail | ParseSchemaFail };
type SchemaStatus        = SchemaStatusPending | SchemaStatusLoaded | SchemaStatusFailed;

function SchemaWidget({instance, status}: {instance: BrowserInstance, status: Status}) {
    const [schemaStatus, setSchemaStatus] = useState<SchemaStatus>( { kind: 'pending' } );

    // Update the schema status when the inst status changes
    useEffect(() => {
        setSchemaStatus({ kind: 'pending' });

        instance.getSchema().then((schemaResult) => {
            // Success
            if (schemaResult.ok) {
                setSchemaStatus({ kind: 'loaded', data: schemaResult.data });
            }
            // Failure (various options)
            else {
                setSchemaStatus({ kind: 'failed', error: schemaResult.error });
            }
        });
    }, [status]);

    return (
        <Widget className={'widget-schema'} title={'Schema'}>
            {schemaStatus.kind === 'pending' ? (
                <p className='schema-status'>Lade...</p>
            )
            : schemaStatus.kind === 'failed' ? (
                schemaStatus.error.kind === 'parse-schema' ? (
                    <p className='schema-status'>Fehler beim Einlesen des Schemas: {schemaStatus.error.details}</p>
                )
                : (
                    <p className='schema-status'>Datenbankfehler</p>
                )
            ) : (
                <Table>
                    <tbody>
                        {
                            schemaStatus.data.map((tableInfo) =>
                                <TableInfoView key={tableInfo.name} tableInfo={tableInfo} />
                            )
                        }
                    </tbody>
                </Table>
            )}
        </Widget>
    );
}

function ResultsWidget ({ results, removeResult }: {results: SqlResult[], removeResult: (result: SqlResult) => void }) {
    const resultViews = results.map((result) => {
        const onClose = () => { removeResult(result); }

        return <ResultView key={sqlResultHash(result)} result={result} onClose={onClose} />;
    });

    return (
        <Widget className={'widget-results'} title={'Ergebnisse'}>
            {resultViews}
        </Widget>
    );
}

function ResultView({result, onClose}: {result: SqlResult, onClose: () => void}) {
    if (result.type === 'succ') {
        return <ResultSuccessView sql={result.sql} result={result.result} onClose={onClose} />;
    }
    else {
        return <ResultErrorView sql={result.sql} message={result.message} onClose={onClose} />;
    }
}

function ResultSuccessView({sql, result, onClose}: {sql: string, result: initSqlJs.QueryExecResult[], onClose: () => void}) {
    return (
        <ListGroup className="result-view">
            <ListGroup.Item className="d-flex justify-content-between align-items-start bg-success bg-opacity-25">
                <SyntaxHighlighter language="sql">
                    {sql}
                </SyntaxHighlighter>
                <CloseButton onClick={onClose} />
            </ListGroup.Item>
            {result.map((r, i) => <ResultTableView key={i} result={r} />)}
        </ListGroup>
    );
}

function ResultErrorView({sql, message, onClose}: {sql: string, message: string, onClose: () => void}) {
    return (
        <ListGroup className="result-view">
            <ListGroup.Item className="d-flex justify-content-between align-items-start bg-danger bg-opacity-25">
                <SyntaxHighlighter language="sql">
                    {sql}
                </SyntaxHighlighter>
                <CloseButton onClick={onClose} />
            </ListGroup.Item>
            <ListGroup.Item>
                <p><strong>Fehlermeldung:</strong> {message}</p>
            </ListGroup.Item>
        </ListGroup>
    );
}


////////////
// Modals //
////////////

export function EditDbModal ({ instance, onHide, onSaveAndHide }: { instance: BrowserInstance | null, onHide: () => void, onSaveAndHide: (name: string, sql: string) => void }) {
    const [editedName, setEditedName] = useState("");
    const [editedSql,  setEditedSql]  = useState("");

    const handleShow = () => {
        // Assertion holds because the modal is only shown when an instance-to-edit is set
        assert(instance !== null);

        setEditedName(instance.getName());
        instance.getInitialSqlScript().then((sqlResult) => {
            // Success
            if (sqlResult.ok) {
                setEditedSql(sqlResult.data);
            }
            // Fetch failure
            else {
                // Handle by setting empty string
                setEditedSql('-- SQL-Skript konnte nicht geladen werden.');
            }
        });
    }

    const handleSave = () => {
        onSaveAndHide(editedName, editedSql);
    };

    return (
        <Modal className="edit-db-modal" show={instance !== null} onHide={onHide} onShow={handleShow} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Datenbank bearbeiten</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <Form.Group>
                        <Form.Label>Name:</Form.Label>
                        <Form.Control
                            type="text"
                            value={editedName}
                            onChange={(e) => setEditedName( e.target.value )}
                        />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label>Initiales SQL-Skript:</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={14}
                            value={editedSql}
                            onChange={(e) => { setEditedSql(e.target.value); }} />
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

    // <Editor
    // height="450px"
    // language="sql"
    // onChange={(value, event) => { setEditedSql(value ?? ''); }}
    // value={editedSql}
    // options={
    //     {
    //         fontSize: 20,
    //         lineNumbers: 'off',
    //         minimap: { enabled: false },
    //         automaticLayout: true,
    //         readOnly: false
    //     }
    // } />
}