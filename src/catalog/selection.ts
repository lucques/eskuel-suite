import { getDatabaseFileSourceType, type DbSource } from '../database/source';
import type { GameSource } from '../game/loader';
import { getGameFileSourceType } from '../game/source';
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
    const sourceType = getGameFileSourceType(file.filename);
    if (sourceType === 'xml') {
        return {
            filename: file.filename,
            type: 'xml',
            source: { type: 'fetch', url: file.url },
        };
    }
    else if (sourceType === 'eskuel-game-package') {
        return {
            filename: file.filename,
            type: 'eskuel-game-package',
            source: { type: 'fetch', url: file.url },
        };
    }
    else if (sourceType === undefined) {
        throw new TypeError(`Unsupported game catalog filename extension: ${file.filename}`);
    }
    else { const _n: never = sourceType; return _n; }
}

function databaseCatalogFileSource(file: CatalogFile): WithFilename<DbSource> {
    const sourceType = getDatabaseFileSourceType(file.filename);
    if (sourceType === 'initial-sql-script') {
        return {
            filename: file.filename,
            type: 'initial-sql-script',
            source: { type: 'fetch', url: file.url },
        };
    }
    else if (sourceType === 'sqlite-db') {
        return {
            filename: file.filename,
            type: 'sqlite-db',
            source: { type: 'fetch', url: file.url },
        };
    }
    else if (sourceType === 'eskuel-database-package') {
        return {
            filename: file.filename,
            type: 'eskuel-database-package',
            source: { type: 'fetch', url: file.url },
        };
    }
    else if (sourceType === undefined) {
        throw new TypeError(`Unsupported database catalog filename extension: ${file.filename}`);
    }
    else { const _n: never = sourceType; return _n; }
}
