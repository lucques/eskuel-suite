# Eskuel game XML format 1

This document is the normative specification of version 1 of the Eskuel game XML format. The accompanying [XML Schema](./game.xsd) is a validation aid for the structural rules; this document defines rules and runtime semantics that XML Schema cannot express.

Authors targeting Eskuel Suite should also observe its [default implementation limits](../../implementation-limits.md). These runtime limits are compatibility targets rather than format-conformance rules.

## Media type, filename, and encoding

A game file uses the `.xml` filename extension and the `application/xml` media type. It must be well-formed XML encoded as UTF-8. An XML declaration is recommended but not required.

The root element must be `game` and must declare all three format metadata attributes:

```xml
<game format-version="1" db-system="sqlite" db-system-min-version="3.0.0">
```

`format-version` is the version of this file format, not the XML language version and not an Eskuel Suite release number. `db-system` is either `sqlite` or `postgresql` and selects the database system for every SQL fragment in the game, including initialization, solutions, checks, and placeholders. `db-system-min-version` is the minimum version needed to execute any of those fragments, written as three non-negative decimal integers such as `3.37.0` or `14.0.0`.

Eskuel Suite executes SQLite games using sql.js and PostgreSQL games using PGlite.

## Document structure

The children of `game` must occur in the following order:

1. Exactly one `head`.
2. Exactly one `scenes`.
3. At most one database source: either `initial-sql-script` or `sqlite-db`.

Elements and attributes not defined by this version are errors. This prevents an editor that does not understand newer content from silently deleting it when saving.

### Head

`head` contains exactly these elements in order:

```xml
<head>
    <title>Game title</title>
    <teaser>Short description</teaser>
    <copyright>Copyright and attribution</copyright>
</head>
```

Each element contains text only. Eskuel removes leading and trailing whitespace while preserving whitespace inside the value.

### Scenes

`scenes` contains one or more scene elements. Their document order is their play order.

#### Text scene

```xml
<text-scene>
    <text>Narrative or instructional text</text>
</text-scene>
```

`text` is required and contains text only.

#### Image scene

```xml
<image-scene media-type="image/png">iVBORw0KGgo...</image-scene>
```

The required `media-type` attribute is one of `image/png`, `image/jpeg`, `image/webp`, `image/avif`, or `image/gif`. The element contains an image of exactly that type encoded as base64 without a data-URL prefix. The decoded binary signature must agree with the declared media type. Whitespace around and inside base64 data is allowed by XML Schema.

Unversioned legacy files may omit this attribute and may use the historical data-URL form. Those compatibility rules are defined by the [legacy profile](../legacy/README.md), not by format version 1.

#### SELECT scene

```xml
<select-scene is-row-order-relevant="false" is-col-order-relevant="false" are-col-names-relevant="false">
    <text>Task shown to the player</text>
    <sql-solution>SELECT ...</sql-solution>
    <sql-placeholder>SELECT ...</sql-placeholder>
</select-scene>
```

`text` and `sql-solution` are required in that order. `sql-placeholder` is optional and defaults to the empty string. The three boolean attributes are optional and default to `false`; their only valid values are `true` and `false`.

Eskuel executes the player's statement and `sql-solution` against equivalent database states and compares their result tables. `is-row-order-relevant` controls whether row order must match, `is-col-order-relevant` controls whether column order must match, and `are-col-names-relevant` controls whether column names must match.

#### Manipulation scene

```xml
<manipulate-scene>
    <text>Task shown to the player</text>
    <sql-solution>UPDATE ...</sql-solution>
    <sql-check>SELECT ...</sql-check>
    <sql-placeholder>UPDATE ...</sql-placeholder>
</manipulate-scene>
```

`text`, `sql-solution`, and `sql-check` are required in that order. `sql-placeholder` is optional and defaults to the empty string. Eskuel applies the player's manipulation to the player database and the solution to an equivalent reference database, then executes `sql-check` against both to determine whether the resulting states agree.

All scene text and SQL values have leading and trailing whitespace removed while preserving internal whitespace.

### Database source

A game may omit its database source, embed one SQL initialization script, or embed one SQLite database. It must not contain both source forms. PostgreSQL games support SQL initialization scripts but do not embed physical PGlite data directories.

An initialization script is represented as text:

```xml
<initial-sql-script>
    CREATE TABLE example (id INTEGER PRIMARY KEY);
</initial-sql-script>
```

The complete script is passed to the selected database engine. It is not split at semicolons. Embedded [Eskuel SQL metadata](../../sql-script/v1/README.md) is optional because the game attributes are authoritative; if present, SQL `system` must match game `db-system`, and SQL `systemMinVersion` must match game `db-system-min-version`.

An SQLite database is represented as raw base64:

```xml
<sqlite-db>U1FMaXRlIGZvcm1hdCAzAA...</sqlite-db>
```

`sqlite-db` is valid only when the game declares `db-system="sqlite"`. The decoded bytes must be a database accepted by the supported SQLite implementation.

## Versioning and compatibility

The game format uses monotonically increasing integer versions independent of Eskuel Suite releases. A suite release publishes the format versions it reads and the version it writes.

A format version must change when an older conforming reader or editor cannot safely process and save a document without changing or losing its meaning. Editorial corrections that do not alter document structure or semantics do not change the embedded version.

Readers must reject unsupported version numbers rather than attempting best-effort decoding. Writers emit the latest format version they support. A reader may implement an explicit migration from an older supported version into its current in-memory model.

Files without `format-version` are legacy Eskuel files, not another numbered format. For backward compatibility, Eskuel interprets them according to the [legacy compatibility profile](../legacy/README.md) with implicit `db-system=sqlite` and `db-system-min-version=3.0.0`. Saving such a game upgrades it to the current explicit format. A file that declares either database-system attribute without `format-version` is invalid.

## Canonical example

See [minimal.xml](./minimal.xml) for a complete minimal version 1 game.
