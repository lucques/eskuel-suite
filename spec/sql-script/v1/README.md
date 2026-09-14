# Eskuel SQL metadata format 1

This document specifies optional Eskuel metadata embedded in standalone SQL initialization scripts. The SQL payload remains ordinary system-specific SQL; Eskuel does not define a new SQL language.

Authors targeting Eskuel Suite should also observe its [default implementation limits](../../implementation-limits.md), including the SQL script and resulting database limits. These runtime limits are compatibility targets rather than SQL metadata conformance rules.

## Encoding and header location

A script uses the `.sql` filename extension, the `text/plain` media type, and UTF-8 encoding. An optional UTF-8 byte-order mark is accepted.

Eskuel metadata may appear only in the leading header before the first SQL token. Blank space, ordinary `--` line comments, and `/* ... */` block comments may occur in this header. Metadata appearing after the first SQL token is ordinary SQL commentary and has no Eskuel meaning.

## Directive grammar

Each metadata directive occupies one SQL line comment. The canonical representation is:

```sql
-- eskuel:system=postgresql
-- eskuel:systemMinVersion=14.0.0
```

After trimming whitespace from the line-comment body, a directive has this grammar:

```text
eskuel:<key>=<value>
```

Keys and values are case-sensitive ASCII tokens without whitespace or additional equals signs. Version 1 defines exactly the keys `system` and `systemMinVersion`, and each may occur at most once. When either key occurs, both are required. Unknown keys, unknown values, duplicate keys, incomplete metadata, malformed directives, and unterminated block comments in the header are errors.

The valid `system` values are `sqlite` and `postgresql`. `systemMinVersion` is the minimum database-system version needed to execute the script, written as three non-negative decimal integers such as `3.37.0` or `14.0.0`. When both directives are absent, Eskuel uses `system=sqlite` and `systemMinVersion=3.0.0` for compatibility with existing scripts. Explicit metadata is authoritative; the implementation does not execute a failed script with another engine as a fallback.

Eskuel passes the complete SQL text, including metadata comments, to the selected database engine and does not split it at semicolons.

## Game XML interaction

SQL embedded in a game uses the game root's `db-system` and `db-system-min-version` attributes as its authoritative metadata. Embedded SQL directives are optional. If present, both directives are required: SQL `system` must match game `db-system`, and SQL `systemMinVersion` must match game `db-system-min-version`. Eskuel's game writer does not add redundant directives inside `initial-sql-script`.

When the game editor exports an initialization script as a standalone `.sql` file, it adds the canonical directive pair if the script does not already contain explicit metadata.

## Versioning

This metadata specification is versioned independently of Eskuel Suite releases and independently of the game XML format. A future incompatible directive grammar requires a new metadata specification version. Older implementations reject unknown reserved `eskuel:` directives instead of silently ignoring them.
