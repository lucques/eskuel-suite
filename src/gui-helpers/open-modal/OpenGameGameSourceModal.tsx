import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { GameCatalogEntry } from '../../catalog';
import { selectGameCatalogSources } from '../../catalog/selection';
import type { GameSource } from '../../game/loader';
import { getLanguageDisplayName } from '../../i18n/languages';
import { useSettings } from '../../settings/settings';
import type { WithFilename } from '../../util';
import { detectSourceContentType } from '../../source-content';
import { FileSourceError } from './file-error';
import { DirectFileSourceInput, type DirectFileSourceInputHandle } from './DirectFileSourceInput';
import { OpenSourceModal } from './OpenSourceModal';
import { groupOpenSourceOptions } from './OpenSourceOptions';

export type OpenGameSourceHandle = {
    open: () => void;
};

export const OpenGameGameSourceModal = forwardRef(function OpenGameGameSourceModal({
    gameCatalog = [],
    onOpenFile,
}: {
    gameCatalog?: readonly GameCatalogEntry[];
    onOpenFile: (source: WithFilename<GameSource>) => void;
}, ref: React.ForwardedRef<OpenGameSourceHandle>) {
    const { t, i18n } = useTranslation('common');
    const { settings } = useSettings();
    const [show, setShow] = useState(false);
    const directFileInputRef = useRef<DirectFileSourceInputHandle>(null);
    const hasProvidedSources = gameCatalog.length > 0;
    const language = i18n.resolvedLanguage ?? i18n.language;
    const catalogSources = selectGameCatalogSources(
        gameCatalog,
        language,
    );
    const providedSources = groupOpenSourceOptions(catalogSources);
    const maxFileSizeBytes = Math.max(settings.maxGameFileBytes, settings.maxGamePackageBytes);

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

    const fileToSource = async (file: File): Promise<GameSource> => {
        const prefix = new Uint8Array(await file.slice(0, 16).arrayBuffer());
        const maxBytes = detectSourceContentType(prefix) === 'zip'
            ? settings.maxGamePackageBytes
            : settings.maxGameFileBytes;
        if (file.size > maxBytes) {
            const limit = (maxBytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 });
            throw new FileSourceError(t('common.file_too_large', { limit }));
        }
        else {
            return {
                type: 'auto',
                source: { type: 'inline', content: new Uint8Array(await file.arrayBuffer()) },
            };
        }
    };

    return (
        <>
            {!hasProvidedSources
                ? <DirectFileSourceInput
                    ref={directFileInputRef}
                    maxFileSizeBytes={maxFileSizeBytes}
                    fileToSource={fileToSource}
                    onOpenFile={onOpenFile}
                />
                : null}
            {show
                ? <OpenSourceModal
                    title={t('game_source.open_title')}
                    providedSourcesTitle={t('catalog_source.load_game')}
                    emptyProvidedSourcesMessage={t('catalog_source.no_game_for_language', {
                        language: getLanguageDisplayName(language, language),
                    })}
                    localFileTitle={t('game_source.open_file_title')}
                    fileIcons={
                        <>
                            <i className='bi bi-filetype-xml' />
                            <i className='bi bi-file-zip' />
                        </>
                    }
                    providedSources={providedSources}
                    maxFileSizeBytes={maxFileSizeBytes}
                    fileToSource={fileToSource}
                    onHide={() => setShow(false)}
                    onOpenFile={onOpenFile}
                />
                : null}
        </>
    );
});
