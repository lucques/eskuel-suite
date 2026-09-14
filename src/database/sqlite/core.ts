import type initSqlJs from 'sql.js';

import { assert } from '../../util';
import type { DbData, InitDbFail, SqlTable, UnsupportedDatabaseSystemVersionFail } from '../api';
import { compareThreePartVersions } from '../system-version';
import type { SqliteRequest, SqliteResponse } from './protocol';

type SqlJs = Awaited<ReturnType<typeof initSqlJs>>;

export class SqliteCore {
    private readonly databases = new Map<number, initSqlJs.Database>();
    private requestQueue = Promise.resolve();
    private disposed = false;

    constructor(private readonly sqlJs: Promise<SqlJs>) {}

    request(request: SqliteRequest): Promise<SqliteResponse> {
        const response = this.requestQueue.then(() => this.handleRequest(request));
        this.requestQueue = response.then(
            () => undefined,
            () => undefined,
        );
        return response;
    }

    dispose(): void {
        // Disposal is idempotent.
        if (!this.disposed) {
            this.disposed = true;
            for (const database of this.databases.values()) {
                database.close();
            }
            this.databases.clear();
        }
    }

    private async openDatabase(
        source: DbData | null,
        systemMinVersion: string,
        maxDatabaseBytes: number,
    ): Promise<initSqlJs.Database> {
        const SQL = await this.sqlJs;
        if (this.disposed) {
            throw { kind: 'database-engine' as const, details: 'Database core is disposed' };
        }
        else if (source === null) {
            const database = new SQL.Database();
            setDatabaseSizeLimit(database, maxDatabaseBytes);
            ensureSupportedSqliteVersion(database, systemMinVersion);
            return database;
        }
        else if (source.type === 'initial-sql-script') {
            if (utf8ByteLength(source.sql) > maxDatabaseBytes) {
                throw { kind: 'run-init-script' as const, details: 'Initial SQL script exceeds the database file-size limit' };
            }
            else {
                const database = new SQL.Database();
                try {
                    setDatabaseSizeLimit(database, maxDatabaseBytes);
                    ensureSupportedSqliteVersion(database, source.systemMinVersion);
                    ensureSupportedSqliteVersion(database, systemMinVersion);
                    database.run(source.sql);
                    ensureDatabaseWithinLimit(database, maxDatabaseBytes);
                    return database;
                }
                catch (error: unknown) {
                    database.close();
                    if (isUnsupportedDatabaseSystemVersionFail(error)) {
                        throw error;
                    }
                    else {
                        throw { kind: 'run-init-script' as const, details: String(error) };
                    }
                }
            }
        }
        else if (source.type === 'sqlite-db') {
            if (source.data.byteLength > maxDatabaseBytes) {
                throw { kind: 'read-sqlite-db' as const, details: 'SQLite database exceeds the database file-size limit' };
            }
            else {
                let database: initSqlJs.Database | null = null;
                try {
                    database = new SQL.Database(source.data);
                    setDatabaseSizeLimit(database, maxDatabaseBytes);
                    ensureSupportedSqliteVersion(database, source.systemMinVersion);
                    ensureSupportedSqliteVersion(database, systemMinVersion);
                    const result = database.exec('SELECT name FROM sqlite_master WHERE type=\'table\'');
                    if (result.length !== 1) {
                        throw new Error('Could not read from database');
                    }
                    else {
                        return database;
                    }
                }
                catch (error: unknown) {
                    database?.close();
                    if (isUnsupportedDatabaseSystemVersionFail(error)) {
                        throw error;
                    }
                    else {
                        throw { kind: 'read-sqlite-db' as const, details: String(error) };
                    }
                }
            }
        }
        else {
            const _n: never = source;
            return _n;
        }
    }

