import classNames from "classnames";
import React, { useEffect, useRef, useState } from "react";
import { Button, Card, Form, FormCheck, ListGroup, ListGroupItem, Modal, ModalProps, Table } from "react-bootstrap";
import { ColInfo, Schema, TableInfo } from "./schema";
import { SqlValue } from "sql.js";
import { Named, RawSource, assert, getFilenameExtension, getFilenameWithoutExtension } from "./util";
import { Alarm, ArrowsAngleExpand, FileEarmark, FileEarmarkPlus, FiletypeSql, FiletypeXml, Folder2Open, HouseDoor, Pencil, PlusCircle, Save, X } from 'react-bootstrap-icons';
import { GameDatabaseStatus, GameSource } from "./game-pure";

import filetypeDbUrl from './assets/filetype-db.svg';

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { DbSource } from "./sql-js-api";

////////////
// Widget //
////////////

export function Widget({ className, title, children }: { className?: string, title: string, children?: React.ReactNode }) {
    return (
        <Card className={classNames('widget', className)}>
            <Card.Header className='widget-header'>
                {title}
            </Card.Header>
            <Card.Body className='widget-body'>
                {children}
            </Card.Body>
        </Card>
    );
}

export function MultiWidget({ className, title, children }: { className?: string, title: string, children?: React.ReactNode }) {
    return (
        <Card className={classNames('widget', className)}>
            <Card.Header className='widget-header'>
                {title}
            </Card.Header>
            <ListGroup variant="flush">
                {
                    React.Children.map(children, (child, index) =>
                        child != null && (<ListGroup.Item key={index} className='widget-body'>
                            {child}
                        </ListGroup.Item>)
                    )
                }
            </ListGroup>
        </Card>
    );
}


////////////
// Schema //
////////////

export function SchemaView({schema}: {schema: Schema}) {
    return (
        <div className='schema'>
            {
                schema.length === 0 &&
                <div>
                    <p className={'text-center'}><em>(Keine Tabellen vorhanden)</em></p>
                </div>
            }
            <Table>
                <tbody>
                    {
                        schema.map((tableInfo) =>
                            <TableInfoView key={tableInfo.name} tableInfo={tableInfo} />
                        )
                    }
                </tbody>
            </Table>
            <div>
                <small><u>unterstrichen</u>: Primärschlüssel&nbsp;&nbsp;&nbsp;<br/><em>kursiv</em>: Fremdschlüssel</small>
            </div>
        </div>
    );
}

function TableInfoView({tableInfo}: {tableInfo: TableInfo}) {
    const cols = tableInfo.cols.map(
        (col: ColInfo, index: number) =>
            <React.Fragment key={col.name}> 
                <ColInfoView table={tableInfo} col={col} />
                <span>{index < tableInfo.cols.length - 1 ? ', ' : ''}</span>
            </React.Fragment>
    );

    return (
        <tr>
            <td className={'table-name'}>{tableInfo.name}</td>
            <td className={'table-cols'}>
                ({cols})
            </td>
        </tr>
    )
}

function ColInfoView({table, col}: {table: TableInfo, col: ColInfo}) {
    const classes = [];

    if (table.primaryKey.includes(col.name)) {
        classes.push('primary-key');
    }
    if (col.name in table.foreignKeys) {
        classes.push('foreign-key');
    }

    return (
        <span className={classNames(classes)}>{col.name}</span>
    )
}


/////////////////
// SQL Results //
/////////////////

export function ResultTableView({result, className}: {result: initSqlJs.QueryExecResult, className?: string}) {
    const renderCell = (c: SqlValue) => {
        if (c === null) {
            return <i>NULL</i>;
        }
        else {
            return c;
        }
    };

    return (
        <ListGroup.Item className={classNames('results-table-view', className)}>
            <Table bordered striped className='border-dark'>
                <thead>
                    <tr>
                        {result.columns.map((col, i) => <th key={i}>{col}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {result.values.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{renderCell(cell)}</td>)}</tr>)}
                </tbody>
            </Table>
        </ListGroup.Item>
    );
}


/////////////////////
// Clickable icons //
/////////////////////

