import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { GameCatalogEntry } from '../../catalog';
import { selectGameCatalogSources } from '../../catalog/selection';
import type { GameSource } from '../../game/loader';
import { getGameFileSourceType } from '../../game/source';
import { getLanguageDisplayName } from '../../i18n/languages';
import { useSettings } from '../../settings/settings';
import type { WithFilename } from '../../util';
import { DirectFileSourceInput, type DirectFileSourceInputHandle } from './DirectFileSourceInput';
import { UnsupportedFileTypeError } from './file-error';
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
    const getMaxFileSizeBytes = (file: File): number => getGameFileSourceType(file.name) === 'xml'
        ? settings.maxGameFileBytes
        : settings.maxGamePackageBytes;

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
        const sourceType = getGameFileSourceType(file.name);
        if (sourceType === 'xml') {
            return { type: 'xml', source: { type: 'inline', content: await file.text() } };
        }
        else if (sourceType === 'eskuel-game-package') {
            return {
                type: 'eskuel-game-package',
                source: { type: 'inline', content: new Uint8Array(await file.arrayBuffer()) },
            };
        }
        else if (sourceType === undefined) {
            throw new UnsupportedFileTypeError(t('game_source.unsupported_file_type'));
        }
        else { const _n: never = sourceType; return _n; }
    };

    return (
        <>
            {!hasProvidedSources
                ? <DirectFileSourceInput
                    ref={directFileInputRef}
                    accept='.eskuelgame, .xml'
                    maxFileSizeBytes={getMaxFileSizeBytes}
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
                    fileAccept='.eskuelgame, .xml'
                    providedSources={providedSources}
                    maxFileSizeBytes={getMaxFileSizeBytes}
                    fileToSource={fileToSource}
                    onHide={() => setShow(false)}
                    onOpenFile={onOpenFile}
                />
                : null}
        </>
    );
});
