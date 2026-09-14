import { PGlite, protocol, types } from '@electric-sql/pglite';

import { assert } from '../../util';
import type { DbData, InitDbFail, SqlTable, SqlValue } from '../api';
import { compareThreePartVersions } from '../system-version';
import type { PgliteRequest, PgliteResponse } from './protocol';

type ExecutionResult =
    | { ok: true, tables: SqlTable[] }
    | { ok: false, message: string };

type CurrentResultTable = {
    columns: string[],
    dataTypeIds: number[],
    values: SqlValue[][],
    truncated: boolean,
};

export class PgliteCore {
    private readonly databases = new Map<number, PGlite>();
    private requestQueue = Promise.resolve();
    private disposed = false;

    request(request: PgliteRequest): Promise<PgliteResponse> {
        const response = this.requestQueue.then(() => this.handleRequest(request));
        this.requestQueue = response.then(
            () => undefined,
            () => undefined,
        );
        return response;
    }

    dispose(): void {
        if (!this.disposed) {
            this.disposed = true;
            const databases = [...this.databases.values()];
            this.databases.clear();
            void Promise.all(databases.map(database => database.close().catch(() => undefined)));
        }
    }

    private async openDatabase(
        source: DbData | null,
        systemMinVersion: string,
        maxDatabaseBytes: number,
    ): Promise<PGlite> {
        if (this.disposed) {
            throw { kind: 'database-engine' as const, details: 'Database core is disposed' };
        }
        else if (source?.type === 'sqlite-db') {
            throw {
                kind: 'unsupported-database-system' as const,
                system: source.system,
                details: 'The PGlite database engine cannot open an SQLite database',
            };
        }
        else if (source?.type === 'initial-sql-script' && source.system !== 'postgresql') {
            throw {
                kind: 'unsupported-database-system' as const,
                system: source.system,
                details: `The PGlite database engine does not support the ${source.system} database system`,
            };
        }
        else if (source?.type === 'initial-sql-script' && utf8ByteLength(source.sql) > maxDatabaseBytes) {
            throw {
                kind: 'run-init-script' as const,
                details: 'Initial SQL script exceeds the database file-size limit',
            };
        }
        else {
            let database: PGlite | null = null;
            try {
                database = await PGlite.create({
                    dataDir: 'memory://',
                    startParams: [
                        ...PGlite.defaultStartParams,
                        '-c',
                        'timezone=UTC',
                        '-c',
                        'datestyle=ISO, MDY',
                    ],
                });
                await ensureSupportedPostgresqlVersion(database, systemMinVersion);
                if (source?.type === 'initial-sql-script') {
                    await ensureSupportedPostgresqlVersion(database, source.systemMinVersion);
                    const initialization = await execute(database, source.sql, 0);
                    if (!initialization.ok) {
                        throw { kind: 'run-init-script' as const, details: initialization.message };
                    }
                }
                await ensureDatabaseWithinLimit(database, maxDatabaseBytes);
                return database;
            }
            catch (error: unknown) {
                await database?.close().catch(() => undefined);
                if (isInitDbFail(error)) {
                    throw error;
                }
                else if (source?.type === 'initial-sql-script') {
                    throw { kind: 'run-init-script' as const, details: String(error) };
                }
                else {
                    throw { kind: 'database-engine' as const, details: String(error) };
                }
            }
        }
    }

    private async handleRequest(request: PgliteRequest): Promise<PgliteResponse> {
        if (this.disposed) {
            return {
                type: 'request-error',
                requestId: request.requestId,
                error: { kind: 'database-engine', details: 'Database core is disposed' },
            };
        }
        else {
            try {
                switch (request.type) {
                    case 'open': {
                        const previous = this.databases.get(request.databaseId);
                        if (previous !== undefined) {
                            await previous.close();
                        }
                        const database = await this.openDatabase(
                            request.source,
                            request.systemMinVersion,
                            request.maxDatabaseBytes,
                        );
                        this.databases.set(request.databaseId, database);
                        return { type: 'opened', requestId: request.requestId };
                    }
                    case 'exec': {
                        const database = this.databases.get(request.databaseId);
                        if (database === undefined) {
                            return {
                                type: 'request-error',
                                requestId: request.requestId,
                                error: { kind: 'database-engine', details: 'Database connection is not open' },
                            };
                        }
                        else {
                            const execution = await execute(database, request.sql, request.maxResultRows);
                            try {
                                await ensureDatabaseWithinLimit(database, request.maxDatabaseBytes);
                                if (!execution.ok) {
                                    return {
                                        type: 'execution-error',
                                        requestId: request.requestId,
                                        message: execution.message,
                                    };
                                }
                                else {
                                    return {
                                        type: 'executed',
                                        requestId: request.requestId,
                                        result: execution.tables,
                                    };
                                }
                            }
                            catch (error: unknown) {
                                await database.close().catch(() => undefined);
                                this.databases.delete(request.databaseId);
                                return {
                                    type: 'execution-error',
                                    requestId: request.requestId,
                                    message: String(error),
                                };
                            }
                        }
                    }
                    case 'close': {
                        const database = this.databases.get(request.databaseId);
                        if (database !== undefined) {
                            await database.close();
                        }
                        this.databases.delete(request.databaseId);
                        return { type: 'closed', requestId: request.requestId };
                    }
                    default: {
                        const _n: never = request;
                        return _n;
                    }
                }
            }
            catch (error: unknown) {
                return {
                    type: 'request-error',
                    requestId: request.requestId,
                    error: toInitDbFail(error),
                };
            }
        }
    }
}

