import { Effect } from 'effect';

import type {
    DatabaseConnection,
    DatabaseEngine,
    DatabaseEngineFail,
    DbData,
    InitDbFail,
    SqlResult,
} from '../api';
import type { Schema } from '../../schema/model';
import type { ParseSchemaFail } from '../../schema/status';
import type { DatabaseSystem } from '../system';
import { reserveOpenDatabaseSlot, type OpenDatabaseSlot } from '../open-database-limit';
import { defaultSettingsStore } from '../../settings/store';
import type { SettingsStore } from '../../settings/store';
import type { PgliteRequest, PgliteResponse } from './protocol';
import { queryPgliteSchema } from './schema';

export type PgliteTransport = {
    request(request: PgliteRequest): Promise<PgliteResponse>,
    dispose(): void,
};

export type PgliteTransportFactory = (onFailure: () => void) => PgliteTransport;

export class PgliteProtocolEngine implements DatabaseEngine {
    private transport: PgliteTransport | null = null;
    private nextRequestId = 0;
    private nextDatabaseId = 0;
    private readonly openDatabaseSlots = new Map<number, OpenDatabaseSlot>();
    private disposed = false;

    constructor(
        private readonly createTransport: PgliteTransportFactory,
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
            else if (system !== 'postgresql') {
                return yield* Effect.fail({
                    kind: 'unsupported-database-system' as const,
                    system,
                    details: `The PGlite database engine does not support the ${system} database system`,
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
                    let reservedSlot: OpenDatabaseSlot | null = slot;
                    return yield* Effect.tryPromise<PgliteResponse, DatabaseEngineFail>({
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
                                    reservedSlot = null;
                                    return Effect.succeed(new PgliteProtocolConnection(this, databaseId));
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
                        Effect.ensuring(Effect.sync(() => reservedSlot?.release())),
                    );
                }
            }
        });
    }

    exec(databaseId: number, sql: string): Effect.Effect<SqlResult, DatabaseEngineFail> {
        return Effect.suspend(() => {
            const settings = this.settingsStore.getSnapshot();
            return Effect.tryPromise<PgliteResponse, DatabaseEngineFail>({
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
                const response = yield* Effect.tryPromise<PgliteResponse, DatabaseEngineFail>({
                    try: () => this.send({
                        type: 'close',
                        requestId: this.nextRequestId++,
                        databaseId,
                    }),
                    catch: toEngineFail,
                });
                switch (response.type) {
                    case 'closed':
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
        if (!this.disposed) {
            this.disposed = true;
            this.transport?.dispose();
            this.transport = null;
            this.releaseOpenDatabaseSlots();
        }
    }

    private send(request: PgliteRequest): Promise<PgliteResponse> {
        if (this.disposed) {
            return Promise.reject(new Error('Database engine is disposed'));
        }
        else {
            return this.getTransport().request(request);
        }
    }

    private getTransport(): PgliteTransport {
        if (this.transport === null) {
            let transport: PgliteTransport | null = null;
            transport = this.createTransport(() => {
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

class PgliteProtocolConnection implements DatabaseConnection {
    private closed = false;

    constructor(
        private readonly engine: PgliteProtocolEngine,
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
        return Effect.suspend(() => {
            if (this.closed) {
                return Effect.fail({ kind: 'database-engine' as const, details: 'Database connection is closed' });
            }
            else {
                return queryPgliteSchema(this);
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

function unexpectedResponse(type: PgliteResponse['type']): DatabaseEngineFail {
    return { kind: 'database-engine', details: `Unexpected response from PGlite transport: ${type}` };
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
