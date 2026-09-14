import { Effect } from 'effect';

import type {
    DatabaseConnection,
    DatabaseEngine,
    DatabaseEngineFail,
    DbData,
    InitDbFail,
    SqlResult,
} from '../api';
import type { SqliteRequest, SqliteResponse } from './protocol';
import type { Schema, TableInfo } from '../../schema/model';
import { extractTableInfo } from '../../schema/parse';
import type { ParseSchemaFail } from '../../schema/status';
import { defaultSettingsStore } from '../../settings/store';
import type { SettingsStore } from '../../settings/store';
import { assert } from '../../util';
import { reserveOpenDatabaseSlot, type OpenDatabaseSlot } from '../open-database-limit';
import type { DatabaseSystem } from '../system';

export type SqliteTransport = {
    request(request: SqliteRequest): Promise<SqliteResponse>,
    dispose(): void,
};

export type SqliteTransportFactory = (onFailure: () => void) => SqliteTransport;

export class SqliteProtocolEngine implements DatabaseEngine {
    private transport: SqliteTransport | null = null;
    private nextRequestId = 0;
    private nextDatabaseId = 0;
    private readonly openDatabaseSlots = new Map<number, OpenDatabaseSlot>();
    private disposed = false;

    constructor(
        private readonly createTransport: SqliteTransportFactory,
        private readonly settingsStore: SettingsStore = defaultSettingsStore,
    ) {}

    open(
        source: DbData | null,
        system: DatabaseSystem,
        systemMinVersion: string,
    ): Effect.Effect<DatabaseConnection, InitDbFail> {
        return Effect.gen(this, function* () {
            if (this.disposed) {
                return yield* Effect.fail({ kind: 'database-engine' as const, details: 'Database engine is disposed' });
            }
            else if (system !== 'sqlite') {
                return yield* Effect.fail({
                    kind: 'unsupported-database-system' as const,
                    system,
                    details: `The SQLite database engine does not support the ${system} database system`,
                });
            }
            else if (source !== null && source.system !== system) {
                return yield* Effect.fail({
                    kind: 'unsupported-database-system' as const,
                    system: source.system,
                    details: `The database source uses ${source.system}, but ${system} was requested`,
                });
            }
            else {
                const settings = this.settingsStore.getSnapshot();
                const slot = reserveOpenDatabaseSlot(settings.maxOpenDatabases);
                if (slot === null) {
                    return yield* Effect.fail({
                        kind: 'database-engine' as const,
                        details: `At most ${settings.maxOpenDatabases} databases may be open at once`,
                    });
                }
                else {
                    const databaseId = this.nextDatabaseId++;
                    let slotReserved: OpenDatabaseSlot | null = slot;
                    return yield* Effect.tryPromise<SqliteResponse, DatabaseEngineFail>({
                        try: () => this.send({
                            type: 'open',
                            requestId: this.nextRequestId++,
                            databaseId,
                            source,
                            systemMinVersion,
                            maxDatabaseBytes: settings.maxDatabaseFileBytes,
                        }),
                        catch: toEngineFail,
                    }).pipe(
                        Effect.flatMap((response): Effect.Effect<DatabaseConnection, InitDbFail> => {
                            switch (response.type) {
                                case 'opened':
                                    this.openDatabaseSlots.set(databaseId, slot);
                                    slotReserved = null;
                                    return Effect.succeed(new SqliteProtocolConnection(this, databaseId));
                                case 'request-error':
                                    return Effect.fail(response.error);
                                case 'executed':
                                case 'execution-error':
                                case 'closed':
                                    return Effect.fail(unexpectedResponse(response.type));
                                default: {
                                    const _n: never = response;
                                    return _n;
                                }
                            }
                        }),
                        Effect.ensuring(Effect.sync(() => {
                            // Release the reserved slot unless the connection took ownership of it.
                            slotReserved?.release();
                        })),
                    );
                }
            }
        });
    }

    exec(databaseId: number, sql: string): Effect.Effect<SqlResult, DatabaseEngineFail> {
        return Effect.suspend(() => {
            const settings = this.settingsStore.getSnapshot();
            return Effect.tryPromise<SqliteResponse, DatabaseEngineFail>({
                try: () => this.send({
                    type: 'exec',
                    requestId: this.nextRequestId++,
                    databaseId,
                    sql,
                    maxResultRows: settings.maxQueryResultRows,
                    maxDatabaseBytes: settings.maxDatabaseFileBytes,
                }),
                catch: toEngineFail,
            }).pipe(Effect.flatMap((response): Effect.Effect<SqlResult, DatabaseEngineFail> => {
                switch (response.type) {
                    case 'executed':
                        return Effect.succeed({ type: 'succ' as const, sql, result: response.result });
                    case 'execution-error':
                        return Effect.succeed({ type: 'error' as const, sql, message: response.message });
                    case 'request-error':
                        return Effect.fail(toEngineFail(response.error));
                    case 'opened':
                    case 'closed':
                        return Effect.fail(unexpectedResponse(response.type));
                    default: {
                        const _n: never = response;
                        return _n;
                    }
                }
            }));
        });
    }