    private async handleRequest(request: SqliteRequest): Promise<SqliteResponse> {
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
                        this.databases.get(request.databaseId)?.close();
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
                            try {
                                setDatabaseSizeLimit(database, request.maxDatabaseBytes);
                                const result = execute(database, request.sql, request.maxResultRows);
                                ensureDatabaseWithinLimit(database, request.maxDatabaseBytes);
                                return {
                                    type: 'executed',
                                    requestId: request.requestId,
                                    result,
                                };
                            }
                            catch (error: unknown) {
                                try {
                                    ensureDatabaseWithinLimit(database, request.maxDatabaseBytes);
                                }
                                catch (_sizeError: unknown) {
                                    database.close();
                                    this.databases.delete(request.databaseId);
                                }
                                return { type: 'execution-error', requestId: request.requestId, message: String(error) };
                            }
                        }
                    }
                    case 'close': {
                        this.databases.get(request.databaseId)?.close();
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

function ensureSupportedSqliteVersion(database: initSqlJs.Database, requiredMinVersion?: string): void {
    if (requiredMinVersion !== undefined) {
        const result = database.exec('SELECT sqlite_version()');
        const actualVersion = result[0]?.values[0]?.[0];
        if (typeof actualVersion !== 'string') {
            throw { kind: 'database-engine' as const, details: 'Could not determine the SQLite version' };
        }
        else if (compareThreePartVersions(actualVersion, requiredMinVersion) < 0) {
            throw {
                kind: 'unsupported-database-system-version' as const,
                system: 'sqlite' as const,
                requiredMinVersion,
                actualVersion,
                details: `SQLite ${requiredMinVersion} or later is required, but this engine provides SQLite ${actualVersion}`,
            };
        }
    }
}

function isUnsupportedDatabaseSystemVersionFail(
    error: unknown,
): error is UnsupportedDatabaseSystemVersionFail {
    return typeof error === 'object' && error !== null
        && 'kind' in error && error.kind === 'unsupported-database-system-version'
        && 'system' in error && error.system === 'sqlite'
        && 'requiredMinVersion' in error && typeof error.requiredMinVersion === 'string'
        && 'actualVersion' in error && typeof error.actualVersion === 'string'
        && 'details' in error && typeof error.details === 'string';
}

function execute(database: initSqlJs.Database, sql: string, maxResultRows: number): SqlTable[] {
    const results: SqlTable[] = [];
    let resultRows = 0;

    for (const statement of database.iterateStatements(sql)) {
        const columns = statement.getColumnNames();
        if (columns.length === 0) {
            statement.step();
        }
        else {
            const values: SqlTable['values'] = [];
            let truncated = false;
            while (statement.step()) {
                if (resultRows >= maxResultRows) {
                    truncated = true;
                    break;
                }
                else {
                    const row = statement.get();
                    assert(
                        row.length === columns.length,
                        'A SQL result row must contain exactly one value per column',
                    );
                    values.push(row);
                    resultRows++;
                }
            }
            results.push({ columns, values, truncated });
        }
    }

    return results;
}

function setDatabaseSizeLimit(database: initSqlJs.Database, maxDatabaseBytes: number): void {
    const pageSize = readPragmaNumber(database, 'page_size');
    const maxPageCount = Math.max(1, Math.floor(maxDatabaseBytes / pageSize));
    database.run(`PRAGMA max_page_count = ${maxPageCount}`);
}

function ensureDatabaseWithinLimit(database: initSqlJs.Database, maxDatabaseBytes: number): void {
    const pageSize = readPragmaNumber(database, 'page_size');
    const pageCount = readPragmaNumber(database, 'page_count');
    // Reject only databases that exceed the configured limit.
    if (pageSize * pageCount > maxDatabaseBytes) {
        throw new Error('Database exceeds the database file-size limit');
    }
}

function readPragmaNumber(database: initSqlJs.Database, name: 'page_size' | 'page_count'): number {
    const result = database.exec(`PRAGMA ${name}`);
    const value = result[0]?.values[0]?.[0];
    if (typeof value !== 'number') {
        throw new Error(`Could not read SQLite ${name}`);
    }
    else {
        return value;
    }
}

function utf8ByteLength(value: string): number {
    let bytes = 0;
    for (const character of value) {
        const codePoint = character.codePointAt(0);
        if (codePoint === undefined) {
            // Nothing to count.
        }
        else {
            bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
        }
    }
    return bytes;
}

function toInitDbFail(error: unknown): InitDbFail {
    if (typeof error === 'object' && error !== null && 'kind' in error && 'details' in error
        && typeof error.details === 'string') {
        if (error.kind === 'run-init-script') {
            return { kind: 'run-init-script', details: error.details };
        }
        else if (error.kind === 'read-sqlite-db') {
            return { kind: 'read-sqlite-db', details: error.details };
        }
        else if (error.kind === 'database-engine') {
            return { kind: 'database-engine', details: error.details };
        }
        else if (error.kind === 'unsupported-database-system-version'
            && 'system' in error && error.system === 'sqlite'
            && 'requiredMinVersion' in error && typeof error.requiredMinVersion === 'string'
            && 'actualVersion' in error && typeof error.actualVersion === 'string') {
            return {
                kind: 'unsupported-database-system-version',
                system: 'sqlite',
                requiredMinVersion: error.requiredMinVersion,
                actualVersion: error.actualVersion,
                details: error.details,
            };
        }
        else {
            return { kind: 'database-engine', details: String(error) };
        }
    }
    else {
        return { kind: 'database-engine', details: String(error) };
    }
}
