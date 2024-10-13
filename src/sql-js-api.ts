// sql.js library
import initSqlJs from 'sql.js';
// This object is configured and provided already in the global context
declare const sqlJs: Promise<initSqlJs.SqlJsStatic>;


// Local
import { Fail, Source, getFilenameExtension, getFilenameWithoutExtension, Success, Named, assert } from './util';
import { Schema, TableInfo, extractTableInfo } from './schema';


/////////////////////////////////////////
// Interface for statically loaded dbs //
/////////////////////////////////////////

export type DbSource = { type: 'initial-sql-script', source: Source<string> } |
                       { type: 'sqlite-db',          source: Source<Uint8Array> }
export type DbData = { type: 'initial-sql-script', sql:  string } |
                     { type: 'sqlite-db',          data: Uint8Array }

export type FetchDbFail       = { kind: 'fetch-db', url: string }

export type RunInitScriptFail = { kind: 'run-init-script', details: string }
export type ReadSqliteDbFail  = { kind: 'read-sqlite-db', details: string }
export type InitDbFail        = RunInitScriptFail | ReadSqliteDbFail

export type ParseSchemaFail   = { kind: 'parse-schema', details: string };


/**
 * Terminology:
 * - "resolved" means that the `db` promise is resolved
 */
export class StaticDb {
    private db: Promise<Success<initSqlJs.Database> | Fail<InitDbFail>>;

    constructor(readonly source: DbData | null) {
        this.db = sqlJs.then(SQL => {
            if (this.source === null) {
                const db = new SQL.Database();

                // Success: Empty db
                return { ok: true, data: db };
            }
            else if (this.source.type === 'initial-sql-script') {
                const db = new SQL.Database();
                try {
                    db.run(this.source.sql);
                    
                    // Success: Initial SQL script succeeded
                    return { ok: true, data: db };
                }
                catch (e) {
                    // Failure: Initial SQL script failed
                    return { ok: false, error: { kind: 'run-init-script', details: String(e) } };
                }
            }
            else {
                try {
                    const db = new SQL.Database(this.source.data);

                    // We need to manually check whether the db actually works
                    const res = db.exec(`SELECT name FROM sqlite_master WHERE type='table'`);

                    if (res.length !== 1) {
                        return { ok: false, error: { kind: 'read-sqlite-db', details: 'Could not read from db' } };
                    }
    
                    // Success: SQLite db read succeeded
                    return { ok: true, data: db };
                }
                catch (e) {
                    // Failure: SQLite db read failed
                    return { ok: false, error: { kind: 'read-sqlite-db', details: String(e) } };
                }
            }
        });
    }

    async exec(sql: string): Promise<Success<SqlResult> | Fail<InitDbFail>> {
        // Forward potential failure
        return this.db.then((dbRes) => {
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
        });
    }

    async querySchema(): Promise<Success<Schema> | Fail<InitDbFail | ParseSchemaFail>> {
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

    async resolve(): Promise<Success<void> | Fail<InitDbFail>> {
        return this.db.then((res) => {
            if (res.ok) {
                return { ok: true, data: undefined };
            }
            else {
                return res;
            }
        });
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


//////////////////////
// SQL result types //
//////////////////////

export type SqlResultSucc   = { type: 'succ',  timestamp: Date, sql: string, result: initSqlJs.QueryExecResult[] }
export type SqlResultError  = { type: 'error', timestamp: Date, sql: string, message: string }
export type SqlResult = SqlResultSucc | SqlResultError 

export function sqlResultHash(r: SqlResult): string {
    return r.timestamp.getTime() + r.sql;
}