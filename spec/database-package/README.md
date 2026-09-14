# Eskuel database packages

Eskuel database packages use the `.eskueldb` filename extension and are ZIP archives containing a Data Package descriptor, bundled license texts, and exactly one database resource. Initialization-script resources support SQLite and PostgreSQL, while physical database-file resources use SQLite. The `.eskueldb` extension identifies the outer package and does not by itself imply a database system or inner artifact type. The current format is [format version 1](./v1/README.md).

Readers identify the format version through the descriptor's `$schema` property. Each version has an immutable, versioned profile; package `version` values identify releases of the packaged database and are independent of the Eskuel database-package format version.

The `.eskueldb` namespace is intentionally database-specific. [`.eskuelgame` packages](../game-package/README.md) use their own profile and may bundle one complete `.eskueldb` as a dependency.

The repository provides an [`eskueldb` authoring tool](../../doc/eskueldb-tool.md) for creating, validating, and inspecting packages. Its authoring inputs conform to the separate, versioned [database-package recipe specification](../database-package-recipe/README.md).
