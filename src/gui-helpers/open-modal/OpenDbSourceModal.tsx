import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DatabaseCatalogEntry } from '../../catalog';
import { selectDatabaseCatalogSources } from '../../catalog/selection';
import type { DbSource } from '../../database/source';
import { getLanguageDisplayName } from '../../i18n/languages';
import { useSettings } from '../../settings/settings';
import type { WithFilename } from '../../util';
import { DirectFileSourceInput, type DirectFileSourceInputHandle } from './DirectFileSourceInput';
import { OpenSourceModal } from './OpenSourceModal';
import { groupOpenSourceOptions } from './OpenSourceOptions';

export type OpenDbSourceHandle = {
    open: () => void;
};

export const OpenDbSourceModal = forwardRef(function OpenDbSourceModal({
    databaseCatalog = [],
    onOpenFile,
}: {
    databaseCatalog?: readonly DatabaseCatalogEntry[];
    onOpenFile: (source: WithFilename<DbSource>) => void;
}, ref: React.ForwardedRef<OpenDbSourceHandle>) {
    const { t, i18n } = useTranslation('common');
    const { settings } = useSettings();
    const [show, setShow] = useState(false);
    const directFileInputRef = useRef<DirectFileSourceInputHandle>(null);
    const hasProvidedSources = databaseCatalog.length > 0;
    const language = i18n.resolvedLanguage ?? i18n.language;
    const catalogSources = selectDatabaseCatalogSources(
        databaseCatalog,
        language,
    );
    const providedSources = groupOpenSourceOptions(catalogSources);

    useImperativeHandle(ref, () => ({
        open: () => {
            if (!hasProvidedSources) {
                directFileInputRef.current?.open();
            }
            else {
                setShow(true);
            }
        },
    }), [hasProvidedSources]);

    const fileToSource = async (file: File): Promise<DbSource> => ({
        type: 'auto',
        source: { type: 'inline', content: new Uint8Array(await file.arrayBuffer()) },
    });

    return (
        <>
            {!hasProvidedSources
                ? <DirectFileSourceInput
                    ref={directFileInputRef}
                    maxFileSizeBytes={settings.maxDatabaseFileBytes}
                    fileToSource={fileToSource}
                    onOpenFile={onOpenFile}
                />
                : null}
            {show
                ? <OpenSourceModal
                    title={t('button.open_database')}
                    providedSourcesTitle={t('catalog_source.load_database')}
                    emptyProvidedSourcesMessage={t('catalog_source.no_database_for_language', {
                        language: getLanguageDisplayName(language, language),
                    })}
                    localFileTitle={t('common.open_file')}
                    fileIcons={
                        <>
                            <i className='bi bi-filetype-sql' />
                            <i className='bi bi-database' />
                        </>
                    }
                    providedSources={providedSources}
                    maxFileSizeBytes={settings.maxDatabaseFileBytes}
                    fileToSource={fileToSource}
                    onHide={() => setShow(false)}
                    onOpenFile={onOpenFile}
                />
                : null}
        </>
    );
});