    close(databaseId: number): Effect.Effect<void, DatabaseEngineFail> {
        return Effect.gen(this, function* () {
            if (this.disposed) {
                return;
            }
            else {
                const response = yield* Effect.tryPromise<SqliteResponse, DatabaseEngineFail>({
                    try: () => this.send({
                        type: 'close',
                        requestId: this.nextRequestId++,
                        databaseId,
                    }),
                    catch: toEngineFail,
                });

                switch (response.type) {
                    case 'closed':
                        // Release the global slot only while this connection owns it.
                        this.openDatabaseSlots.get(databaseId)?.release();
                        this.openDatabaseSlots.delete(databaseId);
                        return;
                    case 'request-error':
                        return yield* Effect.fail(toEngineFail(response.error));
                    case 'opened':
                    case 'executed':
                    case 'execution-error':
                        return yield* Effect.fail(unexpectedResponse(response.type));
                    default: {
                        const _n: never = response;
                        return _n;
                    }
                }
            }
        });
    }

    dispose(): void {
        // Disposal is idempotent.
        if (!this.disposed) {
            this.disposed = true;
            this.transport?.dispose();
            this.transport = null;
            this.releaseOpenDatabaseSlots();
        }
    }

    private send(request: SqliteRequest): Promise<SqliteResponse> {
        if (this.disposed) {
            return Promise.reject(new Error('Database engine is disposed'));
        }
        else {
            return this.getTransport().request(request);
        }
    }

    private getTransport(): SqliteTransport {
        if (this.transport === null) {
            let transport: SqliteTransport | null = null;
            transport = this.createTransport(() => {
                // A failure resets the transport only if it still belongs to this engine.
                if (transport !== null && this.transport === transport) {
                    transport.dispose();
                    this.transport = null;
                    this.releaseOpenDatabaseSlots();
                }
            });
            this.transport = transport;
            return transport;
        }
        else {
            return this.transport;
        }
    }

    private releaseOpenDatabaseSlots(): void {
        for (const slot of this.openDatabaseSlots.values()) {
            slot.release();
        }
        this.openDatabaseSlots.clear();
    }
}

class SqliteProtocolConnection implements DatabaseConnection {
    private closed = false;

    constructor(
        private readonly engine: SqliteProtocolEngine,
        private readonly databaseId: number,
    ) {}

    exec(sql: string): Effect.Effect<SqlResult, DatabaseEngineFail> {
        return Effect.suspend(() => {
            if (this.closed) {
                return Effect.fail({ kind: 'database-engine' as const, details: 'Database connection is closed' });
            }
            else {
                return this.engine.exec(this.databaseId, sql);
            }
        });
    }

    querySchema(): Effect.Effect<Schema, DatabaseEngineFail | ParseSchemaFail> {
        return Effect.gen(this, function* () {
            const results = yield* this.exec('SELECT sql FROM sqlite_schema WHERE type=\'table\'');
            if (results.type === 'error') {
                return yield* Effect.fail({ kind: 'parse-schema' as const, details: 'Could not retrieve database information' });
            }
            else {
                assert(results.result.length <= 1, 'Expected at most one result');
                const tableInfos: TableInfo[] = [];

                // Only non-empty databases have schema rows to inspect.
                if (results.result.length === 1) {
                    for (const createTableStatement of results.result[0].values) {
                        if (createTableStatement.length !== 1 || typeof createTableStatement[0] !== 'string') {
                            return yield* Effect.fail({ kind: 'parse-schema' as const, details: 'Could not retrieve table information' });
                        }
                        else {
                            const tableInfoResult = extractTableInfo(createTableStatement[0]);
                            if (!tableInfoResult.ok) {
                                if (tableInfoResult.error.kind === 'extraction') {
                                    return yield* Effect.fail({
                                        kind: 'parse-schema' as const,
                                        details: 'Extraction failed: ' + tableInfoResult.error.details,
                                    });
                                }
                                else if (tableInfoResult.error.kind === 'internal-table') {
                                    // Internal SQLite tables are intentionally excluded from the schema.
                                }
                                else {
                                    const _n: never = tableInfoResult.error;
                                    return _n;
                                }
                            }
                            else {
                                tableInfos.push(tableInfoResult.data);
                            }
                        }
                    }
                }
                return tableInfos;
            }
        });
    }

    close(): Effect.Effect<void, DatabaseEngineFail> {
        return Effect.gen(this, function* () {
            if (this.closed) {
                return;
            }
            else {
                this.closed = true;
                yield* this.engine.close(this.databaseId);
            }
        });
    }
}

function unexpectedResponse(type: SqliteResponse['type']): DatabaseEngineFail {
    return { kind: 'database-engine', details: `Unexpected response from SQLite transport: ${type}` };
}

function toEngineFail(error: unknown): DatabaseEngineFail {
    if (typeof error === 'object' && error !== null && 'kind' in error && error.kind === 'database-engine'
        && 'details' in error && typeof error.details === 'string') {
        return { kind: 'database-engine', details: error.details };
    }
    else {
        return { kind: 'database-engine', details: String(error) };
    }
}
