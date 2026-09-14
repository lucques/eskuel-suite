import { useId, useState } from 'react';
import { Form, Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import { ThemedModal } from '../../gui-helpers/app-theme/AppTheme';
import { SubtleButton } from '../../gui-helpers/subtle-button/SubtleButton';

export function ChangeGameFilenameModal({
    show,
    currentFilename,
    onHide,
    onChange,
}: {
    show: boolean,
    currentFilename: string,
    onHide: () => void,
    onChange: (filename: string) => void,
}) {
    const { t } = useTranslation('game-editor');
    const { t: tc } = useTranslation('common');
    const titleId = useId();
    const [editedFilename, setEditedFilename] = useState<string | null>(null);
    const displayedFilename = editedFilename ?? currentFilename;
    const trimmedFilename = displayedFilename.trim();
    const filenameValid = trimmedFilename.length > '.xml'.length
        && trimmedFilename.toLowerCase().endsWith('.xml');

    const hide = (): void => {
        setEditedFilename(null);
        onHide();
    };

    const changeFilename = (): void => {
        if (filenameValid) {
            onChange(trimmedFilename);
            hide();
        }
    };

    return (
        <ThemedModal show={show} onHide={hide} aria-labelledby={titleId}>
            <Modal.Header closeButton>
                <Modal.Title id={titleId}>{t('change_filename_title')}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form
                    id='change-game-filename-form'
                    onSubmit={event => {
                        event.preventDefault();
                        changeFilename();
                    }}
                >
                    <Form.Label htmlFor='game-filename'>{t('filename_label')}</Form.Label>
                    <Form.Control
                        id='game-filename'
                        type='text'
                        value={displayedFilename}
                        onChange={event => setEditedFilename(event.target.value)}
                        isInvalid={!filenameValid}
                        autoFocus
                        required
                    />
                    <Form.Control.Feedback type='invalid'>
                        {t('filename_xml_extension_error')}
                    </Form.Control.Feedback>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <SubtleButton variant='secondary' onClick={hide}>
                    {tc('common.cancel')}
                </SubtleButton>
                <SubtleButton
                    type='submit'
                    form='change-game-filename-form'
                    variant='primary'
                    disabled={!filenameValid}
                >
                    {t('change_filename_action')}
                </SubtleButton>
            </Modal.Footer>
        </ThemedModal>
    );
}
