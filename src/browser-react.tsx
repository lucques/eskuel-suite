import React, { useEffect, useState } from 'react';
import { Button, CloseButton, ListGroup } from 'react-bootstrap';
import GridLayout from "react-grid-layout";
import { Tab, TabList, TabPanel, Tabs } from 'react-tabs';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { BrowserInstance, Status, statusToLoadingStatus } from './browser-instance';
import { SqlResult, sqlResultHash, DbSource } from "./sql-js-api";
import { Named, assert } from "./util";
import { Widget, ResultTableView, ClickableIcon, IconActionButton, IconLinkButton, SchemaView, QueryEditor, OpenDbSourceModal, LoadingBar } from './react';
import { SchemaStatus, schemaStatusToLoadingStatus } from './game-pure';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'react-tabs/style/react-tabs.css';
import './screen.css';

//////////////////////
// React components //
//////////////////////

export function MultiBrowserComponentView({initialInstances, fileSources}: {initialInstances: BrowserInstance[], fileSources: Named<DbSource>[]}) {

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

    const onAddInstance = (source: Named<DbSource>) => {
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
            <MultiInstanceBrowserHeaderView fileSources={fileSources} viewedInstanceIndex={viewedInstanceIndex} onSelect={onAddInstance} />
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

function MultiInstanceBrowserHeaderView({fileSources, viewedInstanceIndex, onSelect}: {fileSources: Named<DbSource>[], viewedInstanceIndex: number | null, onSelect: (source: Named<DbSource>) => void}) {

    const [showOpenModal, setShowOpenModal ] = useState(false);

    return (
        <>
            <div className="header">
                <ul className="header-meta list-group list-group-horizontal">
                    <li className="header-name list-group-item">
                        <strong>SQL-Browser</strong>
                    </li>
                    <li className="header-toolbox list-group-item flex-fill">
                        <IconActionButton type='open' onClick={() => setShowOpenModal(true)} tooltipText='Datenbank öffnen' />
                        {
                            // Disabled: Edit should not be possible anymore.
                            // TODO: Remove functionality (= currently dead code)
                            /* <IconActionButton type='edit' onClick={() => { if(viewedInstanceIndex !== null) { onEditStart(viewedInstanceIndex); } }} disabled={viewedInstanceIndex === null} /> */
                        }
                    </li>
                    <li className="header-home list-group-item">
                        <IconLinkButton type='home' href="../" tooltipText='Hauptmenü' />
                    </li>
                </ul>
            </div>
            <OpenDbSourceModal
                providedFileSources={fileSources}
                show={showOpenModal}
                setShow={setShowOpenModal}
                onOpenFile={onSelect}
            />
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
            {
                status.kind != 'active' &&
                    <LoadingBar status={statusToLoadingStatus(status)} />
            }
            {
                status.kind === 'active' &&
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
            }
        </>
    );
}

function QueryWidget({status, onSubmit}: {status: Status, onSubmit: (sql: string) => void}) {
    const [sql, setSql] = useState('SELECT * FROM fahrlehrer');

    return (
        <Widget className={'widget-query'} title="SQL-Abfrage">
            <QueryEditor sql={sql} setSql={setSql} height={170} />
            <div>
                <Button variant="primary" onClick={() => { onSubmit(sql); }} disabled={status.kind !== 'active'}>Ausführen</Button>
            </div>
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
            { result.length === 0 ? <ListGroup.Item className='text-center'><em>(Ergebnis enthält keine Zeilen)</em></ListGroup.Item> : null }
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


/////////////////
// Schema view //
/////////////////

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
            // Failed to parse
            else {
                // Assertion holds because schema widget is only visible when db is active
                assert(schemaResult.error.kind === 'parse-schema');

                setSchemaStatus({ kind: 'failed', error: schemaResult.error });
            }
        });
    }, [status]);

    return (
        <Widget className={'widget-schema'} title={'Schema'}>
            {
                schemaStatus.kind != 'loaded' &&
                    <LoadingBar status={schemaStatusToLoadingStatus(schemaStatus)} />
            }
            {
                schemaStatus.kind === 'loaded' &&
                    <SchemaView schema={schemaStatus.data} />
            }
        </Widget>
    );
}
