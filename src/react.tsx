import classNames from "classnames";
import React, { useEffect, useRef, useState } from "react";
import { Button, Card, Form, FormCheck, ListGroup, ListGroupItem, Modal, ModalProps, Table } from "react-bootstrap";
import { ColInfo, Schema, TableInfo } from "./schema";
import { SqlValue } from "sql.js";
import { FileSource, NamedFileSource, assert, getFilenameWithoutExtension } from "./util";
import { Alarm, ArrowsAngleExpand, FiletypeSql, FiletypeXml, Folder2Open, HouseDoor, Pencil, PlusCircle, Save, X } from 'react-bootstrap-icons';
import { GameDatabaseStatus } from "./game-pure";

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

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

type IconType = 'edit' | 'close' | 'open' | 'save' | 'add' | 'home' | 'file-sql' | 'file-xml' | 'expand';

export function Icon({type, size = 15}: {type: IconType, size?: number}) {
    return (
        type === 'edit'     ? <Pencil size={size} /> :
        type === 'close'    ? <X size={size} /> :
        type === 'open'     ? <Folder2Open size={size} /> :
        type === 'save'     ? <Save size={size} /> :
        type === 'add'      ? <PlusCircle size={size} /> :
        type === 'home'     ? <HouseDoor size={size} /> :
        type === 'file-sql' ? <FiletypeSql size={size} /> :
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

type Selection =
    { type: 'provided', fileSource: NamedFileSource } |
    { type: 'uploaded-file' }

export function OpenFileModal({ title, fileUploadTitle, fileIconType, fileAccept, providedFileSources, show, setShow, onOpenFile }: { title: string, fileUploadTitle: string, fileIconType: IconType, fileAccept: string, providedFileSources: NamedFileSource[], show: boolean, setShow: (show: boolean) => void, onOpenFile: (source: NamedFileSource) => void }) {

    const [selection, setSelection] = useState<Selection | null>(null);
    const [uploadedFileContent, setUploadedFileContent] = useState<{content: string, name: string} | null>(null);


    const onOpenClicked = () => {
        assert(selection !== null);

        if (selection.type === 'provided') {
            onOpenFile(selection.fileSource);
        }
        else {
            assert(uploadedFileContent !== null);

            onOpenFile({ type: 'inline', ...uploadedFileContent });
        }

        // Close the modal
        setShow(false);
    }

    const onUploadClicked = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const uploadedFile = e.target.files[0];
            const name = getFilenameWithoutExtension(uploadedFile.name);
            const fileReader = new FileReader();
            fileReader.readAsText(uploadedFile, "UTF-8");
            fileReader.onload = (f) => {
                if (typeof f.target?.result === 'string') {
                    // Assuming setFiles should be setFile
                    setUploadedFileContent({ content: f.target.result, name});
                }
            };
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
                                <Icon type={fileIconType} size={40} />
                            </div>
                        </ListGroupItem>
                    </ListGroup>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => setShow(false)}>
                    Schließen
                </Button>
                <Button variant="primary" onClick={onOpenClicked} disabled={selection === null || (selection.type === 'uploaded-file' && uploadedFileContent === null)}>
                    Laden
                </Button>
            </Modal.Footer>
        </EskuelModal>
    );
}