type IconType = 'edit' | 'close' | 'new' | 'open' | 'save' | 'add' | 'home' | 'file-sql' | 'file-db' | 'file-xml' | 'expand';

export function Icon({type, size = 15}: {type: IconType, size?: number}) {
    return (
        type === 'edit'     ? <Pencil size={size} /> :
        type === 'close'    ? <X size={size} /> :
        type === 'new'      ? <FileEarmarkPlus size={size} /> :
        type === 'open'     ? <Folder2Open size={size} /> :
        type === 'save'     ? <Save size={size} /> :
        type === 'add'      ? <PlusCircle size={size} /> :
        type === 'home'     ? <HouseDoor size={size} /> :
        type === 'file-sql' ? <FiletypeSql size={size} /> :
        type === 'file-db'  ? <img src={filetypeDbUrl} alt="" width={size} height={size} /> :
        type === 'file-xml' ? <FiletypeXml size={size} /> :
        <ArrowsAngleExpand size={size} />
    );
}

export function ClickableIcon({type, onClick, disabled = false, size = 15}: {type: IconType, onClick: () => void, disabled?: boolean, size?: number}) {
    return (
        <span className={classNames(['clickable-icon', disabled ? 'disabled': ''])} onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}>
            <Icon type={type}  size={size} />
        </span>
    )
}

export function IconLinkButton({type, href, disabled = false, size = 15}: {type: IconType, href: string, disabled?: boolean, size?: number}) {
    return (
        <a href={href} className={classNames(['clickable-icon-button', 'btn', disabled ? 'disabled': '', 'btn-outline-dark'])}>
            <Icon type={type} size={size} />
        </a>
    );
}

export function IconActionButton({type, onClick, disabled = false, size = 15}: {type: IconType, onClick: () => void, disabled?: boolean, size?: number}) {
    return (
        <Button className={classNames(['clickable-icon-button', 'btn', disabled ? 'disabled': '', 'btn-outline-dark'])} onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}>
            <Icon type={type} size={size} />
        </Button>
    )
}


////////////
// Editor //
////////////

export const GenericEditor: React.FC<{
    className: string,
    height: string,
    value: string;
    onChange: (value: string) => void;
    options?: monaco.editor.IStandaloneEditorConstructionOptions;
  }> = ({ className, height, value, onChange, options }) => {
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const containerRef = useRef<HTMLDivElement>(null); // For the editor container DOM element

    // Initialize Monaco Editor
    useEffect(() => {
        let editor: monaco.editor.IStandaloneCodeEditor | null = null;
    
        if (containerRef.current) {
          // Initialize Monaco Editor
          editor = monaco.editor.create(containerRef.current, {
            value,
            ...options
          });
    
          editor.onDidChangeModelContent(() => {
            if (editor != null) {
                onChange(editor.getValue());
            }
          });

          editorRef.current = editor;
        }

        return () => {
            // Dispose of the editor instance on component unmount
            if (editor) {
              editor.dispose();
            }
          };
    }, []);

    // Handle value changes
    useEffect(() => {
        if (editorRef.current) {
            const model = editorRef.current.getModel();
            if (model) {
                if (value !== model.getValue()) {
                    editorRef.current.setValue(value);
                }
            }
        }
    }, [value]);

    // Handle options changes
    useEffect(() => {
        if (editorRef.current && options) {
            editorRef.current.updateOptions(options);
        }
    }, [options]);

    return <div ref={containerRef} className={className} style={{ height, width: '100%' }} />;
  };
  
