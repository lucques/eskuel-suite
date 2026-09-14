import { useId } from 'react';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import packageMetadata from '../../../package.json';
import { ThemedModal } from '../app-theme/AppTheme';
import { SubtleButton } from '../subtle-button/SubtleButton';

const REPOSITORY_URL = 'https://github.com/lucques/eskuel-suite';
const FULL_LICENSE_URL = `${REPOSITORY_URL}/blob/master/COPYING`;
const THIRD_PARTY_LICENSES_URL = `${REPOSITORY_URL}/blob/master/THIRD_PARTY_LICENSES`;

export function AboutModal({ show, onHide }: {
    show: boolean,
    onHide: () => void,
}) {
    const { t } = useTranslation('common');
    const titleId = useId();

    return (
        <ThemedModal
            show={show}
            onHide={onHide}
            centered
            size='lg'
            aria-labelledby={titleId}
        >
            <Modal.Header closeButton>
                <Modal.Title id={titleId}>{t('about.title')}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <p>{t('about.description')}</p>
                <p>{t('about.version', { version: packageMetadata.version })}</p>
                <p className='mb-2'>{t('about.copyright')}</p>
                <p>{t('about.license_notice')}</p>
                <p>{t('about.warranty_notice')}</p>
                <div className='d-flex flex-wrap gap-3'>
                    <a href={REPOSITORY_URL} target='_blank' rel='noopener noreferrer'>
                        {t('about.source_code')}
                    </a>
                    <a href={FULL_LICENSE_URL} target='_blank' rel='noopener noreferrer'>
                        {t('about.full_license')}
                    </a>
                    <a href={THIRD_PARTY_LICENSES_URL} target='_blank' rel='noopener noreferrer'>
                        {t('about.third_party_licenses')}
                    </a>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <SubtleButton onClick={onHide} variant='primary'>
                    {t('common.close')}
                </SubtleButton>
            </Modal.Footer>
        </ThemedModal>
    );
}
