# Eskuel database package format 1

An Eskuel database package is a ZIP archive with the `.eskueldb` filename extension and the `application/zip` media type. It packages exactly one SQLite or PostgreSQL database artifact together with metadata based on [Data Package 2.0](https://datapackage.org/standard/data-package/). Authors targeting Eskuel Suite should also observe its [default implementation limits](../../implementation-limits.md).

## Archive structure

The archive contains `datapackage.json` at its root, exactly one regular database resource file named by `resources[0].path`, and exactly one bundled text file for each object in `licenses` and `notices`. It may also contain one textual provenance file named by `provenance.path`. These files are auxiliary package files rather than Data Package resources, so `resources` still contains exactly one element. Directory entries needed for declared file paths may also be present. No other files are permitted.

Entry names use relative POSIX paths. Absolute paths, empty path segments, `.` or `..` segments, hidden path segments, backslashes, drive-letter paths, NUL bytes, duplicate names, case-insensitive duplicate names, symbolic links, encrypted entries, and split or ZIP64 archives are invalid. Entries use either no compression or the DEFLATE compression method. Readers must apply finite limits before decompression and must not extract archive entries into the host file system merely to read a package.

The descriptor is UTF-8 JSON and must not exceed 64 KiB after decompression. Resource `bytes` and `hash` describe the uncompressed resource file rather than the `.eskueldb` archive. The SHA-256 digest is calculated over the resource bytes exactly as stored in the archive. Each license, notice, and provenance file is non-empty UTF-8 text without NUL characters. A provenance object declares its textual media type; license and notice files are plain text. The format assigns no internal schema to these files. Eskuel Suite applies a default decompressed limit of 256 KiB to each license file and 1 MiB to each notice or provenance file.

## Descriptor

`datapackage.json` conforms to the immutable [Eskuel database-package v1 profile](./datapackage.schema.json). Its `$schema` value is:

```text
https://raw.githubusercontent.com/lucques/eskuel-suite/master/spec/database-package/v1/datapackage.schema.json
```

The descriptor contains:

- `$schema`: the profile URL above.
- `name`: a stable lowercase package identifier.
- `title`: a human-readable database title.
- `version`: the packaged database version in Semantic Versioning form. This is not the Eskuel format version.
- `contributors`: standard Data Package contributor objects. At least one contributor has the `creator` role. A creator identifies a creator or maintainer of the package, not necessarily the original creator of its data. The profile-specific `dataCreator` role identifies someone who created the database content. Represent these responsibilities as separate contributor objects: if the same contributor created or maintains the package and created its data, include that contributor twice, once with `roles` set to `["creator"]` and once with `roles` set to `["dataCreator"]`.
- `licenses`: one or more standard Data Package license objects, each with a `path` naming its bundled license text.
- `notices`: an optional non-empty array of portable notices, each with a required `path` and optional `title`.
- `provenance`: an optional object whose `path` names the package's single provenance file and whose `mediatype` declares its textual media type.
- `sources`: optional standard Data Package source objects describing the origin of the data.
- `resources`: exactly one resource as specified below.

Properties not defined by this profile are errors. `licenses`, `contributors`, and `sources` retain their Data Package 2.0 meanings and property shapes. Contributor and source `path` values are restricted to fully qualified HTTP, HTTPS, FTP, or FTPS URLs. Every license `path` is required and is a relative POSIX path of the form `LICENSES/<portable-name>.txt`, such as `LICENSES/MIT.txt`. A license `name` and `title` remain optional as defined by Data Package 2.0, although including both is recommended.

Every notice `path` is required and has the form `NOTICES/<portable-name>.txt`, such as `NOTICES/THIRD-PARTY-RIGHTS.txt`; its title is optional. The provenance path names one portable root file beginning with `PROVENANCE`, such as `PROVENANCE.json`, `PROVENANCE.md`, or simply `PROVENANCE`. Its `mediatype` is a lowercase `text/*` media type or a textual application media type for JSON, XML, or YAML, including structured syntax suffixes such as `application/ld+json`. The provenance path extension, when present, is not used to infer or validate the media type. All declared paths are distinct under case-insensitive comparison and name regular files in the archive. Notices contain rights, trademark, attribution, warranty, non-affiliation, or similar information that is not itself a license. Provenance describes source snapshots, transformations, build inputs, exclusions, or other reproducibility information in an author-chosen textual format.

## Database resource

The single resource contains `name`, `path`, `format`, `mediatype`, `bytes`, `hash`, and `eskuel:database`. Properties not defined by this profile are errors. `path` names the one resource file inside the archive, `bytes` is its uncompressed byte length, and `hash` has the form `sha256:` followed by 64 lowercase hexadecimal digits.

`eskuel:database` contains exactly these properties:

- `artifactType`: either `initial-sql-script` or `database-file`.
- `system`: either `sqlite` or `postgresql`.
- `systemMinVersion`: the minimum database-system version needed to consume the artifact, written as three non-negative decimal integers such as `3.37.0` or `14.0.0`.

A consumer whose selected database-engine version is lower than `systemMinVersion` rejects the package before executing or exposing the database.

## Relationship to catalogs and manifests

An external catalog or publication manifest can describe an `.eskueldb` download as a package, but that outer artifact classification is distinct from `resources[0].eskuel:database.artifactType`. The outer classification says that the distributed file is an `.eskueldb`; the inner value says whether its database resource is an `initial-sql-script` or a `database-file`.

A catalog must not infer SQLite solely from the `.eskueldb` extension or an outer package classification. An `.eskueldb` can contain an SQLite initialization script, a PostgreSQL initialization script, or an SQLite database file. If a catalog duplicates `system`, `systemMinVersion`, package version, or comparable resource metadata for discovery purposes, those values must agree with the package descriptor. The descriptor remains the portable authority when the package is separated from that catalog.

Catalog-only presentation metadata, such as localized teasers, publication dates, page-specific messages, page URLs, and variant groupings, does not belong in `datapackage.json`. Conversely, resource byte counts, hashes, archive paths, bundled licenses, portable notices, provenance, and the inner artifact type belong to the package rather than the surrounding catalog.

### Initial SQL script

An `initial-sql-script` resource uses a path ending in `.sql`, `format` equal to `sql`, and `mediatype` equal to the registered `application/sql` media type. Its resource bytes are valid UTF-8 without a byte-order mark and otherwise follow the [Eskuel SQL metadata format 1](../../sql-script/v1/README.md) directive grammar. The package's `system` and `systemMinVersion` values are authoritative. The SQL directive pair is optional, but when present both values must match the package metadata. The official authoring command adds the pair so that an extracted SQL resource remains self-describing. The complete script is passed to the selected database engine as one initialization input.

The `application/sql` media type is deliberately more specific than the `text/plain` media type prescribed for a standalone SQL metadata format 1 file. This packaging metadata does not change the directive grammar or the standalone-file requirements.

### SQLite database file

A `database-file` resource requires `system` equal to `sqlite`, uses a path ending in `.sqlite`, `format` equal to `sqlite`, and `mediatype` equal to the registered `application/vnd.sqlite3` media type. Its bytes are a SQLite 3 database file accepted by a conforming consumer. PostgreSQL packages use initialization scripts; physical PGlite data-directory archives are not accepted.

## Example

```json
{
    "$schema": "https://raw.githubusercontent.com/lucques/eskuel-suite/master/spec/database-package/v1/datapackage.schema.json",
    "name": "example-school",
    "title": "Example school database",
    "version": "1.0.0",
    "contributors": [
        {
            "title": "Eskuel Suite contributors",
            "roles": ["creator"]
        },
        {
            "title": "Eskuel Suite contributors",
            "roles": ["dataCreator"]
        }
    ],
    "licenses": [{
        "name": "MIT",
        "title": "MIT License",
        "path": "LICENSES/MIT.txt"
    }],
    "notices": [{
        "title": "Third-party rights notice",
        "path": "NOTICES/THIRD-PARTY-RIGHTS.txt"
    }],
    "provenance": {
        "path": "PROVENANCE.json",
        "mediatype": "application/json"
    },
    "resources": [{
        "name": "example-school",
        "path": "data/example-school.sqlite",
        "format": "sqlite",
        "mediatype": "application/vnd.sqlite3",
        "bytes": 8192,
        "hash": "sha256:ab4f4237876bd3051acc9394c8a2a35f4481a7c301c5903d63c5bc073c5f8548",
        "eskuel:database": {
            "artifactType": "database-file",
            "system": "sqlite",
            "systemMinVersion": "3.37.0"
        }
    }]
}
```

Complete packages for SQLite scripts, PostgreSQL scripts, and SQLite database files are provided in [`examples`](./examples/).

## Validation order

A reader validates the outer archive and entry names, reads and validates `datapackage.json`, verifies that every declared license, notice, provenance, and database resource file exists and that no undeclared files exist, applies configured size limits, validates each license, notice, and provenance file as non-empty UTF-8 text without NUL characters, decompresses the resource, verifies its `bytes` and `hash`, validates artifact-specific requirements, and only then passes the artifact to the selected database engine. A failure at any stage is a package-format error except for an explicitly exceeded implementation limit or unsupported database-system version, which are reported separately.

## Versioning

This format specification is versioned independently of Eskuel Suite releases, the packaged database's `version`, the SQL metadata format, SQLite, and PostgreSQL. A future incompatible archive or descriptor change requires a new profile URL and a new format-version directory. Version 1 readers reject unknown profile URLs and unknown properties rather than guessing their meaning.
