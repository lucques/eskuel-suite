# Eskuel game package format 1

An Eskuel game package is a ZIP archive with the `.eskuelgame` filename extension and the `application/zip` media type. It combines one Eskuel game XML document with one Eskuel database package and metadata based on [Data Package 2.0](https://datapackage.org/standard/data-package/). Authors targeting Eskuel Suite should also observe its [default implementation limits](../../implementation-limits.md).

## Archive structure

The archive contains `datapackage.json` at its root, one game XML resource at `data/<package-name>.xml`, one database dependency at `dependencies/database.eskueldb`, and exactly one bundled text file for each object in `licenses` and `notices`. It may also contain one textual provenance file named by `provenance.path`. Directory entries needed for declared file paths may also be present. No other files are permitted.

Entry names follow the same safety rules as Eskuel database packages: they use relative POSIX paths, and absolute paths, empty path segments, `.` or `..` segments, hidden path segments, backslashes, drive-letter paths, NUL bytes, duplicate names, case-insensitive duplicate names, symbolic links, encrypted entries, split archives, and ZIP64 archives are invalid. Entries use either no compression or DEFLATE. Readers apply finite limits before decompression and do not extract package entries into the host file system.

The descriptor is UTF-8 JSON and must not exceed 64 KiB after decompression. Each resource's `bytes` and `hash` describe that complete uncompressed archive entry. The database dependency hash therefore covers the complete nested `.eskueldb` file; the nested package independently verifies its own database resource. Each license, notice, and provenance file is non-empty UTF-8 text without NUL characters. The format assigns no internal schema to these files. Eskuel Suite applies a default decompressed limit of 256 KiB to each license file and 1 MiB to each notice or provenance file.

## Descriptor

`datapackage.json` conforms to the immutable [Eskuel game-package v1 profile](./datapackage.schema.json). Its `$schema` value is:

```text
https://raw.githubusercontent.com/lucques/eskuel-suite/master/spec/game-package/v1/datapackage.schema.json
```

The descriptor uses the same strict `name`, `title`, `version`, `contributors`, `licenses`, optional `notices`, optional `provenance`, and optional `sources` fields as the Eskuel database-package profile. Properties not defined by this profile are errors. The package contains exactly two resources in either order, with the fixed resource-role names `game` and `database` and distinct paths. License names should use SPDX identifiers when one exists; the list is not a machine-readable license expression, so notices describe dual-licensing alternatives or different scopes.

### Game XML resource

The game resource has `name` equal to `game`, `path` equal to `data/<package-name>.xml`, `format` equal to `xml`, and `mediatype` equal to `application/xml`. `<package-name>` is the descriptor's exact `name` value. The resource is a supported [Eskuel game XML](../../game-xml/README.md) document encoded as UTF-8.

The game XML must explicitly declare `format-version`, `db-system`, and `db-system-min-version`, and it must omit both database-source elements. Its `db-system` must match the `system` declared by the nested database package. The XML minimum version describes the game SQL, while the nested package minimum version describes its database artifact; they need not be equal, and a consumer must satisfy both. An embedded database and the packaged dependency are not allowed together, so readers never choose one source over another.

### Database dependency resource

The database dependency has `name` equal to `database`, `path` equal to `dependencies/database.eskueldb`, `format` equal to `eskueldb`, and `mediatype` equal to `application/zip`. Its logical resource name identifies its role; the descriptor inside the nested package supplies the database's actual name, title, and version. It is a complete, valid [Eskuel database package](../../database-package/README.md) for SQLite or PostgreSQL. PostgreSQL dependencies contain an initialization script; physical database-file resources remain specific to SQLite.

The outer package's licenses describe the game content represented by the XML, including its narrative, SQL exercises, and embedded images. Licenses bundled in the nested database package continue to describe the database; consumers present the two scopes separately and do not merge the lists. Notices contain attribution, trademark, third-party-rights, warranty, non-affiliation, or similar information that is not itself a license. Provenance describes source snapshots, transformations, build inputs, exclusions, or other reproducibility information in an author-chosen textual format. Validation checks these declarations structurally but does not interpret legal terms, infer permissions, or enforce entitlements.

## Example

```json
{
    "$schema": "https://raw.githubusercontent.com/lucques/eskuel-suite/master/spec/game-package/v1/datapackage.schema.json",
    "name": "pokemon-adventure",
    "title": "Pokémon Adventure",
    "version": "1.0.0",
    "contributors": [{
        "title": "Eskuel Suite contributors",
        "roles": ["creator"]
    }],
    "licenses": [{
        "name": "MIT",
        "title": "MIT License",
        "path": "LICENSES/MIT.txt"
    }],
    "notices": [{
        "title": "Third-party names notice",
        "path": "NOTICES/THIRD-PARTY-RIGHTS.txt"
    }],
    "provenance": {
        "path": "PROVENANCE.json",
        "mediatype": "application/json"
    },
    "resources": [{
        "name": "game",
        "path": "data/pokemon-adventure.xml",
        "format": "xml",
        "mediatype": "application/xml",
        "bytes": 578,
        "hash": "sha256:677a29794f03fd3d1519f314667423d1b4910d2f371dd50ca3a825f31c18cd1d"
    }, {
        "name": "database",
        "path": "dependencies/database.eskueldb",
        "format": "eskueldb",
        "mediatype": "application/zip",
        "bytes": 1682,
        "hash": "sha256:1b10ff400f3205116ac5e0273a06707ccee48b1db34503b690004ab4121cb078"
    }]
}
```

Complete SQLite and PostgreSQL packages are provided in [`examples`](./examples/).

## Validation order

A reader validates the outer archive and entry names, reads and validates `datapackage.json`, verifies the exact archive layout and license, notice, and provenance files, applies configured limits, verifies both resources' lengths and hashes, parses the XML, validates the nested database package, checks the cross-resource database and system rules, and only then exposes the game. Failures are package-format errors except for explicitly exceeded implementation limits.

## Versioning

This format is versioned independently of Eskuel Suite releases, the package's `version`, the game XML format, the database-package format, SQLite, and PostgreSQL. A future incompatible archive or descriptor change requires a new profile URL and format-version directory. Version 1 readers reject unknown profile URLs and unknown properties rather than guessing their meaning.
