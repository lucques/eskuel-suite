// sql.js library
import initSqlJs from 'sql.js';
// This object is configured and provided already in the global context
declare const sqlJs: Promise<initSqlJs.SqlJsStatic>;


// Local
import { Fail, FileSource, Success } from './util';
import { Schema, TableInfo, extractTableInfo } from './schema';


/////////////////////////////////////////
// Interface for statically loaded dbs //
/////////////////////////////////////////

export type FetchInitScriptFail = { kind: 'fetch-init-script', url: string }
export type RunInitScriptFail   = { kind: 'run-init-script', details: string }
export type ParseSchemaFail     = { kind: 'parse-schema', details: string };


/**
 * Terminology:
 * - "resolved" means that the `db` promise is resolved
 */
export class StaticDb {
    private initialSqlScript: Promise<Success<string> | Fail<FetchInitScriptFail>> | null = null;
    private db:               Promise<Success<initSqlJs.Database> | Fail<FetchInitScriptFail | RunInitScriptFail>> | null = null;

    constructor(readonly source: FileSource) { }

    async getInitialSqlScript(): Promise<Success<string> | Fail<FetchInitScriptFail>> {
        if (this.initialSqlScript === null) {
            // Fetch
            if (this.source.type === 'fetch') {
                const url = this.source.url;
                this.initialSqlScript = fetch(url)
                    .then(response => {
                        // Success
                        if (response.ok) {
                            return response.text().then((sql) => {
                                return { ok: true, data: sql};
                            });
                        }
                        // Fail
                        else {
                            return { ok: false, error: { kind: 'fetch-init-script', url } };
                        }
                    });
            }
            // Inline
            else {
                this.initialSqlScript = Promise.resolve({
                    ok: true,
                    data: this.source.content
                });
            }
        }

        return this.initialSqlScript;
    }

    async exec(sql: string): Promise<Success<SqlResult> | Fail<FetchInitScriptFail | RunInitScriptFail>> {
        // Forward potential failure
        const dbRes = await this.getDb();
        if (!dbRes.ok) {
            return dbRes;
        }
        const db = dbRes.data;

        // Query db
        let result: SqlResult;
        try {
            const results = db.exec(sql);
            result = { type: 'succ', timestamp: new Date(), sql, result: results };
        }
        catch (e: any) {
            result = { type: 'error', timestamp: new Date(), sql, message: e.toString() };
        }

        return { ok: true, data: result };
    }

    async querySchema(): Promise<Success<Schema> | Fail<FetchInitScriptFail | RunInitScriptFail | ParseSchemaFail>> {
        const resultsRes = await this.exec('SELECT sql FROM sqlite_schema WHERE type=\'table\'');
        // Forward potential failure
        if (!resultsRes.ok) {
            return resultsRes;
        }
        const results = resultsRes.data;

        if (results.type === 'error' || results.result.length !== 1) {
            return { ok: false, error: { kind: 'parse-schema', details: 'Could not retrieve db infos' } };
        }

        const createTableStmts = results.result[0].values;

        const tableInfos: TableInfo[] = [];

        for (const createTableStmt of createTableStmts)
        {
            if (createTableStmt.length !== 1 || typeof createTableStmt[0] !== 'string') {
                return { ok: false, error: { kind: 'parse-schema', details: 'Could not retrieve table infos' } };
            }

            const sql = createTableStmt[0];
            const tableInfoResult = extractTableInfo(sql);

            // Failure during extraction?
            if (!tableInfoResult.ok) {
                // Forward
                if (tableInfoResult.error.kind === 'extraction') {
                    return { ok: false, error: { kind: 'parse-schema', details: 'Fail during extraction: ' + tableInfoResult.error.details } };
                }
                // On "internal-table" fail: This table is to be simply ignored
            }
            else {
                const tableInfo = tableInfoResult.data;
                tableInfos.push(tableInfo);
            }
        }

        return { ok: true, data: tableInfos };
    }


    /////////////////////////
    // Explicit resolution //
    /////////////////////////
    
    triggerResolve(): void {
        this.getDb();
    }

    async resolve(): Promise<Success<void> | Fail<FetchInitScriptFail | RunInitScriptFail>> {
        const res = await this.getDb();
        if (res.ok) {
            return { ok: true, data: undefined };
        }
        else {
            return res;
        }
    }


    /////////////
    // Private //
    /////////////

    private async getDb(): Promise<Success<initSqlJs.Database> | Fail<FetchInitScriptFail | RunInitScriptFail>> {
        if (this.db === null) {
            this.db = this.getInitialSqlScript()
                .then(async (sqlScriptResult) => {
                    // SQL script found
                    if (sqlScriptResult.ok) {
                        const sqlScript = sqlScriptResult.data;
                        
                        const SQL = await sqlJs;
                        const db = new SQL.Database();
                        try {
                            db.run(sqlScriptResult.data);
                            
                            // Success: Initial SQL script succeeded
                            return {
                                ok: true,
                                data: db
                            };
                        }
                        // Failure: Initial SQL script failed
                        catch (e) {
                            return {
                                ok: false,
                                error: {
                                    kind: 'run-init-script',
                                    details: String(e)
                                }
                            };
                        }
                    }                    
                    // Failure: Fetch failed
                    else {
                        return sqlScriptResult;
                    }

                });
        }
        return this.db;
    }
}


//////////////////////
// SQL result types //
//////////////////////

export type SqlResultSucc   = { type: 'succ',  timestamp: Date, sql: string, result: initSqlJs.QueryExecResult[] }
export type SqlResultError  = { type: 'error', timestamp: Date, sql: string, message: string }
export type SqlResult = SqlResultSucc | SqlResultError 

export function sqlResultHash(r: SqlResult): string {
    return r.timestamp.getTime() + r.sql;
}