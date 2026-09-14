import type * as Effect from 'effect/Effect';

import type { Schema } from '../schema/model';
import type { ParseSchemaFail } from '../schema/status';
import type { ParseSqlMetadataFail, DatabaseSystem } from './system';

export type DbData =
    | {
        type: 'initial-sql-script',
        system: DatabaseSystem,
        systemMinVersion: string,
        sql: string,
    }
    | {
        type: 'sqlite-db',
        system: 'sqlite',
        systemMinVersion: string,
        data: Uint8Array,
    };

export type SqlValue = string | number | boolean | Uint8Array | null;

export type SqlTable = {
    columns: string[],
    // Every row contains exactly one value per column.
    values: SqlValue[][],
    // True when `values` does not contain the complete result table, regardless of whether the database engine or a UI-facing session omitted the remaining rows.
    truncated?: boolean,
};

export type SqlResultSucc = {
    type: 'succ',
    sql: string,
    result: SqlTable[],
};

export type SqlResultError = {
    type: 'error',
    sql: string,
    message: string,
};

export type SqlResult = SqlResultSucc | SqlResultError;

export type RunInitScriptFail = { kind: 'run-init-script', details: string };
export type ReadSqliteDbFail = { kind: 'read-sqlite-db', details: string };
export type UnsupportedDatabaseSystemFail = {
    kind: 'unsupported-database-system';
    system: DatabaseSystem;
    details: string;
};
export type DatabaseEngineFail = { kind: 'database-engine', details: string };
export type UnsupportedDatabaseSystemVersionFail = {
    kind: 'unsupported-database-system-version';
    system: DatabaseSystem;
    requiredMinVersion: string;
    actualVersion: string;
    details: string;
};
export type InitDbFail =
    | RunInitScriptFail
    | ReadSqliteDbFail
    | ParseSqlMetadataFail
    | UnsupportedDatabaseSystemFail
    | UnsupportedDatabaseSystemVersionFail
    | DatabaseEngineFail;
export interface DatabaseConnection {
    exec(sql: string): Effect.Effect<SqlResult, DatabaseEngineFail>;
    querySchema(): Effect.Effect<Schema, DatabaseEngineFail | ParseSchemaFail>;
    close(): Effect.Effect<void, DatabaseEngineFail>;
}

/**
 * A database engine owns runtime resources such as a Web Worker. Connections
 * opened by it share those resources, but represent independent databases.
 *
 * The game, browser, and editor depend only on this contract. System-routing
 * engines select the SQLite or PGlite adapter at the composition boundary.
 */
export interface DatabaseEngine {
    open(
        source: DbData | null,
        system: DatabaseSystem,
        systemMinVersion: string,
    ): Effect.Effect<DatabaseConnection, InitDbFail>;
    dispose(): void;
}

export type DatabaseEngineFactory = () => DatabaseEngine;
