import type { DbSource } from '../database/source';
import type { GameSource } from '../game/source';
import { getFilename, type WithFilename } from '../util';

export function createGameUrlSource(url: string): WithFilename<GameSource> {
    return {
        filename: getFilename(url) || 'download',
        type: 'auto',
        source: { type: 'fetch', url },
    };
}

export function createDatabaseUrlSource(url: string): WithFilename<DbSource> {
    return {
        filename: getFilename(url) || 'download',
        type: 'auto',
        source: { type: 'fetch', url },
    };
}
