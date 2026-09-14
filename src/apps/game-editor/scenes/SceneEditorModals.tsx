import { useEffect, useId, useState } from 'react';
import { Form, Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import type { Scene } from '../../../game/model';
import { ThemedModal } from '../../../gui-helpers/app-theme/AppTheme';
import { SubtleButton } from '../../../gui-helpers/subtle-button/SubtleButton';
import { assert } from '../../../util';
import styles from '../view.module.css';
import type { EditableScene } from './editable-scene';
import {
    EditImageSceneTab,
    EditManipulateSceneTab,
    EditSelectSceneTab,
    EditTextSceneTab,
} from './SceneEditorForms';
import type { ImageSceneFormCommitState } from './SceneEditorForms';

type SceneType = Scene['type'];

type SceneEditorFormState<T extends Scene> = {
    editType: SceneType | null;
    initialTextScene: T | null;
    initialImageScene: T | null;
    initialSelectScene: T | null;
    initialManipulateScene: T | null;
};

function createSceneEditorFormState<T extends Scene>(editType: SceneType | null, initialScene: T | null): SceneEditorFormState<T> {
    switch (editType) {
        case 'text':
            return {
                editType,
                initialTextScene: initialScene,
                initialImageScene: null,
                initialSelectScene: null,
                initialManipulateScene: null,
            };
        case 'image':
            return {
                editType,
                initialTextScene: null,
                initialImageScene: initialScene,
                initialSelectScene: null,
                initialManipulateScene: null,
            };
        case 'select':
            return {
                editType,
                initialTextScene: null,
                initialImageScene: null,
                initialSelectScene: initialScene,
                initialManipulateScene: null,
            };
        case 'manipulate':
            return {
                editType,
                initialTextScene: null,
                initialImageScene: null,
                initialSelectScene: null,
                initialManipulateScene: initialScene,
            };
        case null:
            return {
                editType,
                initialTextScene: null,
                initialImageScene: null,
                initialSelectScene: null,
                initialManipulateScene: null,
            };
        default: { const _n: never = editType; return _n; }
    }
}

export function EditSceneModal({ initialScene, onHide, onSaveAndHide }: {
    initialScene: EditableScene | null,
    onHide: () => void,
    onSaveAndHide: (scene: EditableScene) => void,
}) {
    const { t } = useTranslation('game-editor');
    const { t: tc } = useTranslation('common');
    const titleId = useId();
    const [editedScene, setEditedScene] = useState<EditableScene | null>(null);
    const [formState, setFormState] = useState<SceneEditorFormState<EditableScene>>(
        () => createSceneEditorFormState<EditableScene>(null, null),
    );
    const [imageCommitState, setImageCommitState] = useState<ImageSceneFormCommitState>('invalid');

    useEffect(() => {
        if (initialScene !== null) {
            setEditedScene(initialScene);
            setFormState(createSceneEditorFormState(initialScene.type, initialScene));
            setImageCommitState(initialScene.type === 'image' ? 'ready' : 'invalid');
        }
        else {
            setEditedScene(null);
            setFormState(createSceneEditorFormState<EditableScene>(null, null));
            setImageCommitState('invalid');
        }
    }, [initialScene]);

    const handleSetSceneType = (sceneType: SceneType) => {
        setFormState(createSceneEditorFormState(sceneType, editedScene));
        if (sceneType === 'image') {
            setImageCommitState(editedScene?.type === 'image' ? 'ready' : 'invalid');
        }
    };

    const canSave = editedScene !== null
        && formState.editType !== null
        && editedScene.type === formState.editType
        && (formState.editType !== 'image' || imageCommitState === 'ready');

    const handleSave = () => {
        assert(canSave);
        assert(editedScene !== null);
        onSaveAndHide(editedScene);
    };

    return (
        <ThemedModal show={initialScene !== null} onHide={onHide} size='lg' aria-labelledby={titleId}>
            <Modal.Header closeButton>
                <Modal.Title id={titleId} className={styles.modalTitle}>{t('scene_edit_title')}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form className={styles.formContainer}>
                    <ChooseSceneType sceneType={formState.editType} setSceneType={handleSetSceneType} />
                    <EditTextSceneTab initialScene={formState.initialTextScene} updateScene={setEditedScene} />
                    <EditImageSceneTab
                        initialScene={formState.initialImageScene}
                        updateScene={setEditedScene}
                        onCommitStateChange={setImageCommitState}
                    />
                    <EditSelectSceneTab initialScene={formState.initialSelectScene} updateScene={setEditedScene} />
                    <EditManipulateSceneTab initialScene={formState.initialManipulateScene} updateScene={setEditedScene} />
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <SubtleButton variant='secondary' onClick={onHide}>
                    {tc('common.close')}
                </SubtleButton>
                <SubtleButton variant='primary' onClick={handleSave} disabled={!canSave}>
                    {tc('common.save')}
                </SubtleButton>
            </Modal.Footer>
        </ThemedModal>
    );
}

export function AddSceneModal({ show, onHide, onSaveAndHide }: {
    show: boolean,
    onHide: () => void,
    onSaveAndHide: (scene: Scene) => void,
}) {
    const { t } = useTranslation('game-editor');
    const { t: tc } = useTranslation('common');
    const titleId = useId();
    const [editedScene, setEditedScene] = useState<Scene | null>(null);
    const [formState, setFormState] = useState<SceneEditorFormState<Scene>>(
        () => createSceneEditorFormState(null, null),
    );
    const [imageCommitState, setImageCommitState] = useState<ImageSceneFormCommitState>('invalid');

    useEffect(() => {
        if (show) {
            const defaultScene: Scene = { type: 'text', text: t('scene_default_text') };
            setEditedScene(defaultScene);
            setFormState(createSceneEditorFormState(defaultScene.type, defaultScene));
            setImageCommitState('invalid');
        }
        else {
            setEditedScene(null);
            setFormState(createSceneEditorFormState(null, null));
            setImageCommitState('invalid');
        }
    }, [show, t]);

    const handleSetSceneType = (sceneType: SceneType) => {
        setFormState(createSceneEditorFormState(sceneType, editedScene));
        if (sceneType === 'image') {
            setImageCommitState(editedScene?.type === 'image' ? 'ready' : 'invalid');
        }
    };

    const canSave = editedScene !== null
        && formState.editType !== null
        && editedScene.type === formState.editType
        && (formState.editType !== 'image' || imageCommitState === 'ready');

    const handleSave = () => {
        assert(canSave);
        assert(editedScene !== null);
        onSaveAndHide(editedScene);
    };

    return (
        <ThemedModal show={show} onHide={onHide} size='lg' aria-labelledby={titleId}>
            <Modal.Header closeButton>
                <Modal.Title id={titleId} className={styles.modalTitle}>{t('scene_add_title')}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form className={styles.formContainer}>
                    <ChooseSceneType sceneType={formState.editType} setSceneType={handleSetSceneType} />
                    <EditTextSceneTab initialScene={formState.initialTextScene} updateScene={setEditedScene} />
                    <EditImageSceneTab
                        initialScene={formState.initialImageScene}
                        updateScene={setEditedScene}
                        onCommitStateChange={setImageCommitState}
                    />
                    <EditSelectSceneTab initialScene={formState.initialSelectScene} updateScene={setEditedScene} />
                    <EditManipulateSceneTab initialScene={formState.initialManipulateScene} updateScene={setEditedScene} />
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <SubtleButton variant='secondary' onClick={onHide}>
                    {tc('common.close')}
                </SubtleButton>
                <SubtleButton variant='primary' onClick={handleSave} disabled={!canSave}>
                    {tc('common.add')}
                </SubtleButton>
            </Modal.Footer>
        </ThemedModal>
    );
}

function ChooseSceneType({ sceneType, setSceneType }: {
    sceneType: SceneType | null,
    setSceneType: (sceneType: SceneType) => void,
}) {
    const { t } = useTranslation('game-editor');

    return (
        <Form.Group className={styles.chooseSceneType}>
            <Form.Label><strong>{t('scene_type_prompt')}</strong></Form.Label>
            <Form.Check
                inline
                type='radio'
                label={t('scene_type_text')}
                name='sceneType'
                id='text'
                value='text'
                checked={sceneType === 'text'}
                onChange={() => setSceneType('text')}
            />
            <Form.Check
                inline
                type='radio'
                label={t('scene_type_image')}
                name='sceneType'
                id='image'
                value='image'
                checked={sceneType === 'image'}
                onChange={() => setSceneType('image')}
            />
            <Form.Check
                inline
                type='radio'
                label={t('scene_type_select')}
                name='sceneType'
                id='select'
                value='select'
                checked={sceneType === 'select'}
                onChange={() => setSceneType('select')}
            />
            <Form.Check
                inline
                type='radio'
                label={t('scene_type_manipulate')}
                name='sceneType'
                id='manipulate'
                value='manipulate'
                checked={sceneType === 'manipulate'}
                onChange={() => setSceneType('manipulate')}
            />
        </Form.Group>
    );
}
