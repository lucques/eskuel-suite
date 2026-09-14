# Schema extraction

## Obtaining the schema

`SqliteProtocolConnection.querySchema()` obtains table definitions directly from SQLite with:

```sql
SELECT sql FROM sqlite_schema WHERE type='table'
```

Each returned `CREATE TABLE` statement is passed to `extractTableInfo()`, which converts it into the application's `TableInfo` model. The parser works only from that statement; it does not issue `PRAGMA` queries or otherwise ask SQLite to resolve individual columns or constraints. The internal `sqlite_sequence` table is deliberately excluded.

`PgliteProtocolConnection.querySchema()` obtains PostgreSQL tables, formatted column types, primary keys, and foreign keys from `pg_catalog`. It includes ordinary tables visible through the current `search_path` and excludes PostgreSQL system schemas. PostgreSQL definitions are not passed through the SQLite `CREATE TABLE` parser.

## Schema model

`TableInfo` contains the table name, its columns, the ordered primary-key columns, and foreign-key references grouped by local column.

`ColInfo.type` contains only the declared type, not the rest of the column declaration. For example, both `id INTEGER PRIMARY KEY` and `id INTEGER NOT NULL DEFAULT 0` produce the type `INTEGER`. Constraints such as `PRIMARY KEY`, `REFERENCES`, `NOT NULL`, `DEFAULT`, `UNIQUE`, `CHECK`, `COLLATE`, and generated-column clauses are excluded.

Foreign-key targets distinguish two forms explicitly:

- `REFERENCES parent(id)` produces a `column` target containing the table and column names.
- `REFERENCES parent` produces a `primary-key` target. SQLite defines the omitted target as the parent table's primary key, but the parser records that meaning without querying SQLite or guessing the individual primary-key columns. For an implicit composite foreign key, every participating local column is marked as part of a reference to the parent primary key.

## Supported syntax

- The parser consumes and validates the complete statement. Text before `CREATE TABLE` or unsupported text after the table definition is rejected rather than ignored.
- `IF NOT EXISTS` is accepted, as are the trailing table options `WITHOUT ROWID` and `STRICT` and an optional semicolon.
- SQL structural keywords are matched case-insensitively while identifier names and declared types retain their original casing.
- Bare identifiers may contain Unicode letters, digits, underscores, and `$`, subject to the usual distinction between initial and subsequent characters.
- Identifiers may be quoted with double quotes, single quotes, or backticks. A doubled quote delimiter inside a quoted identifier is decoded as one literal delimiter.
- Line comments and block comments are removed only when they occur outside quoted strings or identifiers.
- Inline, table-level, and named primary-key and foreign-key constraints are supported, including multiple and composite keys. Composite foreign-key columns with explicit targets are paired in declaration order.
- Table-level `UNIQUE` and `CHECK` constraints are recognized structurally and ignored. They are not represented because the current schema model has no corresponding fields, and they must not be mistaken for columns.

## Failures and intentional limitations

Malformed statements and unsupported structures produce an `extraction` failure instead of a partial or potentially misleading schema.

Bracket-quoted identifiers such as `[name]` remain unsupported. SQLite accepts this quoting form, but `extractTableInfo()` deliberately rejects it.
