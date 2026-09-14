# Eskuel database-package authoring recipe 1

Recipe JSON files conform to the [version 1 JSON Schema](./recipe.schema.json). Their `$schema` value is:

```text
https://raw.githubusercontent.com/lucques/eskuel-suite/master/spec/database-package-recipe/v1/recipe.schema.json
```

The recipe schema reuses the metadata and path definitions from the [Eskuel database-package v1 profile](../../database-package/v1/datapackage.schema.json). The recipe adds local `inputPath` values to licenses, notices, and provenance, plus an authoring resource description. Each `inputPath` is resolved relative to the recipe file and is omitted from the generated descriptor; its corresponding `path` names the destination inside the package. Contributor roles are copied into `datapackage.json`: `creator` identifies someone who created or maintains the package, while the profile-specific `dataCreator` identifies someone who created its database content. Represent these responsibilities as separate contributor objects; if the same contributor performs both, include that contributor twice, once with `roles` set to `["creator"]` and once with `roles` set to `["dataCreator"]`. License and notice inputs are plain text, while the provenance media type is author-supplied because its textual format is author-chosen. Generated database-resource format, media type, byte count, digest, and package profile fields remain owned by `eskueldb`.

See [example.recipe.json](./examples/example.recipe.json) for a complete recipe.
