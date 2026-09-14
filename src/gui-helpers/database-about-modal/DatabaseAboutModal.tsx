import { useId } from 'react';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import type { DatabasePackageInfo } from '../../database/package';
import { ThemedModal } from '../app-theme/AppTheme';
import styles from '../package-about-modal/PackageAboutModal.module.css';
import {
    ContributorView,
    MetadataSection,
    SourceView,
} from '../package-about-modal/PackageAboutModalViews';
import { formatDatabaseSystem } from '../package-about-modal/formatDatabaseSystem';
import { SubtleButton } from '../subtle-button/SubtleButton';

export function DatabaseAboutModal({ info, show, onHide }: {
    info: DatabasePackageInfo;
    show: boolean;
    onHide: () => void;
}) {
    const { t } = useTranslation('browser');
    const { t: tc } = useTranslation('common');
    const titleId = useId();
    const resource = info.descriptor.resources[0];
    const database = resource['eskuel:database'];
    const resourceFilename = resource.path.split('/').at(-1) ?? resource.path;

    return (
        <ThemedModal
            show={show}
            onHide={onHide}
            centered
            scrollable
            size='lg'
            aria-labelledby={titleId}
        >
            <Modal.Header closeButton>
                <Modal.Title id={titleId}>
                    {t('database_about.title', { title: info.descriptor.title })}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <p>{t('database_about.description')}</p>
                <dl className='row mb-4'>
                    <dt className='col-sm-5'>{t('database_about.database_title')}</dt>
                    <dd className='col-sm-7'>{info.descriptor.title}</dd>
                    <dt className='col-sm-5'>{t('database_about.package_name_and_version')}</dt>
                    <dd className='col-sm-7'><code>{info.descriptor.name}</code> ({info.descriptor.version})</dd>
                    <dt className='col-sm-5'>{t('database_about.database_system')}</dt>
                    <dd className='col-sm-7'>
                        {formatDatabaseSystem(database.system)} (≥ {database.systemMinVersion})
                    </dd>
                    <dt className='col-sm-5'>{t('database_about.artifact_type')}</dt>
                    <dd className='col-sm-7'>
                        <code>{resourceFilename}</code> ({t(`database_about.artifact_types.${database.artifactType}`)})
                    </dd>
                </dl>

                <MetadataSection title={t('database_about.contributors')}>
                    <ul className={styles.itemList}>
                        {info.descriptor.contributors.map((contributor, index) => (
                            <ContributorView key={index} contributor={contributor} />
                        ))}
                    </ul>
                </MetadataSection>

                <MetadataSection title={t('database_about.licenses')}>
                    <div className={styles.disclosureList}>
                        {info.licenses.map(license => (
                            <details key={license.metadata.path} className={styles.disclosure}>
                                <summary>{license.metadata.title ?? license.metadata.name ?? license.metadata.path}</summary>
                                <pre className={styles.textContent}>{license.text}</pre>
                            </details>
                        ))}
                    </div>
                </MetadataSection>

                {info.descriptor.sources === undefined || info.descriptor.sources.length === 0
                    ? null
                    : <MetadataSection title={t('database_about.sources')}>
                        <ul className={styles.itemList}>
                            {info.descriptor.sources.map((source, index) => (
                                <SourceView key={index} source={source} />
                            ))}
                        </ul>
                    </MetadataSection>}

                {info.notices.length === 0
                    ? null
                    : <MetadataSection title={t('database_about.notices')}>
                        <div className={styles.disclosureList}>
                            {info.notices.map(notice => (
                                <details key={notice.metadata.path} className={styles.disclosure}>
                                    <summary>{notice.metadata.title ?? notice.metadata.path}</summary>
                                    <pre className={styles.textContent}>{notice.text}</pre>
                                </details>
                            ))}
                        </div>
                    </MetadataSection>}

                {info.provenance === undefined
                    ? null
                    : <MetadataSection title={t('database_about.provenance')}>
                        <details className={styles.disclosure}>
                            <summary>
                                <code>{info.provenance.metadata.path}</code> ({t('database_about.mediatype')}: <code>{info.provenance.metadata.mediatype}</code>)
                            </summary>
                            <pre className={styles.textContent}>{info.provenance.text}</pre>
                        </details>
                    </MetadataSection>}
            </Modal.Body>
            <Modal.Footer>
                <SubtleButton onClick={onHide} variant='primary'>
                    {tc('common.close')}
                </SubtleButton>
            </Modal.Footer>
        </ThemedModal>
    );
}
