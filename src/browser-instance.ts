import { StaticDb, RunInitScriptFail, FetchInitScriptFail } from "./sql-js-api";
import { Schema, TableInfo, extractTableInfo } from "./schema";
import { ParseSchemaFail, SqlResult, SqlResultError } from "./sql-js-api";

import { Fail, FileSource, Success, assert, generateId, materializeFileSource } from "./util";

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
export type StatusFailed  = { kind: 'failed', error: FetchInitScriptFail | RunInitScriptFail } // `db` has been requested to activate and failed to do so
export type Status = StatusPending | StatusActive | StatusFailed

export class BrowserInstance {
   
    readonly id: string;

    private name:   string;

    private db:     Promise<Success<StaticDb> | Fail<FetchInitScriptFail>>;

    private status: Status = { kind: 'pending' };
    
    /**
     * The schema is only created once and then cached.
     * Notice: When
     * - ... the db structure changes by reloading a new init script, the schema *is* updated.
     * - ... the db structure changes by queries, e.g. by prompting `ALTER TABLE` statements, the schema *is not* updated.
     */
    private schema: Promise<Success<Schema> | Fail<FetchInitScriptFail | RunInitScriptFail | ParseSchemaFail>> | null = null;

    constructor(name: string, dbSource: FileSource) {
        this.id = 'browser-instance-' + generateId();

        this.name = name;
        this.db = materializeFileSource(dbSource).then(initialSqlScriptRes => {
            if (initialSqlScriptRes.ok) {
                return { ok: true, data: new StaticDb(initialSqlScriptRes.data) };
            }
            else {
                return { ok: false, error: { kind: 'fetch-init-script', url: initialSqlScriptRes.error.url } };
            }
        });
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


    /////////////////////
    // Database: Reset //
    /////////////////////

    setInitialSqlScript(sql: string) {
        this.db = Promise.resolve({ ok: true, data: new StaticDb(sql) });

        // Reset status
        this.updateStatusAfterReset();
        
        // Invalidate schema
        this.schema = null;
    }


    ////////////////////////
    // Database: Requests //
    ////////////////////////

    async getInitialSqlScript(): Promise<Success<string> | Fail<FetchInitScriptFail>> {
        return this.db.then(dbRes => {
            if (dbRes.ok) {
                return { ok: true, data: dbRes.data.initialSqlScript };
            }
            else {
                return { ok: false, error: dbRes.error };
            }
        });
    }

    /**
     * Technically, no value really is requested.
     * The effect of this operation is though that the status is "active" or "failed"
     */
    async resolve(): Promise<Success<void> | Fail<FetchInitScriptFail | RunInitScriptFail>> {
        return this.db.then((dbRes: Success<StaticDb> | Fail<FetchInitScriptFail>): Promise<Success<void> | Fail<FetchInitScriptFail | RunInitScriptFail>> => {
            if (dbRes.ok) {
                return dbRes.data.resolve();
            }
            else {
                return Promise.resolve({ ok: false, error: dbRes.error });
            }
        })
        .then(res => this.trackStatus(res)); // Track status: "active" or "failed";
    }

    async getSchema(): Promise<Success<Schema> | Fail<FetchInitScriptFail | RunInitScriptFail | ParseSchemaFail>> {
        // Cache schema
        if (this.schema === null) {
            this.schema = this.db.then((dbRes: Success<StaticDb> | Fail<FetchInitScriptFail>): Promise<Success<Schema> | Fail<FetchInitScriptFail | RunInitScriptFail | ParseSchemaFail>> => {
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

    async exec(sql: string): Promise<Success<SqlResult> | Fail<FetchInitScriptFail | RunInitScriptFail>> {
        // Track status: >= "pending"
        this.updateStatusAfterReset();

        return this.db.then((dbRes: Success<StaticDb> | Fail<FetchInitScriptFail>): Promise<Success<SqlResult> | Fail<FetchInitScriptFail | RunInitScriptFail>> => {
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

    private async trackStatus<T>(res: Success<T> | Fail<FetchInitScriptFail | RunInitScriptFail>): Promise<Success<T> | Fail<FetchInitScriptFail | RunInitScriptFail>> {
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

    private async trackStatusWithParseSchemaFail<T>(res: Success<T> | Fail<FetchInitScriptFail | RunInitScriptFail | ParseSchemaFail>): Promise<Success<T> | Fail<FetchInitScriptFail | RunInitScriptFail | ParseSchemaFail>> {
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