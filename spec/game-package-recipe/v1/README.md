# Eskuel game-package recipe format 1

A recipe supplies the game-package metadata and maps license, notice, and provenance inputs from the recipe directory to their portable paths in the output archive. The game XML and `.eskueldb` dependency are separate command-line inputs because they are normally produced or selected independently. The command computes the two resources, paths, byte counts, and SHA-256 hashes.

The recipe conforms to [`recipe.schema.json`](./recipe.schema.json). Every `inputPath` is a safe relative POSIX path resolved from the recipe directory and is removed from the generated descriptor. The remaining metadata has the same meaning as in the [game-package v1 profile](../../game-package/v1/README.md).

See [`examples/example.recipe.json`](./examples/example.recipe.json) for a complete example.
