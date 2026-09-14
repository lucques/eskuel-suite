import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GamePackageInfo } from '../../game/package';
import { CollapsibleMetadata } from '../../gui-helpers/collapsible-metadata/CollapsibleMetadata';
import { GamePackageAboutModal } from '../../gui-helpers/game-package-about-modal/GamePackageAboutModal';
import { PackageLicensesButton } from '../../gui-helpers/package-licenses-button/PackageLicensesButton';
import styles from './MetaDataView.module.css';

export function MetaDataView({ title, copyright, teaser, packageInfo }: {
    title: string,
    copyright: string,
    teaser: string,
    packageInfo?: GamePackageInfo,
}) {
    const { t } = useTranslation('game-console');
    const [aboutOpen, setAboutOpen] = useState(false);

    return (
        <CollapsibleMetadata
            title={title}
            collapseLabel={t('collapse_metadata')}
            expandLabel={t('expand_metadata')}
        >
            <div className={styles.metaDataBlock}>
                <div className={styles.metaDataTitle}>
                    <h1>{title}</h1>
                </div>
                <div className={styles.metaDataSub}>
                    {packageInfo === undefined
                        ? null
                        : <PackageLicensesButton className='me-2' onClick={() => setAboutOpen(true)} />}
                    <em>{copyright}</em>
                </div>
            </div>
            <div className={styles.teaser}>
                {teaser}
            </div>
            {packageInfo === undefined
                ? null
                : <GamePackageAboutModal
                    info={packageInfo}
                    show={aboutOpen}
                    onHide={() => setAboutOpen(false)}
                />}
        </CollapsibleMetadata>
    );
}
