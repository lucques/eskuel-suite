import { Effect } from 'effect';

import type { DatabaseConnection, DatabaseEngineFail, SqlTable, SqlValue } from '../api';
import type { Schema, TableInfo } from '../../schema/model';
import type { ParseSchemaFail } from '../../schema/status';

const columnsSql = `
SELECT
    namespace.nspname AS schema_name,
    relation.relname AS table_name,
    attribute.attname AS column_name,
    pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
    attribute.attnum AS column_number
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
WHERE relation.relkind IN ('r', 'p')
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND namespace.nspname <> 'pg_catalog'
    AND namespace.nspname <> 'information_schema'
    AND pg_catalog.pg_table_is_visible(relation.oid)
ORDER BY namespace.nspname, relation.relname, attribute.attnum
`;

const primaryKeysSql = `
SELECT
    namespace.nspname AS schema_name,
    relation.relname AS table_name,
    attribute.attname AS column_name,
    key_column.ordinality::integer AS key_position
FROM pg_catalog.pg_index AS index_definition
JOIN pg_catalog.pg_class AS relation ON relation.oid = index_definition.indrelid
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
JOIN LATERAL unnest(index_definition.indkey) WITH ORDINALITY
    AS key_column(attribute_number, ordinality) ON true
JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid = relation.oid
    AND attribute.attnum = key_column.attribute_number
WHERE index_definition.indisprimary
    AND namespace.nspname <> 'pg_catalog'
    AND namespace.nspname <> 'information_schema'
    AND pg_catalog.pg_table_is_visible(relation.oid)
ORDER BY namespace.nspname, relation.relname, key_column.ordinality
`;

const foreignKeysSql = `
SELECT
    source_namespace.nspname AS schema_name,
    source_relation.relname AS table_name,
    source_attribute.attname AS column_name,
    target_relation.relname AS foreign_table_name,
    target_attribute.attname AS foreign_column_name,
    key_column.ordinality::integer AS key_position
FROM pg_catalog.pg_constraint AS constraint_definition
JOIN pg_catalog.pg_class AS source_relation ON source_relation.oid = constraint_definition.conrelid
JOIN pg_catalog.pg_namespace AS source_namespace ON source_namespace.oid = source_relation.relnamespace
JOIN pg_catalog.pg_class AS target_relation ON target_relation.oid = constraint_definition.confrelid
JOIN LATERAL unnest(constraint_definition.conkey, constraint_definition.confkey) WITH ORDINALITY
    AS key_column(source_attribute_number, target_attribute_number, ordinality) ON true
JOIN pg_catalog.pg_attribute AS source_attribute
    ON source_attribute.attrelid = source_relation.oid
    AND source_attribute.attnum = key_column.source_attribute_number
JOIN pg_catalog.pg_attribute AS target_attribute
    ON target_attribute.attrelid = target_relation.oid
    AND target_attribute.attnum = key_column.target_attribute_number
WHERE constraint_definition.contype = 'f'
    AND source_namespace.nspname <> 'pg_catalog'
    AND source_namespace.nspname <> 'information_schema'
    AND pg_catalog.pg_table_is_visible(source_relation.oid)
ORDER BY source_namespace.nspname, source_relation.relname, constraint_definition.oid, key_column.ordinality
`;

type MutableTableInfo = {
    name: string,
    cols: { name: string, type: string }[],
    primaryKey: string[],
    foreignKeys: TableInfo['foreignKeys'],
};

export function queryPgliteSchema(
    connection: DatabaseConnection,
): Effect.Effect<Schema, DatabaseEngineFail | ParseSchemaFail> {
    return Effect.gen(function* () {
        const columns = yield* querySingleTable(connection, columnsSql);
        const primaryKeys = yield* querySingleTable(connection, primaryKeysSql);
        const foreignKeys = yield* querySingleTable(connection, foreignKeysSql);
        const tables = new Map<string, MutableTableInfo>();

        for (const row of columns.values) {
            const values = readStrings(row, 4);
            if (values === null) {
                return yield* schemaFailure('PostgreSQL column query returned an unexpected value');
            }
            else {
                const [schemaName, tableName, columnName, dataType] = values;
                const key = tableKey(schemaName, tableName);
                let table = tables.get(key);
                if (table === undefined) {
                    table = { name: tableName, cols: [], primaryKey: [], foreignKeys: {} };
                    tables.set(key, table);
                }
                table.cols.push({ name: columnName, type: dataType });
            }
        }

        for (const row of primaryKeys.values) {
            const values = readStrings(row, 3);
            if (values === null) {
                return yield* schemaFailure('PostgreSQL primary-key query returned an unexpected value');
            }
            else {
                const [schemaName, tableName, columnName] = values;
                const table = tables.get(tableKey(schemaName, tableName));
                if (table === undefined) {
                    return yield* schemaFailure('A PostgreSQL primary key refers to an unknown table');
                }
                else {
                    table.primaryKey.push(columnName);
                }
            }
        }

        for (const row of foreignKeys.values) {
            const values = readStrings(row, 5);
            if (values === null) {
                return yield* schemaFailure('PostgreSQL foreign-key query returned an unexpected value');
            }
            else {
                const [schemaName, tableName, columnName, foreignTable, foreignColumn] = values;
                const table = tables.get(tableKey(schemaName, tableName));
                if (table === undefined) {
                    return yield* schemaFailure('A PostgreSQL foreign key refers to an unknown table');
                }
                else {
                    const parts = table.foreignKeys[columnName] ?? [];
                    parts.push({ kind: 'column', foreignTable, foreignCol: foreignColumn });
                    table.foreignKeys[columnName] = parts;
                }
            }
        }

        return [...tables.values()];
    });
}

function querySingleTable(
    connection: DatabaseConnection,
    sql: string,
): Effect.Effect<SqlTable, DatabaseEngineFail | ParseSchemaFail> {
    return Effect.gen(function* () {
        const result = yield* connection.exec(sql);
        if (result.type === 'error') {
            return yield* schemaFailure(`Could not query PostgreSQL schema: ${result.message}`);
        }
        else if (result.result.length !== 1) {
            return yield* schemaFailure('PostgreSQL schema query returned an unexpected number of result tables');
        }
        else if (result.result[0].truncated === true) {
            return yield* schemaFailure('PostgreSQL schema exceeds the configured query-result limit');
        }
        else {
            return result.result[0];
        }
    });
}

function readStrings(row: SqlValue[], count: number): string[] | null {
    const values = row.slice(0, count);
    if (values.length !== count || values.some(value => typeof value !== 'string')) {
        return null;
    }
    else {
        return values as string[];
    }
}

function tableKey(schemaName: string, tableName: string): string {
    return `${schemaName}\0${tableName}`;
}

function schemaFailure(details: string): Effect.Effect<never, ParseSchemaFail> {
    return Effect.fail({ kind: 'parse-schema', details });
}