async function execute(database: PGlite, sql: string, maxResultRows: number): Promise<ExecutionResult> {
    const parser = new protocol.Parser();
    const tables: SqlTable[] = [];
    let currentTable: CurrentResultTable | null = null;
    let retainedRows = 0;
    let sqlError: string | null = null;
    let parseError: string | null = null;

    await database.runExclusive(() => database.execProtocolRawStream(
        protocol.serialize.query(sql),
        {
            onRawData: data => {
                if (parseError === null) {
                    try {
                        parser.parse(data, message => {
                            if (message instanceof protocol.messages.RowDescriptionMessage) {
                                currentTable = {
                                    columns: message.fields.map(field => field.name),
                                    dataTypeIds: message.fields.map(field => field.dataTypeID),
                                    values: [],
                                    truncated: false,
                                };
                            }
                            else if (message instanceof protocol.messages.DataRowMessage) {
                                if (currentTable === null) {
                                    parseError = 'PostgreSQL returned a row without a result-table description';
                                }
                                else if (message.fields.length !== currentTable.columns.length) {
                                    parseError = 'PostgreSQL returned a row with an unexpected number of columns';
                                }
                                else if (retainedRows >= maxResultRows) {
                                    currentTable.truncated = true;
                                }
                                else {
                                    const table = currentTable;
                                    currentTable.values.push(message.fields.map((value, index) => (
                                        normalizeSqlValue(value, table.dataTypeIds[index])
                                    )));
                                    retainedRows++;
                                }
                            }
                            else if (message instanceof protocol.messages.CommandCompleteMessage) {
                                if (currentTable !== null) {
                                    tables.push({
                                        columns: currentTable.columns,
                                        values: currentTable.values,
                                        ...(currentTable.truncated ? { truncated: true } : {}),
                                    });
                                    currentTable = null;
                                }
                            }
                            else if (message instanceof protocol.messages.DatabaseError) {
                                sqlError = message.message;
                            }
                        });
                    }
                    catch (error: unknown) {
                        parseError = String(error);
                    }
                }
            },
        },
    ));

    if (parseError !== null) {
        return { ok: false, message: parseError };
    }
    else if (sqlError !== null) {
        return { ok: false, message: sqlError };
    }
    else {
        return { ok: true, tables };
    }
}

function normalizeSqlValue(value: string | null, dataTypeId: number | undefined): SqlValue {
    if (value === null) {
        return null;
    }
    else if (dataTypeId === types.BOOL) {
        return value === 't';
    }
    else if (dataTypeId === types.BYTEA) {
        const parsed: unknown = types.parseType(value, types.BYTEA);
        assert(parsed instanceof Uint8Array, 'Expected PGlite to parse bytea as Uint8Array');
        return parsed;
    }
    else if (dataTypeId === types.INT2
        || dataTypeId === types.INT4
        || dataTypeId === types.OID
        || dataTypeId === types.FLOAT4
        || dataTypeId === types.FLOAT8) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : value;
    }
    else {
        return value;
    }
}

async function ensureDatabaseWithinLimit(database: PGlite, maxDatabaseBytes: number): Promise<void> {
    const result = await database.query<{ size: number | bigint }>(
        'SELECT pg_catalog.pg_database_size(pg_catalog.current_database()) AS size',
    );
    const size = result.rows[0]?.size;
    if (typeof size !== 'number' && typeof size !== 'bigint') {
        throw new Error('Could not read PostgreSQL database size');
    }
    else if (BigInt(size) > BigInt(maxDatabaseBytes)) {
        throw new Error('Database exceeds the database file-size limit');
    }
}

async function ensureSupportedPostgresqlVersion(
    database: PGlite,
    requiredMinVersion?: string,
): Promise<void> {
    if (requiredMinVersion !== undefined) {
        const result = await database.query<{ server_version: string }>('SHOW server_version');
        const reportedVersion = result.rows[0]?.server_version;
        if (typeof reportedVersion !== 'string') {
            throw { kind: 'database-engine' as const, details: 'Could not determine the PostgreSQL version' };
        }
        const actualVersion = normalizePostgresqlVersion(reportedVersion);
        if (actualVersion === null) {
            throw {
                kind: 'database-engine' as const,
                details: `PostgreSQL reported an unsupported server version: ${reportedVersion}`,
            };
        }
        else if (compareThreePartVersions(actualVersion, requiredMinVersion) < 0) {
            throw {
                kind: 'unsupported-database-system-version' as const,
                system: 'postgresql' as const,
                requiredMinVersion,
                actualVersion,
                details: `PostgreSQL ${requiredMinVersion} or later is required, but this engine provides PostgreSQL ${actualVersion}`,
            };
        }
    }
}

function normalizePostgresqlVersion(reportedVersion: string): string | null {
    const match = /^(0|[1-9][0-9]*)(?:\.(0|[1-9][0-9]*))?(?:\.(0|[1-9][0-9]*))?/.exec(reportedVersion);
    return match === null
        ? null
        : `${match[1]}.${match[2] ?? '0'}.${match[3] ?? '0'}`;
}

function utf8ByteLength(value: string): number {
    return new TextEncoder().encode(value).byteLength;
}

function isInitDbFail(error: unknown): error is InitDbFail {
    return typeof error === 'object' && error !== null && 'kind' in error && 'details' in error
        && typeof error.details === 'string';
}

function toInitDbFail(error: unknown): InitDbFail {
    if (isInitDbFail(error)) {
        return error;
    }
    else {
        return { kind: 'database-engine', details: String(error) };
    }
}
