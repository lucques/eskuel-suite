import { StaticDb, FetchDbFail, ReadSqliteDbFail, DbSource, InitDbFail } from "./sql-js-api";
import { Schema } from "./schema";
import { ParseSchemaFail, SqlResult } from "./sql-js-api";
import { Fail, Success, assert, generateId, materializeBinarySource, materializeTextSource } from "./util";
import { LoadingStatus } from "./react";

// Terminology:
// - "instance": Represents basically the model behind a tab
// - "status"
//   - Held in field `status`
//   - Describes the life cycle of the instance and usually settles in the beginning of the instance's life
//   - Affected by initial loading of the field `db`.
//     The status can be depicted by a simple state machine, starting with "pending".
//     Transitions are reflexive and monotone (= once active, always active; once failed, always failed).
//     - "pending" -- game_ok-------> "active"
//     - "pending" --!game_ok-------> "failed"
//     - "pending" -- set_init_sql--> "pending": While loading `db` is reset
//     - "active"  -- game_ok-------> "active"
//     - "active"  -- set_init_sql--> "pending": `db` has been been reset; activation is implicitly requested
//     - "failed"  --!game_ok-------> "failed"
//     - "failed"  -- set_init_sql--> "pending": `db` has been been reset; activation is implicitly requested
//   - The status is not affected by the schema which may fail for itself.
// - "state"
//    - The currently held db *is* the editor's state 

export type StatusPending = { kind: 'pending' } // `db` has been requested to activate, but request may be unresolved
export type StatusActive  = { kind: 'active'  } // `db` has been requested to activate and done so successfully
export type StatusFailed  = { kind: 'failed', error: FetchDbFail | InitDbFail } // `db` has been requested to activate and failed to do so
export type Status = StatusPending | StatusActive | StatusFailed

export function statusToLoadingStatus(status: Status): LoadingStatus {
    if (status.kind === 'pending') {
        return { kind: 'pending' };
    }
    else if (status.kind === 'failed' && status.error.kind === 'fetch-db') {
        return { kind: 'failed', error: 'Fehler beim Laden der Datenbank-Datei ' + status.error.url };
    }
    else if (status.kind === 'failed' && status.error.kind === 'run-init-script') {
        return { kind: 'failed', error: 'Fehler beim Ausführen des Initialisierungs-Skripts: ' + status.error.details };
    }
    else if (status.kind === 'failed' && status.error.kind === 'read-sqlite-db') {
        return { kind: 'failed', error: 'Fehler beim Lesen der SQLite-Datenbank: ' + status.error.details };
    }
    else {
        return { kind: 'loaded' };
    }
}

export class BrowserInstance {
   
    readonly id: string;

    private name:   string;

    private db:     Promise<Success<StaticDb> | Fail<FetchDbFail>>;

    private status: Status = { kind: 'pending' };
    
    /**
     * The schema is only created once and then cached.
     * Notice: When
     * - ... the db structure changes by reloading a new init script, the schema *is* updated.
     * - ... the db structure changes by queries, e.g. by prompting `ALTER TABLE` statements, the schema *is not* updated.
     */
    private schema: Promise<Success<Schema> | Fail<FetchDbFail | InitDbFail | ParseSchemaFail>> | null = null;

    constructor(name: string, source: DbSource) {
        this.id = 'browser-instance-' + generateId();

        this.name = name;

        if (source.type === 'initial-sql-script') {
            this.db = materializeTextSource(source.source).then(initialSqlScriptRes => {
                if (initialSqlScriptRes.ok) {
                    return { ok: true, data: new StaticDb({ type: 'initial-sql-script', sql: initialSqlScriptRes.data } ) };
                }
                else {
                    return { ok: false, error: { kind: 'fetch-db', url: initialSqlScriptRes.error.url } };
                }
            });
        }
        else {
            this.db = materializeBinarySource(source.source).then(sqliteDbRes => {
                if (sqliteDbRes.ok) {
                    return { ok: true, data: new StaticDb({ type: 'sqlite-db', data: sqliteDbRes.data }) };
                }
                else {
                    return { ok: false, error: { kind: 'fetch-db', url: sqliteDbRes.error.url } };
                }
            });
        }
    }

    getStatus(): Status {
        return this.status;
    }


    ///////////////////////////
    // Superficial meta data //
    ///////////////////////////

