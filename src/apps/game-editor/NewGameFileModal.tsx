import { useId, useState } from 'react';
import { Form, Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import { ThemedModal } from '../../gui-helpers/app-theme/AppTheme';
import { SubtleButton } from '../../gui-helpers/subtle-button/SubtleButton';
import { assert } from '../../util';
import styles from './NewGameFileModal.module.css';

export function NewGameFileModal({ show, onHide, onCreate }: {
    show: boolean,
    onHide: () => void,
    onCreate: (gameTitle: string) => void,
}) {
    const { t } = useTranslation('game-editor');
    const { t: tc } = useTranslation('common');
    const titleId = useId();
    const [gameTitle, setGameTitle] = useState<string | null>(null);
    const displayedGameTitle = gameTitle ?? t('new_game_default_name');

    const onCreateClicked = () => {
        assert(displayedGameTitle !== '');
        onCreate(displayedGameTitle);
        onHide();
    };

    return (
        <ThemedModal show={show} onHide={onHide} aria-labelledby={titleId}>
            <Modal.Header closeButton>
                <Modal.Title id={titleId} className={styles.title}>{t('new_game')}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form className={styles.form}>
                    <div>
                        <label htmlFor='new-game-name' className='mb-2'><strong>{t('new_game_name_label')}</strong></label>
                        <Form.Control
                            id='new-game-name'
                            type='text'
                            value={displayedGameTitle}
                            onChange={event => setGameTitle(event.target.value)}
                        />
                    </div>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <SubtleButton variant='secondary' onClick={onHide}>
                    {tc('common.close')}
                </SubtleButton>
                <SubtleButton variant='primary' onClick={onCreateClicked} disabled={displayedGameTitle === ''}>
                    {tc('common.create')}
                </SubtleButton>
            </Modal.Footer>
        </ThemedModal>
    );
}
