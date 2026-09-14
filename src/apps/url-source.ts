import { getDatabaseFileSourceType, type DbSource } from '../database/source';
import type { GameSource } from '../game/loader';
import { getGameFileSourceType } from '../game/source';
import { getFilename, type WithFilename } from '../util';

export function createGameUrlSource(url: string): WithFilename<GameSource> {
    const filename = getFilename(url);
    const sourceType = getGameFileSourceType(filename);
    if (sourceType === 'xml') {
        return {
            filename,
            type: 'xml',
            source: { type: 'fetch', url },
        };
    }
    else if (sourceType === 'eskuel-game-package') {
        return {
            filename,
            type: 'eskuel-game-package',
            source: { type: 'fetch', url },
        };
    }
    else if (sourceType === undefined) {
        if (filename === '') {
            throw new Error(`Game URL does not contain a filename: ${url}`);
        }
        throw new Error(`Unsupported game filename extension in URL: ${url}`);
    }
    else { const _n: never = sourceType; return _n; }
}

export function createDatabaseUrlSource(url: string): WithFilename<DbSource> {
    const filename = getFilename(url);
    const sourceType = getDatabaseFileSourceType(filename);
    if (sourceType === 'initial-sql-script') {
        return {
            filename,
            type: 'initial-sql-script',
            source: { type: 'fetch', url },
        };
    }
    else if (sourceType === 'sqlite-db') {
        return {
            filename,
            type: 'sqlite-db',
            source: { type: 'fetch', url },
        };
    }
    else if (sourceType === 'eskuel-database-package') {
        return {
            filename,
            type: 'eskuel-database-package',
            source: { type: 'fetch', url },
        };
    }
    else if (sourceType === undefined) {
        throw new Error(`Unsupported database filename extension in URL: ${url}`);
    }
    else { const _n: never = sourceType; return _n; }
}