export function QueryEditor({ sql, setSql, height, disabled = false, ...restProps }: { sql: string, setSql: (sql: string) => void, height: number, disabled?: boolean, [key: string]: any }) {
    const [editorHeight, setEditorHeight] = useState(height); // Startgröße
    const resizeRef = useRef<HTMLDivElement>(null);

    const startResize = (event: React.MouseEvent) => {
        const startY = event.clientY;
        const startHeight = editorHeight;
    
        const doDrag = (e: MouseEvent) => {
          const newHeight = startHeight + e.clientY - startY;
          setEditorHeight(newHeight);
        };
    
        const stopDrag = () => {
          document.documentElement.removeEventListener('mousemove', doDrag);
          document.documentElement.removeEventListener('mouseup', stopDrag);
        };
    
        document.documentElement.addEventListener('mousemove', doDrag, false);
        document.documentElement.addEventListener('mouseup', stopDrag, false);
      };
    

    return (
        <div className='query-editor' style={{ height: `${editorHeight}px` }}>
            <GenericEditor
                className='form-control'
                height={`${editorHeight}px`}
                options={
                    {
                        fontSize: 18,
                        lineNumbers: 'off',
                        showFoldingControls: 'never',
                        minimap: { enabled: false },
                        automaticLayout: true,
                        readOnly: disabled,
                        stickyScroll: { enabled: false },
                        language: 'sql'
                    }
                }
                value={sql}
                onChange={(value) => { setSql(value ?? ''); }}
                {...restProps}
            />
            <div
                ref={resizeRef}
                onMouseDown={startResize}
                className="query-editor-resize-handle" />
        </div>
    );
}


////////////
// Modals //
////////////

export const EskuelModal: React.FC<ModalProps> = (props) => {    
    return <Modal {...props} className={`eskuel ${props.className || ''}`.trim()} />;
};

type Selection<T> =
    { type: 'provided', fileSource: Named<T> } |
    { type: 'uploaded-file' }

export function OpenFileModal<T>({ title, fileUploadTitle, fileIconTypes, fileAccept, show, setShow, providedFileSources, fileToSource, onOpenFile }: {
    title: string,
    fileUploadTitle: string,
    fileIconTypes: IconType[],
    fileAccept: string,
    show: boolean,
    setShow: (show: boolean) => void,
    providedFileSources: Named<T>[],
    fileToSource: (file: File) => Promise<T>,
    onOpenFile: (source: Named<T>) => void
}) {
    const [selection, setSelection] = useState<Selection<T> | null>(null);
    const [uploadedNamedSource, setUploadedNamedSource] = useState<Named<T> | null>(null);

    const onOpenClicked = () => {
        assert(selection !== null);

        if (selection.type === 'provided') {
            onOpenFile(selection.fileSource);
        }
        else {
            assert(uploadedNamedSource !== null);

            onOpenFile(uploadedNamedSource);
        }

        // Close the modal
        setShow(false);
    }

    const onUploadClicked = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const uploadedFile = e.target.files[0];
            const name = getFilenameWithoutExtension(uploadedFile.name);
            fileToSource(uploadedFile).then(source => setUploadedNamedSource({ ...source, name }));
        }
    }

    return (
        <EskuelModal className="open-modal" show={show} onHide={() => setShow(false)}>
            <Modal.Header closeButton>
                <Modal.Title>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <ListGroup>
                        {
                            providedFileSources.map((fileSource, i) =>
                                <ListGroupItem key={i} onClick={() => setSelection({ type: 'provided', fileSource })}>
                                    <Form.Check>
                                        <FormCheck.Label>
                                            <FormCheck.Input
                                                type='radio'
                                                checked={selection !== null && selection.type === 'provided' && selection.fileSource === fileSource}
                                                onChange={() => setSelection({ type: 'provided', fileSource })}
                                                />
                                            {fileSource.name}
                                        </FormCheck.Label>
                                    </Form.Check>
                                </ListGroupItem>
                            )
                        }
                        <ListGroupItem key={providedFileSources.length} onClick={() => setSelection({ type: 'uploaded-file' })} className='open-file-radio'>
                            <div className="open-file-radio-form flex-fill">
                                <Form.Check>
                                    <FormCheck.Label>
                                        <FormCheck.Input
                                            type='radio'
                                            checked={selection !== null && selection.type === 'uploaded-file'}
                                            onChange={() => setSelection({ type: 'uploaded-file' })}
                                            />
                                        <strong>{fileUploadTitle}</strong>
                                    </FormCheck.Label>
                                    <Form.Control type="file" accept={fileAccept} onChange={onUploadClicked} className='open-file-radio-control' />
                                </Form.Check>
                            </div>
                            <div className="open-file-radio-icon">
                                {
                                    fileIconTypes.map((fileIconType, i) =>
                                        <Icon key={i} type={fileIconType} size={40} />
                                    )
                                }
                            </div>
                        </ListGroupItem>
                    </ListGroup>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => setShow(false)}>
                    Schließen
                </Button>
                <Button variant="primary" onClick={onOpenClicked} disabled={selection === null || (selection.type === 'uploaded-file' && uploadedNamedSource === null)}>
                    Laden
                </Button>
            </Modal.Footer>
        </EskuelModal>
    );
}

