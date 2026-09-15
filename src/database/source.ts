import type { Source } from '../util';
import { getFilenameExtension } from '../util';

export type DbSource =
    | { type: 'auto', source: Source<Uint8Array> }
    | { type: 'initial-sql-script', source: Source<string> }
    | { type: 'sqlite-db', source: Source<Uint8Array> }
    | { type: 'eskuel-database-package', source: Source<Uint8Array> };

export type FetchDbFail = { kind: 'fetch-db', url: string };
export type ParseDatabaseContentFail = { kind: 'parse-database-content', details: string };

export type DatabaseFileSourceType = Exclude<DbSource['type'], 'auto'>;

const sqliteDatabaseExtensions = new Set([
    'db',
    'db3',
    's3db',
    'sl3',
    'sqlite',
    'sqlite3',
]);

export function getDatabaseFileSourceType(filename: string): DatabaseFileSourceType | undefined {
    const extension = getFilenameExtension(filename)?.toLowerCase() ?? null;
    if (extension === 'sql') {
        return 'initial-sql-script';
    }
    else if (extension === 'eskueldb') {
        return 'eskuel-database-package';
    }
    else if (extension !== null && sqliteDatabaseExtensions.has(extension)) {
        return 'sqlite-db';
    }
    else {
        return undefined;
    }
}