    getName(): string {
        return this.name;
    }

    setName(name: string) {
        this.name = name;
    }


    ////////////////////////
    // Database: Requests //
    ////////////////////////

    /**
     * Technically, no value really is requested.
     * The effect of this operation is though that the status is "active" or "failed"
     */
    async resolve(): Promise<Success<void> | Fail<FetchDbFail | InitDbFail>> {
        return this.db.then((dbRes: Success<StaticDb> | Fail<FetchDbFail>): Promise<Success<void> | Fail<FetchDbFail | InitDbFail | ReadSqliteDbFail>> => {
            if (dbRes.ok) {
                return dbRes.data.resolve();
            }
            else {
                return Promise.resolve({ ok: false, error: dbRes.error });
            }
        })
        .then(res => this.trackStatus(res)); // Track status: "active" or "failed";
    }

    async getSchema(): Promise<Success<Schema> | Fail<FetchDbFail | InitDbFail | ParseSchemaFail>> {
        // Cache schema
        if (this.schema === null) {
            this.schema = this.db.then((dbRes: Success<StaticDb> | Fail<FetchDbFail>): Promise<Success<Schema> | Fail<FetchDbFail | InitDbFail | ParseSchemaFail>> => {
                if (dbRes.ok) {
                    return dbRes.data.querySchema();
                }
                else {
                    return Promise.resolve({ ok: false, error: dbRes.error });
                }
            })
            .then(res => this.trackStatusWithParseSchemaFail(res)); // Track status: "active" or "failed"                
        }
        return this.schema;
    }

    async exec(sql: string): Promise<Success<SqlResult> | Fail<FetchDbFail | InitDbFail>> {
        // Track status: >= "pending"
        this.updateStatusAfterReset();

        return this.db.then((dbRes: Success<StaticDb> | Fail<FetchDbFail | InitDbFail>): Promise<Success<SqlResult> | Fail<FetchDbFail | InitDbFail>> => {
            if (dbRes.ok) {
                return dbRes.data.exec(sql);
            }
            else {
                return Promise.resolve({ ok: false, error: dbRes.error });
            }
        })
        .then(res => this.trackStatus(res)); // Track status: "active" or "failed"
    }


    //////////////////
    // Track status //
    //////////////////

    // For every async database operation, these two functions must be called:
    // - `resolveTriggered` sets status at least on "pending" when the operation is triggered
    // - `trackStatus` and `trackStatusWithParseSchemaFail` set status on "failed"/"active" when the operation is resolved

    private updateStatusAfterReset() {
        // "pending" -> "pending"
        // "active"  -> "pending"
        // "failed"  -> "pending"
        if (this.status.kind === 'active' || this.status.kind === 'failed') {
            this.status = {kind: 'pending'};
        }
    }

    private async trackStatus<T>(res: Success<T> | Fail<FetchDbFail | InitDbFail>): Promise<Success<T> | Fail<FetchDbFail | InitDbFail>> {
        // "pending" -> "active"
        // "active"  -> "active"
        if ((this.status.kind === 'pending' || this.status.kind === "active") && res.ok) {
            this.status = { kind: 'active' };
        }
        // "pending" -> "failed"
        // "failed"  -> "failed"
        else if ((this.status.kind === 'pending' || this.status.kind === "failed") && !res.ok) {
            this.status = { kind: 'failed', error: res.error };
        }
        else {
            assert(false, 'Illegal status transition');
        }
        return res;
    }

    private async trackStatusWithParseSchemaFail<T>(res: Success<T> | Fail<FetchDbFail | InitDbFail | ParseSchemaFail>): Promise<Success<T> | Fail<FetchDbFail | InitDbFail | ParseSchemaFail>> {
        // ParseSchemaFail counts as success here, because the database itself works
        const ok = res.ok || (res.error.kind === 'parse-schema');

        // "pending" -> "active"
        // "active"  -> "active"
        if ((this.status.kind === 'pending' || this.status.kind === "active") && ok) {
            this.status = { kind: 'active' };
        }
        // "pending" -> "failed"
        // "failed"  -> "failed"
        else if ((this.status.kind === 'pending' || this.status.kind === "failed") && !ok && res.error.kind !== 'parse-schema') {
            this.status = { kind: 'failed', error: res.error };
        }
        else {
            assert(false, 'Illegal status transition');
        }
        return res;
    }
}
