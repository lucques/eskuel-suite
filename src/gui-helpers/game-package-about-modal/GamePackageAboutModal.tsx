import { useId } from 'react';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import type { GamePackageInfo } from '../../game/package';
import type {
    BundledPackageLicense,
    BundledPackageNotice,
    BundledPackageProvenance,
    Contributor,
    PackageSource,
} from '../../package/profile';
import { ThemedModal } from '../app-theme/AppTheme';
import styles from '../package-about-modal/PackageAboutModal.module.css';
import {
    ContributorView,
    MetadataSection,
    SourceView,
} from '../package-about-modal/PackageAboutModalViews';
import { formatDatabaseSystem } from '../package-about-modal/formatDatabaseSystem';
import { SubtleButton } from '../subtle-button/SubtleButton';

export function GamePackageAboutModal({ info, show, onHide }: {
    info: GamePackageInfo;
    show: boolean;
    onHide: () => void;
}) {
    const { t } = useTranslation('common');
    const titleId = useId();
    const databaseResource = info.database.descriptor.resources[0];
    const database = databaseResource['eskuel:database'];

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
                    {t('game_package_about.title', { title: info.descriptor.title })}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <p>{t('game_package_about.description')}</p>
                <PackageIdentity
                    title={info.descriptor.title}
                    name={info.descriptor.name}
                    version={info.descriptor.version}
                    titleLabel={t('game_package_about.game_title')}
                />
                <PackageMetadata
                    heading={t('game_package_about.game_rights')}
                    contributors={info.descriptor.contributors}
                    licenses={info.licenses}
                    notices={info.notices}
                    provenance={info.provenance}
                    sources={info.descriptor.sources}
                />

                <hr />
                <h2 className='h5'>{t('game_package_about.database_package')}</h2>
                <PackageIdentity
                    title={info.database.descriptor.title}
                    name={info.database.descriptor.name}
                    version={info.database.descriptor.version}
                    titleLabel={t('game_package_about.database_title')}
                />
                <dl className='row mb-4'>
                    <dt className='col-sm-5'>{t('game_package_about.database_system')}</dt>
                    <dd className='col-sm-7'>{formatDatabaseSystem(database.system)} (≥ {database.systemMinVersion})</dd>
                    <dt className='col-sm-5'>{t('game_package_about.database_artifact')}</dt>
                    <dd className='col-sm-7'><code>{databaseResource.path}</code> ({database.artifactType})</dd>
                </dl>
                <PackageMetadata
                    heading={t('game_package_about.database_rights')}
                    contributors={info.database.descriptor.contributors}
                    licenses={info.database.licenses}
                    notices={info.database.notices}
                    provenance={info.database.provenance}
                    sources={info.database.descriptor.sources}
                />
            </Modal.Body>
            <Modal.Footer>
                <SubtleButton onClick={onHide} variant='primary'>
                    {t('common.close')}
                </SubtleButton>
            </Modal.Footer>
        </ThemedModal>
    );
}

function PackageIdentity({ title, name, version, titleLabel }: {
    title: string;
    name: string;
    version: string;
    titleLabel: string;
}) {
    const { t } = useTranslation('common');
    return (
        <dl className='row mb-4'>
            <dt className='col-sm-5'>{titleLabel}</dt>
            <dd className='col-sm-7'>{title}</dd>
            <dt className='col-sm-5'>{t('game_package_about.package_name_and_version')}</dt>
            <dd className='col-sm-7'><code>{name}</code> ({version})</dd>
        </dl>
    );
}

function PackageMetadata({
    heading,
    contributors,
    licenses,
    notices,
    provenance,
    sources,
}: {
    heading: string;
    contributors: Contributor[];
    licenses: BundledPackageLicense[];
    notices: BundledPackageNotice[];
    provenance?: BundledPackageProvenance;
    sources?: PackageSource[];
}) {
    const { t } = useTranslation('common');
    return (
        <section>
            <h2 className='h5'>{heading}</h2>
            <MetadataSection title={t('game_package_about.contributors')}>
                <ul className={styles.itemList}>
                    {contributors.map((contributor, index) => (
                        <ContributorView key={index} contributor={contributor} />
                    ))}
                </ul>
            </MetadataSection>
            <MetadataSection title={t('game_package_about.licenses')}>
                <div className={styles.disclosureList}>
                    {licenses.map(license => (
                        <details key={license.metadata.path} className={styles.disclosure}>
                            <summary>{license.metadata.title ?? license.metadata.name ?? license.metadata.path}</summary>
                            <pre className={styles.textContent}>{license.text}</pre>
                        </details>
                    ))}
                </div>
            </MetadataSection>
            {sources === undefined || sources.length === 0
                ? null
                : <MetadataSection title={t('game_package_about.sources')}>
                    <ul className={styles.itemList}>
                        {sources.map((source, index) => <SourceView key={index} source={source} />)}
                    </ul>
                </MetadataSection>}
            {notices.length === 0
                ? null
                : <MetadataSection title={t('game_package_about.notices')}>
                    <div className={styles.disclosureList}>
                        {notices.map(notice => (
                            <details key={notice.metadata.path} className={styles.disclosure}>
                                <summary>{notice.metadata.title ?? notice.metadata.path}</summary>
                                <pre className={styles.textContent}>{notice.text}</pre>
                            </details>
                        ))}
                    </div>
                </MetadataSection>}
            {provenance === undefined
                ? null
                : <MetadataSection title={t('game_package_about.provenance')}>
                    <details className={styles.disclosure}>
                        <summary><code>{provenance.metadata.path}</code> ({provenance.metadata.mediatype})</summary>
                        <pre className={styles.textContent}>{provenance.text}</pre>
                    </details>
                </MetadataSection>}
        </section>
    );
}
