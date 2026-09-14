import type { DbData, InitDbFail, SqlTable } from '../api';

export type PgliteRequest =
    | {
        type: 'open',
        requestId: number,
        databaseId: number,
        source: DbData | null,
        systemMinVersion: string,
        maxDatabaseBytes: number,
    }
    | { type: 'exec', requestId: number, databaseId: number, sql: string, maxResultRows: number, maxDatabaseBytes: number }
    | { type: 'close', requestId: number, databaseId: number };

export type PgliteResponse =
    | { type: 'opened', requestId: number }
    | { type: 'executed', requestId: number, result: SqlTable[] }
    | { type: 'execution-error', requestId: number, message: string }
    | { type: 'closed', requestId: number }
    | { type: 'request-error', requestId: number, error: InitDbFail };
