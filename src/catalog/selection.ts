import type { DbSource } from '../database/source';
import type { GameSource } from '../game/loader';
import type { WithFilename } from '../util';
import type {
    CatalogFile,
    CatalogLocalization,
    DatabaseCatalogEntry,
    GameCatalogEntry,
} from './model';

export type CatalogSourceOption<T> = {
    readonly key: string;
    readonly entryKey: string;
    readonly entryTitle: string;
    readonly source: WithFilename<T>;
    readonly pageUrl?: string;
};

export function selectGameCatalogSources(
    catalog: readonly GameCatalogEntry[],
    language: string,
): CatalogSourceOption<GameSource>[] {
    return selectCatalogSources(catalog, language, gameCatalogFileSource);
}

export function selectDatabaseCatalogSources(
    catalog: readonly DatabaseCatalogEntry[],
    language: string,
): CatalogSourceOption<DbSource>[] {
    return selectCatalogSources(catalog, language, databaseCatalogFileSource);
}

function selectCatalogSources<T>(
    catalog: readonly GameCatalogEntry[] | readonly DatabaseCatalogEntry[],
    language: string,
    fileToSource: (file: CatalogFile) => WithFilename<T>,
): CatalogSourceOption<T>[] {
    const result: CatalogSourceOption<T>[] = [];
    for (const entry of catalog) {
        const localization = entry.localizations[language];
        if (localization !== undefined) {
            for (const file of localization.files) {
                result.push(makeCatalogSourceOption(entry.id, language, localization, file, fileToSource(file)));
            }
        }
    }
    return result;
}

function makeCatalogSourceOption<T>(
    entryId: string,
    language: string,
    localization: CatalogLocalization,
    file: CatalogFile,
    source: WithFilename<T>,
): CatalogSourceOption<T> {
    return {
        key: `${entryId}/${language}/${file.filename}`,
        entryKey: `${entryId}/${language}`,
        entryTitle: localization.title,
        source,
        pageUrl: localization.pageUrl,
    };
}

function gameCatalogFileSource(file: CatalogFile): WithFilename<GameSource> {
    return {
        filename: file.filename,
        type: 'auto',
        source: { type: 'fetch', url: file.url },
    };
}

function databaseCatalogFileSource(file: CatalogFile): WithFilename<DbSource> {
    return {
        filename: file.filename,
        type: 'auto',
        source: { type: 'fetch', url: file.url },
    };
}
