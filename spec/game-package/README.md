# Eskuel game packages

Eskuel game packages use the `.eskuelgame` filename extension and are ZIP archives containing a Data Package descriptor, bundled license texts, optional notices and provenance, one game XML resource, and one SQLite or PostgreSQL Eskuel database-package dependency. Game-package licensing remains distinct from licensing carried by the nested database package. The current format is [format version 1](./v1/README.md).

Readers identify the format version through the descriptor's `$schema` property. Each version has an immutable, versioned profile; package `version` values identify releases of the packaged game and are independent of the Eskuel game-package, game XML, and database-package format versions.
