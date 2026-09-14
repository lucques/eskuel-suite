import { useId, type ReactNode } from 'react';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { SubtleButton } from '../subtle-button/SubtleButton';
import { ThemedModal } from '../app-theme/AppTheme';

export function ConfirmLeaveModal({ show, onHide, onConfirm, body = undefined }: {
    show: boolean,
    onHide: () => void,
    onConfirm: () => void,
    body?: ReactNode,
}) {
    const { t } = useTranslation('common');
    const titleId = useId();

    return (
        <ThemedModal show={show} onHide={onHide} centered aria-labelledby={titleId}>
            <Modal.Header closeButton>
                <Modal.Title id={titleId}>{t('confirm_leave.title')}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {body ?? t('confirm_leave.body')}
            </Modal.Body>
            <Modal.Footer>
                <SubtleButton onClick={onHide}>
                    {t('confirm_leave.stay')}
                </SubtleButton>
                <SubtleButton onClick={onConfirm} variant='primary'>
                    {t('confirm_leave.leave')}
                </SubtleButton>
            </Modal.Footer>
        </ThemedModal>
    );
}