export function OpenDbFileModal({ show, setShow, providedFileSources, onOpenFile }: {
    show: boolean,
    setShow: (show: boolean) => void,
    providedFileSources: Named<DbSource>[],
    onOpenFile: (source: Named<DbSource>) => void
}) {
    return (
        <OpenFileModal
            title="Datenbank laden"
            fileUploadTitle='Datenbankdatei hochladen'
            fileIconTypes={['file-sql', 'file-db']}
            fileAccept='.sql, .db, .db3, .sqlite, .sqlite3, .s3db, .sl3'
            show={show}
            setShow={setShow}
            providedFileSources={providedFileSources}
            fileToSource={function (file: File): Promise<DbSource> {
                const fileReader = new FileReader();

                return new Promise((resolve, reject) => {
                    const fileExtension = getFilenameExtension(file.name);

                    if (fileExtension === 'sql') {
                        fileReader.onload = (f) => {
                            assert(typeof f.target?.result === 'string');
                            resolve({ type: 'initial-sql-script', source: { type: 'inline', content: f.target.result } });
                        };
                        fileReader.readAsText(file, "UTF-8");
                    }
                    else {
                        fileReader.onload = (f) => {
                            assert(f.target?.result instanceof ArrayBuffer);
                            resolve({ type: 'sqlite-db', source: { type: 'inline', content: new Uint8Array(f.target.result) } });
                        };
                        fileReader.readAsArrayBuffer(file);
                    }
                });
            } }
            onOpenFile={onOpenFile} />
    );
}

export function OpenGameFileModal({ show, setShow, providedFileSources, onOpenFile }: {
    show: boolean,
    setShow: (show: boolean) => void,
    providedFileSources: Named<GameSource>[],
    onOpenFile: (source: Named<GameSource>) => void
}) {
    return (
        <OpenFileModal
            title="Spiel laden"
            fileUploadTitle='Spieldatei hochladen'
            fileIconTypes={['file-xml']}
            fileAccept='.xml'
            show={show}
            setShow={setShow}
            providedFileSources={providedFileSources}
            fileToSource={
                function (file: File): Promise<GameSource> {
                    const fileReader = new FileReader();

                    return new Promise((resolve, reject) => {
                        fileReader.onload = (f) => {
                            assert(typeof f.target?.result === 'string');
                            resolve({ type: 'xml', source: { type: 'inline', content: f.target.result } });
                        };
                        fileReader.readAsText(file, "UTF-8");
                    });
                }
            }
            onOpenFile={onOpenFile}
        />
    );
}

export function NewGameFileModal<T>({ show, setShow, onCreate }: {
    show: boolean,
    setShow: (show: boolean) => void,
    onCreate: (name: string) => void
}) {
    const [filename, setFilename] = useState("Unbenannt");

    const onCreateClicked = () => {
        assert(filename !== '');

        onCreate(filename);

        // Close the modal
        setShow(false);
    }

    return (
        <EskuelModal className="new-modal" show={show} onHide={() => setShow(false)}>
            <Modal.Header closeButton>
                <Modal.Title>Neues Spiel</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <div>
                        <label htmlFor={'new-game-name'} className='mb-2'><strong>Name:</strong></label>
                        <Form.Control
                            id='new-game-name'
                            type="text"
                            value={filename}
                            onChange={(e) => { setFilename(e.target.value); }} />
                    </div>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => setShow(false)}>
                    Schließen
                </Button>
                <Button variant="primary" onClick={onCreateClicked} disabled={filename === ''}>
                    Erstellen
                </Button>
            </Modal.Footer>
        </EskuelModal>
    );
}