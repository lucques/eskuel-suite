import classNames from "classnames";
import React, { useState } from "react";
import { Button, Card, Form, ListGroup, Modal, Table } from "react-bootstrap";
import { ColInfo, TableInfo } from "./schema";
import { SqlValue } from "sql.js";
import { FileSource, NamedFileSource, assert, getFilenameWithoutExtension } from "./util";
import { Alarm, Folder2Open, HouseDoor, Pencil, PlusCircle, Save, X } from 'react-bootstrap-icons';


////////////
// Widget //
////////////

export function Widget ({ className, bodyClassName, title, children }: { className?: string, bodyClassName?: string, title: string, children?: React.ReactNode }) {
    return (
        <Card className={classNames('widget', className)}>
            <Card.Header className='widget-header'>
                {title}
            </Card.Header>
            <Card.Body className={bodyClassName}>
                {children}
            </Card.Body>
        </Card>
    );
}


////////////
// Schema //
////////////

export function TableInfoView({tableInfo}: {tableInfo: TableInfo}) {
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

type IconType = 'edit' | 'close' | 'open' | 'save' | 'add' | 'home';

export function Icon({type}: {type: IconType}) {
    if (type == 'edit') {
        return <Pencil />;
    }
    else if (type == 'close') {
        return <X />;
    }
    else if (type == 'open') {
        return <Folder2Open />;
    }
    else if (type == 'save') {
        return <Save />;
    }
    else if (type == 'add') {
        return <PlusCircle />;
    }
    else {
        return <HouseDoor />;
    }
}

export function ClickableIcon({type, onClick, disabled = false}: {type: IconType, onClick: () => void, disabled?: boolean}) {
    return (
        <span className={classNames(['clickable-icon', disabled ? 'disabled': ''])} onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}>
            <Icon type={type} />
        </span>
    )
}

export function IconLinkButton({type, href, disabled = false}: {type: IconType, href: string, disabled?: boolean}) {
    return (
        <a href={href} className={classNames(['clickable-icon-button', 'btn', disabled ? 'disabled': '', 'btn-outline-dark'])}>
            <Icon type={type} />
        </a>
    );
}

export function IconActionButton({type, onClick, disabled = false}: {type: IconType, onClick: () => void, disabled?: boolean}) {
    return (
        <Button className={classNames(['clickable-icon-button', 'btn', disabled ? 'disabled': '', 'btn-outline-dark'])} onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}>
            <Icon type={type} />
        </Button>
    )
}


////////////
// Modals //
////////////

type Selection =
    { type: 'provided', fileSource: NamedFileSource } |
    { type: 'uploaded-file' }

export function OpenModal({ title, fileSources, show, setShow, onOpenFile }: { title: string, fileSources: NamedFileSource[], show: boolean, setShow: (show: boolean) => void, onOpenFile: (source: NamedFileSource) => void }) {

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
        <Modal className="open-modal" show={show} onHide={() => setShow(false)}>
            <Modal.Header closeButton>
                <Modal.Title>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <ListGroup >
                    {
                        fileSources.map((fileSource, i) =>
                        <ListGroup.Item key={i} action active={selection !== null && selection.type === 'provided' && selection.fileSource === fileSource} onClick={() => setSelection({ type: 'provided', fileSource })}>
                            {fileSource.name}
                        </ListGroup.Item>)
                    }
                    <ListGroup.Item action active={selection !== null && selection.type === 'uploaded-file'} onClick={() => setSelection({ type: 'uploaded-file' })}>
                        Datei hochladen
                        <Form.Control type="file" onChange={onUploadClicked} />
                    </ListGroup.Item>
                </ListGroup>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => setShow(false)}>
                    Schließen
                </Button>
                <Button variant="primary" onClick={onOpenClicked} disabled={selection === null || (selection.type === 'uploaded-file' && uploadedFileContent === null)}>
                    Laden
                </Button>
            </Modal.Footer>
        </Modal>
    );
}