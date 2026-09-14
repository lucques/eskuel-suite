import type { TFunction } from 'i18next';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { type ChangeEvent, useEffect, useId, useRef, useState } from 'react';
import { Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import type { OrdinaryHint, Scene } from '../../../game/model';
import { detectImageMediaType, imagePixelLimitFailure, readImageDimensions } from '../../../game/image';
import type { ImageDimensions, ImageMediaType, ImageResourceLimitFail } from '../../../game/image';
import { Base64Image } from '../../../gui-helpers/base64-image/Base64Image';
import { formatFileSize } from '../../../gui-helpers/file-size';
import { SqlEditor } from '../../../gui-helpers/code-editor/SqlEditor';
import { BareIconButton } from '../../../gui-helpers/bare-icon-button/BareIconButton';
import { SourceStatusPanelWithOpenButton } from '../../../gui-helpers/source-status-panel/SourceStatusPanel';
import type { LoadingStatus } from '../../../gui-helpers/source-status-panel/SourceStatusPanel';
import { useSettings } from '../../../settings/settings';
import {
    decodeFromBase64,
    encodeToBase64,
    type ImageSource,
    materializeBinarySource,
    type UserImageFail,
} from '../../../util';
import { SubtleButton } from '../../../gui-helpers/subtle-button/SubtleButton';
import { prepareImageForEmbedding } from '../image-processing';
import type { ImagePreparationFail } from '../image-processing';
import styles from '../view.module.css';

type EditableOrdinaryHint = {
    key: string,
    ordinaryHint: OrdinaryHint,
};

let nextEditableOrdinaryHintKey = 0;

function createEditableOrdinaryHints(ordinaryHints: OrdinaryHint[]): EditableOrdinaryHint[] {
    return ordinaryHints.map(ordinaryHint => ({
        key: `ordinary-hint-${nextEditableOrdinaryHintKey++}`,
        ordinaryHint,
    }));
}

export function EditTextSceneTab<T extends Scene>({ initialScene, updateScene }: {
    initialScene: T | null,
    updateScene: (scene: T) => void,
}) {
    const { t } = useTranslation('game-editor');
    const [editedText, setEditedText] = useState('');

    useEffect(() => {
        if (initialScene) {
            if (initialScene.type === 'text' || initialScene.type === 'select' || initialScene.type === 'manipulate') {
                setEditedText(initialScene.text);
            }
        }
    }, [initialScene]);

    useEffect(() => {
        if (initialScene !== null) {
            updateScene({ ...initialScene, type: 'text', text: editedText });
        }
    }, [initialScene, editedText, updateScene]);

    return (
        <div style={{ display: initialScene !== null ? 'block' : 'none' }}>
            <div className={styles.formContainer}>
                <Form.Group>
                    <Form.Label><strong>{t('scene_text_label')}</strong></Form.Label>
                    <Form.Control
                        as='textarea'
                        rows={8}
                        value={editedText}
                        onChange={event => setEditedText(event.target.value)}
                    />
                    <Form.Text>{t('scene_text_formatting_help')}</Form.Text>
                </Form.Group>
            </div>
        </div>
    );
}

export type ImageSceneFormCommitState = 'ready' | 'pending' | 'invalid';

export function EditImageSceneTab<T extends Scene>({ initialScene, updateScene, onCommitStateChange }: {
    initialScene: T | null,
    updateScene: (scene: T) => void,
    onCommitStateChange: (state: ImageSceneFormCommitState) => void,
}) {
    const { settings } = useSettings();
    const [status, setStatus] = useState<ImageSourceStatus>({ kind: 'empty' });
    const imageSelectionIdRef = useRef(0);

    useEffect(() => {
        imageSelectionIdRef.current++;
        if (initialScene && initialScene.type === 'image') {
            const loadedImage = loadedImageDataFromBase64(
                initialScene.base64string,
                initialScene.mediaType,
            );
            if (loadedImage === null) {
                setStatus({ kind: 'failed', error: { kind: 'image-file-invalid' } });
                onCommitStateChange('invalid');
            }
            else {
                setStatus({ kind: 'loaded', data: loadedImage });
                onCommitStateChange('ready');
            }
        }
        else if (initialScene !== null) {
            onCommitStateChange('invalid');
        }
    }, [initialScene, onCommitStateChange]);

    useEffect(() => {
        if (initialScene !== null && status.kind === 'loaded') {
            updateScene({
                ...initialScene,
                type: 'image',
                base64string: status.data.base64string,
                mediaType: status.data.mediaType,
            });
            onCommitStateChange('ready');
        }
    }, [initialScene, status, updateScene, onCommitStateChange]);

    const failSelection = (error: ImageSourceStatusFailed['error'], selectionId: number) => {
        if (imageSelectionIdRef.current === selectionId) {
            setStatus({ kind: 'failed', error });
            onCommitStateChange('invalid');
        }
    };

    const onSelect = (source: ImageSource, selectionId: number) => {
        const maxSourceBytes = source.type === 'fetch'
            ? Math.min(settings.maxImageInputFileBytes, settings.maxFetchedSourceBytes)
            : settings.maxImageInputFileBytes;
        const data = materializeBinarySource(
            source,
            maxSourceBytes,
        );

        data.then(dataRes => {
            if (imageSelectionIdRef.current === selectionId) {
                if (!dataRes.ok) {
                    failSelection(dataRes.error, selectionId);
                }
                else if (dataRes.data.length > settings.maxImageInputFileBytes) {
                    failSelection({ kind: 'file-size-too-large' }, selectionId);
                }
                else {
                    const mediaType = detectImageMediaType(dataRes.data);
                    if (mediaType === null) {
                        failSelection({ kind: 'image-file-invalid' }, selectionId);
                    }
                    else {
                        const dimensions = readImageDimensions(dataRes.data, mediaType);
                        if (dimensions === null) {
                            failSelection({ kind: 'image-file-invalid' }, selectionId);
                        }
                        else {
                            const pixelLimitFailure = imagePixelLimitFailure(dimensions, {
                                maxImageFileBytes: settings.maxImageInputFileBytes,
                                maxImagePixels: settings.maxImageInputPixels,
                            });
                            if (pixelLimitFailure !== null) {
                                failSelection(pixelLimitFailure, selectionId);
                            }
                            else {
                                prepareImageForEmbedding(dataRes.data, mediaType, dimensions, {
                                    maxImageFileBytes: settings.maxImageFileBytes,
                                    maxImageWidth: settings.maxImageWidth,
                                    maxImageHeight: settings.maxImageHeight,
                                }).then(prepared => {
                                    if (imageSelectionIdRef.current === selectionId) {
                                        if (!prepared.ok) {
                                            failSelection(prepared.error, selectionId);
                                        }
                                        else {
                                            const base64string = encodeToBase64(prepared.data.data);
                                            setStatus({
                                                kind: 'loaded',
                                                data: {
                                                    base64string,
                                                    mediaType: prepared.data.mediaType,
                                                    dimensions: prepared.data.dimensions,
                                                    fileBytes: prepared.data.data.byteLength,
                                                },
                                            });
                                        }
                                    }
                                });
                            }
                        }
                    }
                }
            }
        });
    };

    return (
        <div style={{ display: initialScene !== null ? 'block' : 'none' }}>
            <div className={styles.formContainer}>
                <ImageSourcePanel
                    status={status}
                    maxFileSizeBytes={settings.maxImageInputFileBytes}
                    onSelectionStart={() => {
                        const selectionId = ++imageSelectionIdRef.current;
                        setStatus({ kind: 'pending' });
                        onCommitStateChange('pending');
                        return selectionId;
                    }}
                    onFileTooLarge={selectionId => failSelection({ kind: 'file-size-too-large' }, selectionId)}
                    setSource={onSelect}
                />
                {status.kind === 'loaded' && (
                    <Base64Image
                        base64string={status.data.base64string}
                        mediaType={status.data.mediaType}
                    />
                )}
            </div>
        </div>
    );
}

export function EditSelectSceneTab<T extends Scene>({ initialScene, updateScene }: {
    initialScene: T | null,
    updateScene: (scene: T) => void,
}) {
    const { t } = useTranslation('game-editor');
    const { darkMode } = useSettings();
    const [editedText, setEditedText] = useState('');
    const [editedSqlSol, setEditedSqlSol] = useState('');
    const [editedIsRowOrderRelevant, setEditedIsRowOrderRelevant] = useState(false);
    const [editedIsColOrderRelevant, setEditedIsColOrderRelevant] = useState(false);
    const [editedAreColNamesRelevant, setEditedAreColNamesRelevant] = useState(false);
    const [editedUseSqlPlaceholder, setEditedUseSqlPlaceholder] = useState(false);
    const [editedSqlPlaceholder, setEditedSqlPlaceholder] = useState('');
    const [editedOrdinaryHints, setEditedOrdinaryHints] = useState<EditableOrdinaryHint[]>([]);
    const [editedHasSolHint, setEditedHasSolHint] = useState(false);

    useEffect(() => {
        if (initialScene) {
            if (initialScene.type === 'text') {
                setEditedText(initialScene.text);
                setEditedOrdinaryHints([]);
                setEditedHasSolHint(false);
            }
            else if (initialScene.type === 'image') {
                setEditedOrdinaryHints([]);
                setEditedHasSolHint(false);
            }
            else if (initialScene.type === 'select') {
                setEditedText(initialScene.text);
                setEditedSqlSol(initialScene.sqlSol);
                setEditedIsRowOrderRelevant(initialScene.isRowOrderRelevant);
                setEditedIsColOrderRelevant(initialScene.isColOrderRelevant);
                setEditedAreColNamesRelevant(initialScene.areColNamesRelevant);
                setEditedUseSqlPlaceholder(initialScene.sqlPlaceholder !== '');
                setEditedSqlPlaceholder(initialScene.sqlPlaceholder);
                setEditedOrdinaryHints(createEditableOrdinaryHints(initialScene.ordinaryHints));
                setEditedHasSolHint(initialScene.hasSolHint);
            }
            else if (initialScene.type === 'manipulate') {
                setEditedText(initialScene.text);
                setEditedSqlSol(initialScene.sqlSol);
                setEditedUseSqlPlaceholder(initialScene.sqlPlaceholder !== '');
                setEditedSqlPlaceholder(initialScene.sqlPlaceholder);
                setEditedOrdinaryHints(createEditableOrdinaryHints(initialScene.ordinaryHints));
                setEditedHasSolHint(initialScene.hasSolHint);
            }
        }
    }, [initialScene]);

    useEffect(() => {
        if (initialScene !== null) {
            updateScene({
                ...initialScene,
                type: 'select',
                text: editedText,
                sqlSol: editedSqlSol,
                sqlPlaceholder: editedSqlPlaceholder,
                isRowOrderRelevant: editedIsRowOrderRelevant,
                isColOrderRelevant: editedIsColOrderRelevant,
                areColNamesRelevant: editedAreColNamesRelevant,
                ordinaryHints: editedOrdinaryHints.map(item => item.ordinaryHint),
                hasSolHint: editedHasSolHint,
            });
        }
    }, [initialScene, editedText, editedSqlSol, editedIsRowOrderRelevant, editedIsColOrderRelevant, editedAreColNamesRelevant, editedSqlPlaceholder, editedOrdinaryHints, editedHasSolHint, updateScene]);

    return (
        <div style={{ display: initialScene !== null ? 'block' : 'none' }}>
            <div className={styles.formContainer}>
                <div>
                    <label htmlFor='edit-select-scene-text' className='mb-2'><strong>{t('scene_text_label')}</strong></label>
                    <Form.Control
                        id='edit-select-scene-text'
                        as='textarea'
                        rows={5}
                        value={editedText}
                        onChange={event => setEditedText(event.target.value)}
                    />
                    <Form.Text>{t('scene_text_formatting_help')}</Form.Text>
                </div>
                <div>
                    <label className='mb-2'><strong>{t('scene_sql_solution_label')}</strong></label>
                    <SqlEditor
                        value={editedSqlSol}
                        onChange={setEditedSqlSol}
                        darkMode={darkMode}
                        height={100}
                    />
                </div>
                <div>
                    <label className='mb-2'><strong>{t('scene_options_label')}</strong></label>
                    <div className={styles.editSceneOptions}>
                        <Form.Check
                            id='edit-select-scene-is-row-order-relevant'
                            type='switch'
                            checked={editedIsRowOrderRelevant}
                            onChange={event => setEditedIsRowOrderRelevant(event.target.checked)}
                        />
                        <div>
                            <label htmlFor='edit-select-scene-is-row-order-relevant'>
                                {t('scene_row_order_relevant_question')}
                            </label>
                        </div>
                        <Form.Check
                            id='edit-select-scene-is-col-order-relevant'
                            type='switch'
                            checked={editedIsColOrderRelevant}
                            onChange={event => setEditedIsColOrderRelevant(event.target.checked)}
                        />
                        <div>
                            <label htmlFor='edit-select-scene-is-col-order-relevant'>
                                {t('scene_column_order_relevant_question')}
                            </label>
                        </div>
                        <Form.Check
                            id='edit-select-scene-are-col-names-relevant'
                            type='switch'
                            checked={editedAreColNamesRelevant}
                            onChange={event => setEditedAreColNamesRelevant(event.target.checked)}
                        />
                        <div>
                            <label htmlFor='edit-select-scene-are-col-names-relevant'>
                                {t('scene_column_names_relevant_question')}
                            </label>
                        </div>
                        <Form.Check
                            id='edit-select-scene-use-sql-placeholder'
                            type='switch'
                            checked={editedUseSqlPlaceholder}
                            onChange={event => {
                                if (!event.target.checked) {
                                    setEditedSqlPlaceholder('');
                                }
                                setEditedUseSqlPlaceholder(event.target.checked);
                            }}
                        />
                        <div>
                            <Form.Group>
                                <label htmlFor='edit-select-scene-use-sql-placeholder' className='mb-2'>{t('scene_sql_placeholder_input_label')}</label>
                                {editedUseSqlPlaceholder && (
                                    <SqlEditor
                                        value={editedSqlPlaceholder}
                                        onChange={setEditedSqlPlaceholder}
                                        darkMode={darkMode}
                                        height={100}
                                    />
                                )}
                            </Form.Group>
                        </div>
                    </div>
                </div>
                <OrdinaryHintsEditor
                    ordinaryHints={editedOrdinaryHints}
                    setOrdinaryHints={setEditedOrdinaryHints}
                    hasSolHint={editedHasSolHint}
                    setHasSolHint={setEditedHasSolHint}
                />
            </div>
        </div>
    );
}

export function EditManipulateSceneTab<T extends Scene>({ initialScene, updateScene }: {
    initialScene: T | null,
    updateScene: (scene: T) => void,
}) {
    const { t } = useTranslation('game-editor');
    const { darkMode } = useSettings();
    const [editedText, setEditedText] = useState('');
    const [editedSqlSol, setEditedSqlSol] = useState('');
    const [editedSqlCheck, setEditedSqlCheck] = useState('');
    const [editedUseSqlPlaceholder, setEditedUseSqlPlaceholder] = useState(false);
    const [editedSqlPlaceholder, setEditedSqlPlaceholder] = useState('');
    const [editedOrdinaryHints, setEditedOrdinaryHints] = useState<EditableOrdinaryHint[]>([]);
    const [editedHasSolHint, setEditedHasSolHint] = useState(false);

    useEffect(() => {
        if (initialScene) {
            if (initialScene.type === 'text') {
                setEditedText(initialScene.text);
                setEditedOrdinaryHints([]);
                setEditedHasSolHint(false);
            }
            else if (initialScene.type === 'image') {
                setEditedOrdinaryHints([]);
                setEditedHasSolHint(false);
            }
            else if (initialScene.type === 'select') {
                setEditedText(initialScene.text);
                setEditedSqlSol(initialScene.sqlSol);
                setEditedUseSqlPlaceholder(initialScene.sqlPlaceholder !== '');
                setEditedSqlPlaceholder(initialScene.sqlPlaceholder);
                setEditedOrdinaryHints(createEditableOrdinaryHints(initialScene.ordinaryHints));
                setEditedHasSolHint(initialScene.hasSolHint);
            }
            else if (initialScene.type === 'manipulate') {
                setEditedText(initialScene.text);
                setEditedSqlSol(initialScene.sqlSol);
                setEditedSqlCheck(initialScene.sqlCheck);
                setEditedUseSqlPlaceholder(initialScene.sqlPlaceholder !== '');
                setEditedSqlPlaceholder(initialScene.sqlPlaceholder);
                setEditedOrdinaryHints(createEditableOrdinaryHints(initialScene.ordinaryHints));
                setEditedHasSolHint(initialScene.hasSolHint);
            }
        }
    }, [initialScene]);

    useEffect(() => {
        if (initialScene !== null) {
            updateScene({
                ...initialScene,
                type: 'manipulate',
                text: editedText,
                sqlSol: editedSqlSol,
                sqlCheck: editedSqlCheck,
                sqlPlaceholder: editedSqlPlaceholder,
                ordinaryHints: editedOrdinaryHints.map(item => item.ordinaryHint),
                hasSolHint: editedHasSolHint,
            });
        }
    }, [initialScene, editedText, editedSqlSol, editedSqlCheck, editedSqlPlaceholder, editedOrdinaryHints, editedHasSolHint, updateScene]);

    return (
        <div style={{ display: initialScene !== null ? 'block' : 'none' }}>
            <div className={styles.formContainer}>
                <div>
                    <label htmlFor='edit-select-scene-text' className='mb-2'><strong>{t('scene_text_label')}</strong></label>
                    <Form.Control
                        id='edit-select-scene-text'
                        as='textarea'
                        rows={5}
                        value={editedText}
                        onChange={event => setEditedText(event.target.value)}
                    />
                    <Form.Text>{t('scene_text_formatting_help')}</Form.Text>
                </div>
                <div>
                    <label className='mb-2'><strong>{t('scene_sql_solution_label')}</strong></label>
                    <SqlEditor
                        value={editedSqlSol}
                        onChange={setEditedSqlSol}
                        darkMode={darkMode}
                        height={100}
                    />
                </div>
                <div>
                    <label className='mb-2'><strong>{t('scene_sql_check_label')}</strong></label>
                    <SqlEditor
                        value={editedSqlCheck}
                        onChange={setEditedSqlCheck}
                        darkMode={darkMode}
                        height={100}
                    />
                </div>
                <div>
                    <label className='mb-2'><strong>{t('scene_options_label')}</strong></label>
                    <div className={styles.editSceneOptions}>
                        <Form.Check
                            id='edit-manipulate-scene-use-sql-placeholder'
                            type='switch'
                            checked={editedUseSqlPlaceholder}
                            onChange={event => {
                                if (!event.target.checked) {
                                    setEditedSqlPlaceholder('');
                                }
                                setEditedUseSqlPlaceholder(event.target.checked);
                            }}
                        />
                        <div>
                            <Form.Group>
                                <label htmlFor='edit-manipulate-scene-use-sql-placeholder' className='mb-2'>{t('scene_sql_placeholder_input_label')}</label>
                                {editedUseSqlPlaceholder && (
                                    <SqlEditor
                                        value={editedSqlPlaceholder}
                                        onChange={setEditedSqlPlaceholder}
                                        darkMode={darkMode}
                                        height={100}
                                    />
                                )}
                            </Form.Group>
                        </div>
                    </div>
                </div>
                <OrdinaryHintsEditor
                    ordinaryHints={editedOrdinaryHints}
                    setOrdinaryHints={setEditedOrdinaryHints}
                    hasSolHint={editedHasSolHint}
                    setHasSolHint={setEditedHasSolHint}
                />
            </div>
        </div>
    );
}

function OrdinaryHintsEditor({ ordinaryHints, setOrdinaryHints, hasSolHint, setHasSolHint }: {
    ordinaryHints: EditableOrdinaryHint[],
    setOrdinaryHints: (ordinaryHints: EditableOrdinaryHint[]) => void,
    hasSolHint: boolean,
    setHasSolHint: (hasSolHint: boolean) => void,
}) {
    const { t } = useTranslation('game-editor');
    const droppableId = useId();
    const hasOrdinaryExpectedResultHint = ordinaryHints.some(item => item.ordinaryHint.type === 'expected-result');

    const onDragEnd = (result: DropResult) => {
        if (result.destination !== null) {
            const reorderedOrdinaryHints = [...ordinaryHints];
            const [movedOrdinaryHint] = reorderedOrdinaryHints.splice(result.source.index, 1);
            reorderedOrdinaryHints.splice(result.destination.index, 0, movedOrdinaryHint);
            setOrdinaryHints(reorderedOrdinaryHints);
        }
    };

    const updateOrdinaryTextHint = (index: number, text: string) => {
        setOrdinaryHints(ordinaryHints.map((item, itemIndex) => (
            itemIndex === index
                ? { ...item, ordinaryHint: { type: 'text', text } }
                : item
        )));
    };

    const deleteOrdinaryHint = (index: number) => {
        setOrdinaryHints(ordinaryHints.filter((_item, itemIndex) => itemIndex !== index));
    };

    return (
        <div>
            <label className='mb-2'><strong>{t('scene_ordinary_hints_label')}</strong></label>
            <div className={styles.ordinaryHintEditorList}>
                {ordinaryHints.length > 0 && (
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId={droppableId}>
                            {provided => (
                                <div
                                    ref={provided.innerRef}
                                    className={styles.ordinaryHintEditorDraggableList}
                                    {...provided.droppableProps}
                                >
                                    {ordinaryHints.map((item, index) => (
                                        <Draggable key={item.key} draggableId={item.key} index={index}>
                                            {draggableProvided => (
                                                <div
                                                    ref={draggableProvided.innerRef}
                                                    className={styles.ordinaryHintEditorItem}
                                                    aria-label={t('scene_ordinary_hint_drag_handle')}
                                                    {...draggableProvided.draggableProps}
                                                    {...draggableProvided.dragHandleProps}
                                                >
                                                    <span className={styles.ordinaryHintEditorNumber}>
                                                        {index + 1}.
                                                    </span>
                                                    <div className={styles.ordinaryHintEditorContent}>
                                                        <OrdinaryHintEditorContent
                                                            ordinaryHint={item.ordinaryHint}
                                                            onTextChange={text => updateOrdinaryTextHint(index, text)}
                                                        />
                                                    </div>
                                                    <div className={styles.ordinaryHintEditorActions}>
                                                        <BareIconButton
                                                            accessibleName={t('scene_ordinary_hint_delete')}
                                                            onClick={() => deleteOrdinaryHint(index)}
                                                            tooltipText={t('scene_ordinary_hint_delete')}
                                                        >
                                                            <i className='bi bi-trash' aria-hidden='true' />
                                                        </BareIconButton>
                                                        <div
                                                            className={styles.ordinaryHintDragHandle}
                                                            aria-hidden='true'
                                                        >
                                                            <i className='bi bi-grip-vertical' aria-hidden='true' />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>
                )}
                {hasSolHint && (
                    <div className={`${styles.ordinaryHintEditorItem} ${styles.ordinaryHintEditorFixedItem}`}>
                        <span className={styles.ordinaryHintEditorNumber}>
                            {ordinaryHints.length + 1}.
                        </span>
                        <div className={styles.ordinaryHintEditorContent}>
                            <em>{t('scene_solution_hint_offer')}</em>
                        </div>
                        <div className={styles.ordinaryHintEditorActions}>
                            <BareIconButton
                                accessibleName={t('scene_ordinary_hint_delete')}
                                onClick={() => setHasSolHint(false)}
                                tooltipText={t('scene_ordinary_hint_delete')}
                            >
                                <i className='bi bi-trash' aria-hidden='true' />
                            </BareIconButton>
                            <div
                                className={styles.ordinaryHintDragHandle}
                                aria-hidden='true'
                            />
                        </div>
                    </div>
                )}
            </div>
            <div className={styles.ordinaryHintEditorAddActions}>
                <SubtleButton
                    type='button'
                    size='sm'
                    variant='primary'
                    onClick={() => setOrdinaryHints([
                        ...ordinaryHints,
                        ...createEditableOrdinaryHints([{ type: 'text', text: '' }]),
                    ])}
                >
                    <i className='bi bi-plus-lg me-1' aria-hidden='true' />
                    {t('scene_ordinary_text_hint_add')}
                </SubtleButton>
                {!hasOrdinaryExpectedResultHint && (
                    <SubtleButton
                        type='button'
                        size='sm'
                        variant='primary'
                        onClick={() => setOrdinaryHints([
                            ...ordinaryHints,
                            ...createEditableOrdinaryHints([{ type: 'expected-result' }]),
                        ])}
                    >
                        <i className='bi bi-plus-lg me-1' aria-hidden='true' />
                        {t('scene_ordinary_expected_result_hint_add')}
                    </SubtleButton>
                )}
                {!hasSolHint && (
                    <SubtleButton
                        type='button'
                        size='sm'
                        variant='primary'
                        onClick={() => setHasSolHint(true)}
                    >
                        <i className='bi bi-plus-lg me-1' aria-hidden='true' />
                        {t('scene_solution_hint_add')}
                    </SubtleButton>
                )}
            </div>
        </div>
    );
}

function OrdinaryHintEditorContent({ ordinaryHint, onTextChange }: {
    ordinaryHint: OrdinaryHint,
    onTextChange: (text: string) => void,
}) {
    const { t } = useTranslation('game-editor');
    switch (ordinaryHint.type) {
        case 'text':
            return (
                <>
                    <Form.Control
                        as='textarea'
                        rows={2}
                        value={ordinaryHint.text}
                        aria-label={t('scene_ordinary_text_hint')}
                        onChange={event => onTextChange(event.target.value)}
                    />
                    <Form.Text>{t('scene_text_formatting_help')}</Form.Text>
                </>
            );
        case 'expected-result':
            return <em>{t('scene_ordinary_expected_result_hint')}</em>;
        default: { const _n: never = ordinaryHint; return _n; }
    }
}

export type ImageSourceStatusEmpty = { kind: 'empty' };
export type ImageSourceStatusPending = { kind: 'pending' };
export type ImageSourceStatusLoaded = {
    kind: 'loaded',
    data: {
        base64string: string,
        mediaType: ImageMediaType,
        dimensions: ImageDimensions,
        fileBytes: number,
    },
};
export type ImageSourceStatusFailed = {
    kind: 'failed',
    error: UserImageFail | ImageResourceLimitFail | ImagePreparationFail,
};
export type ImageSourceStatus =
    | ImageSourceStatusEmpty
    | ImageSourceStatusPending
    | ImageSourceStatusLoaded
    | ImageSourceStatusFailed;

function imageSourceStatusToLoadingStatus(status: ImageSourceStatus, t: TFunction<'game-editor'>): LoadingStatus {
    switch (status.kind) {
        case 'empty':
            return { kind: 'empty' };
        case 'pending':
            return { kind: 'pending' };
        case 'loaded':
            return {
                kind: 'loaded',
                details: t('image_loaded_details', {
                    width: status.data.dimensions.width,
                    height: status.data.dimensions.height,
                    fileSize: formatFileSize(status.data.fileBytes),
                }),
            };
        case 'failed':
            switch (status.error.kind) {
                case 'fetch':
                    return { kind: 'failed', error: t('image_fetch_error') };
                case 'file-size-too-large':
                    return { kind: 'failed', error: t('image_too_large_error') };
                case 'image-file-invalid':
                    return { kind: 'failed', error: t('image_invalid_error') };
                case 'image-preparation-failed':
                    return { kind: 'failed', error: t('image_processing_error') };
                case 'image-resize-animated':
                    return { kind: 'failed', error: t('image_resize_animated_error') };
                case 'image-resource-limit':
                    if (status.error.resource === 'file-bytes') {
                        return { kind: 'failed', error: t('image_too_large_error') };
                    }
                    else if (status.error.resource === 'pixels') {
                        const pixelCount = status.error.dimensions.width * status.error.dimensions.height;
                        return {
                            kind: 'failed',
                            error: t('image_too_many_pixels_error', {
                                width: status.error.dimensions.width,
                                height: status.error.dimensions.height,
                                pixelCount: formatPixelCount(pixelCount),
                                limit: formatPixelCount(status.error.limit),
                            }),
                        };
                    }
                    else if (status.error.resource === 'width' || status.error.resource === 'height') {
                        return { kind: 'failed', error: t('image_processing_error') };
                    }
                    else { const _n: never = status.error.resource; return _n; }
                default: { const _n: never = status.error; return _n; }
            }
        default: { const _n: never = status; return _n; }
    }
}

function loadedImageDataFromBase64(
    base64string: string,
    declaredMediaType: ImageMediaType,
): ImageSourceStatusLoaded['data'] | null {
    try {
        const data = decodeFromBase64(base64string);
        const detectedMediaType = detectImageMediaType(data);
        if (detectedMediaType !== declaredMediaType) {
            return null;
        }
        else {
            const dimensions = readImageDimensions(data, detectedMediaType);
            if (dimensions === null) {
                return null;
            }
            else {
                return {
                    base64string,
                    mediaType: detectedMediaType,
                    dimensions,
                    fileBytes: data.byteLength,
                };
            }
        }
    }
    catch {
        return null;
    }
}

function formatInteger(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatPixelCount(pixels: number): string {
    if (pixels >= 1_000_000) {
        return `${(pixels / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} MP`;
    }
    else if (pixels >= 1_000) {
        return `${(pixels / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kpx`;
    }
    else {
        return `${formatInteger(pixels)} px`;
    }
}

function ImageSourcePanel({ status, maxFileSizeBytes, onSelectionStart, onFileTooLarge, setSource }: {
    status: ImageSourceStatus,
    maxFileSizeBytes: number,
    onSelectionStart: () => number,
    onFileTooLarge: (selectionId: number) => void,
    setSource: (source: ImageSource, selectionId: number) => void,
}) {
    const { t } = useTranslation('game-editor');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (file !== undefined) {
            const selectionId = onSelectionStart();
            if (file.size > maxFileSizeBytes) {
                onFileTooLarge(selectionId);
            }
            else {
                const content = new Uint8Array(await file.arrayBuffer());
                setSource({ type: 'inline', content }, selectionId);
            }
        }
    };

    return (
        <>
            <SourceStatusPanelWithOpenButton
                onOpen={() => fileInputRef.current?.click()}
                tooltipText={t('image_open')}
                status={imageSourceStatusToLoadingStatus(status, t)}
            />
            <input
                ref={fileInputRef}
                type='file'
                accept='.png,.jpg,.jpeg,.webp,.avif,.gif,image/png,image/jpeg,image/webp,image/avif,image/gif'
                onChange={onFileSelected}
                hidden
            />
        </>
    );
}
