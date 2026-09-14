import { useId, type ReactNode } from 'react';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import { ThemedModal } from '../app-theme/AppTheme';
import { SubtleButton } from '../subtle-button/SubtleButton';

export function ConfirmSaveChangesModal({
    show,
    title,
    body,
    saveDisabled = false,
    dontSaveLabel = undefined,
    saveLabel = undefined,
    onDontSave,
    onCancel,
    onSave,
}: {
    show: boolean,
    title: ReactNode,
    body: ReactNode,
    saveDisabled?: boolean,
    dontSaveLabel?: ReactNode,
    saveLabel?: ReactNode,
    onDontSave: () => void,
    onCancel: () => void,
    onSave: () => void,
}) {
    const { t } = useTranslation('common');
    const titleId = useId();

    return (
        <ThemedModal show={show} onHide={onCancel} centered aria-labelledby={titleId}>
            <Modal.Header closeButton>
                <Modal.Title id={titleId}>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {body}
            </Modal.Body>
            <Modal.Footer>
                <SubtleButton onClick={onDontSave}>
                    {dontSaveLabel ?? t('confirm_save_changes.dont_save')}
                </SubtleButton>
                <SubtleButton onClick={onCancel}>
                    {t('common.cancel')}
                </SubtleButton>
                <SubtleButton onClick={onSave} disabled={saveDisabled} variant='primary'>
                    {saveLabel ?? t('common.save')}
                </SubtleButton>
            </Modal.Footer>
        </ThemedModal>
    );
}
