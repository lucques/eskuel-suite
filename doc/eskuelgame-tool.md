# `eskuelgame` authoring tool

The installable `eskuelgame` command creates, validates, and inspects [Eskuel game packages](../spec/game-package/README.md). Installing Eskuel Suite globally places `eskuelgame` on `PATH`. Within a source checkout, `npm run eskuelgame -- <arguments>` generates and invokes the bundled command.

## Pack

`pack` combines one [game-package recipe](../spec/game-package-recipe/README.md), one versioned game XML document without an embedded database source, one complete `.eskueldb`, and the recipe's license, notice, and provenance inputs:

```text
eskuelgame pack game.package.json game.xml database.eskueldb game.eskuelgame
```

The optional `--overwrite` flag permits replacement of an existing output file. Without it, package creation fails rather than replacing the file. The output is deterministic for identical inputs, stores the already-compressed database dependency without recompressing it, calculates both resource sizes and SHA-256 hashes, validates both package layers and the XML/database relationship, and writes the completed archive atomically.

A recipe has this shape:

```json
{
    "$schema": "https://raw.githubusercontent.com/lucques/eskuel-suite/master/spec/game-package-recipe/v1/recipe.schema.json",
    "name": "example-game",
    "title": "Example game",
    "version": "1.0.0",
    "contributors": [{
        "title": "Example author",
        "roles": ["creator"]
    }],
    "licenses": [{
        "name": "CC0-1.0",
        "title": "CC0 1.0 Universal",
        "path": "LICENSES/CC0-1.0.txt",
        "inputPath": "CC0-1.0.txt"
    }],
    "notices": [{
        "title": "Third-party rights notice",
        "path": "NOTICES/THIRD-PARTY-RIGHTS.txt",
        "inputPath": "THIRD-PARTY-RIGHTS.txt"
    }],
    "provenance": {
        "path": "PROVENANCE.json",
        "mediatype": "application/json",
        "inputPath": "PROVENANCE.json"
    },
    "sources": [{
        "title": "Project source",
        "path": "https://example.com/game"
    }]
}
```

Every `inputPath` is a safe relative POSIX path resolved from the recipe's directory. Its `path` is the corresponding destination inside the package, and `inputPath` is omitted from the generated descriptor. The command creates the fixed resources `game` at `data/<package-name>.xml` and `database` at `dependencies/database.eskueldb`.

## Validate

`validate` checks ZIP safety and limits, the descriptor profile, exact layout, bundled licensing metadata, resource lengths and hashes, the nested database package, game XML, absence of an embedded XML database source, and the database-system match:

```text
eskuelgame validate game.eskuelgame
eskuelgame validate game.eskuelgame --deep
```

`--deep` additionally runs SQLite integrity and foreign-key checks when the nested package contains a physical SQLite database file.

## Inspect

`inspect` validates the package before printing the game identity, resources, game licensing declarations, database identity and system, and separate database licensing declarations:

```text
eskuelgame inspect game.eskuelgame
eskuelgame inspect game.eskuelgame --json
```

The JSON form prints the validated outer game descriptor and nested database descriptor as separate objects.
