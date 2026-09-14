import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DatabaseCatalogEntry } from '../../catalog';
import { selectDatabaseCatalogSources } from '../../catalog/selection';
import { getDatabaseFileSourceType, type DbSource } from '../../database/source';
import { getLanguageDisplayName } from '../../i18n/languages';
import { useSettings } from '../../settings/settings';
import type { WithFilename } from '../../util';
import { DirectFileSourceInput, type DirectFileSourceInputHandle } from './DirectFileSourceInput';
import { UnsupportedFileTypeError } from './file-error';
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

    const fileToSource = async (file: File): Promise<DbSource> => {
        const sourceType = getDatabaseFileSourceType(file.name);
        if (sourceType === 'initial-sql-script') {
            return { type: 'initial-sql-script', source: { type: 'inline', content: await file.text() } };
        }
        else if (sourceType === 'sqlite-db') {
            return {
                type: 'sqlite-db',
                source: { type: 'inline', content: new Uint8Array(await file.arrayBuffer()) },
            };
        }
        else if (sourceType === 'eskuel-database-package') {
            return {
                type: 'eskuel-database-package',
                source: { type: 'inline', content: new Uint8Array(await file.arrayBuffer()) },
            };
        }
        else if (sourceType === undefined) {
            throw new UnsupportedFileTypeError(t('database_source.unsupported_file_type'));
        }
        else { const _n: never = sourceType; return _n; }
    };

    return (
        <>
            {!hasProvidedSources
                ? <DirectFileSourceInput
                    ref={directFileInputRef}
                    accept='.eskueldb, .sql, .db, .db3, .sqlite, .sqlite3, .s3db, .sl3'
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
                    fileAccept='.eskueldb, .sql, .db, .db3, .sqlite, .sqlite3, .s3db, .sl3'
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
