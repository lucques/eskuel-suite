// sql.js library
import initSqlJs from 'sql.js';
// This object is configured and provided already in the global context
declare const sqlJs: Promise<initSqlJs.SqlJsStatic>;


// Local
import { Fail, RawSource, getFilenameExtension, getFilenameWithoutExtension, Success, Named, assert } from './util';
import { Schema, TableInfo, extractTableInfo } from './schema';


/////////////////////////////////////////
// Interface for statically loaded dbs //
/////////////////////////////////////////

export type DbSource = { type: 'initial-sql-script', source: RawSource<string> } |
                       { type: 'sqlite-db',          source: RawSource<Uint8Array> }
export type DbData = { type: 'initial-sql-script', sql:  string } |
                     { type: 'sqlite-db',          data: Uint8Array }

export type FetchDbFail       = { kind: 'fetch-db', url: string }
export type RunInitScriptFail = { kind: 'run-init-script', details: string }
export type ReadSqliteDbFail  = { kind: 'read-sqlite-db', details: string }
export type ParseSchemaFail   = { kind: 'parse-schema', details: string };


/**
 * Terminology:
 * - "resolved" means that the `db` promise is resolved
 */
export class StaticDb {
    private db: Promise<Success<initSqlJs.Database> | Fail<RunInitScriptFail | ReadSqliteDbFail>> | null = null;

    constructor(readonly source: DbData) { }

    async exec(sql: string): Promise<Success<SqlResult> | Fail<RunInitScriptFail | ReadSqliteDbFail>> {
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

    async querySchema(): Promise<Success<Schema> | Fail<RunInitScriptFail | ReadSqliteDbFail | ParseSchemaFail>> {
        const resultsRes = await this.exec('SELECT sql FROM sqlite_schema WHERE type=\'table\'');
        // Forward potential failure
        if (!resultsRes.ok) {
            return resultsRes;
        }
        const results = resultsRes.data;

        if (results.type === 'error') {
            return { ok: false, error: { kind: 'parse-schema', details: 'Could not retrieve db infos' } };
        }

        assert(results.result.length <= 1, 'Expected at most one result');

        const tableInfos: TableInfo[] = [];

        if (results.result.length === 1) {    
            const createTableStmts = results.result[0].values;
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
        }

        return { ok: true, data: tableInfos };
    }


    /////////////////////////
    // Explicit resolution //
    /////////////////////////
    
    triggerResolve(): void {
        this.getDb();
    }

    async resolve(): Promise<Success<void> | Fail<RunInitScriptFail | ReadSqliteDbFail>> {
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

    private async getDb(): Promise<Success<initSqlJs.Database> | Fail<RunInitScriptFail | ReadSqliteDbFail>> {
        if (this.db === null) {                       
            const SQL = await sqlJs;
            
            if (this.source.type === 'initial-sql-script') {
                const db = new SQL.Database();
                try {
                    db.run(this.source.sql);
                    
                    // Success: Initial SQL script succeeded
                    this.db = Promise.resolve({ ok: true, data: db });
                }
                catch (e) {
                    // Failure: Initial SQL script failed
                    this.db = Promise.resolve({ ok: false, error: { kind: 'run-init-script', details: String(e) } });
                }
            }
            else {
                try {
                    const db = new SQL.Database(this.source.data);

                    // Success: SQLite db read succeeded
                    this.db = Promise.resolve({ ok: true, data: db });
                }
                catch (e) {
                    // Failure: SQLite db read failed
                    this.db = Promise.resolve({ ok: false, error: { kind: 'read-sqlite-db', details: String(e) } });
                }
            }
        }
        return this.db;
        
    }
}

export function makeNamedDbSource(url: string): Named<DbSource> {
    const extension = getFilenameExtension(url);
    const name      = getFilenameWithoutExtension(url);

    if (extension === 'sql') {
        return { type: 'initial-sql-script', source: { type: 'fetch', url }, name };
    }
    else {
        return { type: 'sqlite-db', source: { type: 'fetch', url }, name };
    }
}

// export function materializeDbSource(source: DbSource): Promise<Success<DbData> | Fail<FetchFail>> {



//////////////////////
// SQL result types //
//////////////////////

export type SqlResultSucc   = { type: 'succ',  timestamp: Date, sql: string, result: initSqlJs.QueryExecResult[] }
export type SqlResultError  = { type: 'error', timestamp: Date, sql: string, message: string }
export type SqlResult = SqlResultSucc | SqlResultError 

export function sqlResultHash(r: SqlResult): string {
    return r.timestamp.getTime() + r.sql;
}