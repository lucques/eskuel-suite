import { useId } from 'react';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import { ThemedModal } from '../../gui-helpers/app-theme/AppTheme';
import { SubtleButton } from '../../gui-helpers/subtle-button/SubtleButton';

export function ResumeGameModal({
    gameTitle,
    restoring,
    onResume,
    onStartOver,
}: {
    gameTitle: string,
    restoring: boolean,
    onResume: () => void,
    onStartOver: () => void,
}) {
    const { t } = useTranslation('game-console');
    const titleId = useId();

    return (
        <ThemedModal
            show
            onHide={() => undefined}
            backdrop='static'
            keyboard={false}
            centered
            aria-labelledby={titleId}
        >
            <Modal.Header>
                <Modal.Title id={titleId}>{t('resume_title')}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {t('resume_body', { game: gameTitle })}
            </Modal.Body>
            <Modal.Footer>
                <SubtleButton onClick={onStartOver} disabled={restoring}>
                    {t('start_over')}
                </SubtleButton>
                <SubtleButton onClick={onResume} disabled={restoring} variant='primary'>
                    {restoring ? t('restoring') : t('resume')}
                </SubtleButton>
            </Modal.Footer>
        </ThemedModal>
    );
}
