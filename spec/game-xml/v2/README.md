# Eskuel game XML format 2

This document is the normative specification of version 2 of the Eskuel game XML format. The accompanying [XML Schema](./game.xsd) is a validation aid for the structural rules; this document defines rules and runtime semantics that XML Schema cannot express.

Version 2 retains every version 1 rule and adds ordered ordinary hints and optional solution hints to SELECT and manipulation scenes. A version 2 document declares its format and database-system requirements:

```xml
<game format-version="2" db-system="sqlite" db-system-min-version="3.0.0">
```

`db-system` is either `sqlite` or `postgresql` and selects the database system for every SQL fragment in the game. `db-system-min-version` is the minimum version needed to execute any of those fragments. Elements and attributes not defined by this version are errors.

## Document structure

The root contains `<head>`, `<scenes>`, and optionally exactly one `<initial-sql-script>` or `<sqlite-db>` in that order. The head, database sources, text scenes, image scenes, and their validation rules are unchanged from [format version 1](../v1/README.md).

## Task scenes

A SELECT scene contains `<text>`, `<sql-solution>`, optional `<sql-placeholder>`, and optional final `<hints>` in that order. Its three result-equivalence Boolean attributes retain their version 1 meanings. The `<hints>` XML name is retained as the concise container name for ordinary hints.

```xml
<select-scene is-row-order-relevant="false" is-col-order-relevant="false" are-col-names-relevant="false" has-sol-hint="true">
    <text>Return the example value.</text>
    <sql-solution>SELECT value FROM example</sql-solution>
    <sql-placeholder>SELECT</sql-placeholder>
    <hints>
        <text-hint>Read from the example table.</text-hint>
        <expected-result-hint />
    </hints>
</select-scene>
```

A manipulation scene contains `<text>`, `<sql-solution>`, `<sql-check>`, optional `<sql-placeholder>`, and optional final `<hints>` in that order.

```xml
<manipulate-scene has-sol-hint="false">
    <text>Add the example value.</text>
    <sql-solution>INSERT INTO example VALUES (1)</sql-solution>
    <sql-check>SELECT value FROM example</sql-check>
</manipulate-scene>
```

`has-sol-hint` is optional on both task-scene types. Its accepted values are `true` and `false`; absence means `false`.

## Ordinary hints

`<hints>` is optional and, when present, must be the final task-scene child. Absence and an empty element both mean that the scene has no ordinary hints. The element has no attributes and contains ordered `<text-hint>` and `<expected-result-hint>` children.

The `<text-hint>` element represents an ordinary text hint. It contains character data and no attributes or element children. Readers trim its character data; an empty value is valid. Any number of ordinary text hints is allowed.

The `<expected-result-hint>` element represents an ordinary expected-result hint. It has no attributes, element children, or non-whitespace character data. At most one may occur in a scene's ordinary-hint list. It requests the same reference-result presentation as the historical ordinary-hint action: the reference solution result for a SELECT scene and the reference check result for a manipulation scene.

Ordinary hints are presented in document order. A solution hint is separate from this list and becomes available only after the ordinary hints have been exhausted.

## Compatibility

Readers continue to accept legacy and version 1 games. They normalize every legacy or version 1 task scene to one expected-result ordinary hint and no solution hint. Writers emit version 2 and preserve the normalized semantics explicitly.

Readers reject unsupported explicit format versions rather than attempting best-effort decoding.

## Canonical example

See [minimal.xml](./minimal.xml) for a complete minimal version 2 game.
