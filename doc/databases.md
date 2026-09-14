# Databases

## Input formats

Versioned [Eskuel database packages](../spec/database-package/README.md) use the `.eskueldb` extension and contain one validated SQLite or PostgreSQL initialization script, or one SQLite database file, plus Data Package metadata. Standalone SQL initialization scripts may declare `system` and `systemMinVersion` using the [Eskuel SQL metadata format](../spec/sql-script/v1/README.md). Scripts without metadata retain the historical `system=sqlite` and `systemMinVersion=3.0.0` defaults. Standalone SQLite database files use SQLite's own binary format and do not carry an Eskuel format version. PGlite data-directory archives are not accepted as database sources. Authors can use the [default implementation limits](../spec/implementation-limits.md) as the compatibility target for SQL scripts, database files, and packages.

The shared database loader materializes all three source kinds. For `.eskueldb`, it validates the ZIP directory without extracting to the host file system, validates the strict profile descriptor, verifies the inner resource byte length and SHA-256 digest, and converts the resource to the same `DbData` model used by standalone inputs. Both the SQL Browser and game editor use this loader. The SQLite and PGlite cores enforce a package's `systemMinVersion` against the actual database-engine version before executing a script or exposing a database file.

## SQLite architecture

`SqliteCore` contains the shared database operations and has no browser- or Node-specific APIs. In the browser, `SqliteWorkerEngine` sends requests to a Web Worker that initializes sql.js and calls the core. In Node, `InProcessSqliteEngine` initializes sql.js and calls the same core directly, without `worker_threads`.

```text
Browser main thread -> Web Worker -> SqliteCore -> sql.js / SQLite WASM
Node process -> InProcessSqliteEngine -> SqliteCore -> sql.js / SQLite WASM
```

## PostgreSQL architecture

`PgliteCore` owns independent in-memory PGlite instances and executes complete SQL input through PGlite's streaming PostgreSQL protocol. In the browser, `PgliteWorkerEngine` keeps PostgreSQL and its WASM runtime off the main thread. In Node, `InProcessPgliteEngine` uses the same core directly.

```text
Browser main thread -> Web Worker -> PgliteCore -> PGlite / PostgreSQL WASM
Node process -> InProcessPgliteEngine -> PgliteCore -> PGlite / PostgreSQL WASM
```

The system-routing engine creates the SQLite or PostgreSQL adapter lazily. PostgreSQL schema information is read from `pg_catalog`; the SQLite `CREATE TABLE` parser is not used for PostgreSQL tables.
