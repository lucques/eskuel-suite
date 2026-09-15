# Games

For playing and reviewing games without a browser, see the [`eskuel-play` and `eskuel-review` tools](./game-cli-tools.md).

## File format

The [game XML format overview](../spec/game-xml/README.md) links the current [Eskuel game XML format 2](../spec/game-xml/v2/README.md), the earlier [format version 1](../spec/game-xml/v1/README.md), and the separate [legacy compatibility profile](../spec/game-xml/legacy/README.md). Versioned files declare `format-version`, `db-system`, and `db-system-min-version` on the `game` root. Existing unversioned files remain supported as legacy SQLite games, while newly saved games use explicit version 2 metadata.

## XML loading

Web-browser session factories bind the `DOMParser` adapter and Web Worker database engine; Node session factories bind the `fast-xml-parser` adapter and in-process database engine. Both XML adapters normalize documents to the shared `XmlElement` model before the platform-independent game decoder runs.

```text
Web browser: DOMParser ------\
                              -> XmlElement -> Game
Node: fast-xml-parser -------/
```

The standalone game console accepts a `file` query parameter, for example `game-console/?file=https%3A%2F%2Fexample.com%2Fgame.xml`. URL loading and local uploads detect game XML or a game package from the contents, regardless of filename extension or MIME type. For example, UTF-8 game XML named `gistfile1.txt` is accepted, and invalid data named `game.xml` produces an in-app error. The browser fetches this source through the same loader as configured game URLs, so ordinary fetch failures, CORS restrictions, mixed-content rules, size limits, and parsing errors use the existing game-loading error path.

## Game packages

Versioned [Eskuel game packages](../spec/game-package/README.md) use the `.eskuelgame` extension. Each package contains a `game` resource at `data/<package-name>.xml` without an embedded database and one `database` resource at `dependencies/database.eskueldb`. The dependency can declare SQLite or PostgreSQL, and the XML `db-system` must match its database-package `system`. The game and database minimum versions have separate scopes, and the selected engine must satisfy both. The shared loader validates both package layers, combines the XML game with the database dependency in memory, preserves the outer and nested package metadata and bundled texts, and applies the same XML, image, and database limits as standalone sources. Authors can create, validate, and inspect packages with the [`eskuelgame` command](./eskuelgame-tool.md).

The console exposes package information and displays game and database licensing separately. The editor opens a game package as an explicit import and warns that saving or exporting standalone XML does not preserve package metadata or bundled licensing files. An opened `pokemon-adventure.eskuelgame` is edited under the filename `pokemon-adventure.xml`; the imported package is saved as standalone XML under an XML filename. For packages with other names, the editor appends `.xml` unless the name already ends in `.xml`. Standalone XML uploads keep their original filenames.

## Game console checkpoints

The web game console stores versioned progress checkpoints in browser `localStorage`. A checkpoint contains the complete `GameProgress`, the game title, a locator, and a SHA-256 fingerprint of the canonical XML produced by `gameToXML`. URL-backed games use a normalized absolute URL locator. Inline XML and directly provided `Game` values use `{ "kind": "object" }`.

When a loaded game's fingerprint matches a checkpoint, the console offers to resume or start over. Opening the console without a preloaded or URL-query game leaves it empty and does not offer a previously played game. Resumption rebuilds the databases from the game source and replays the canonical scene effects represented by the saved progress. The console writes a checkpoint after each successful progress change, removes it on restart, retains at most one revision for the same URL, and treats the latest write as authoritative when multiple tabs play the same game.

## Image resource limits

Image limits are runtime policy rather than game-format constraints. The [default implementation limits](../spec/implementation-limits.md) distinguish editor input from the image ultimately embedded in a game. Input is limited to 24 MiB and 32,000,000 pixels before resizing. An embedded image is limited to 2 MiB, 2,400 pixels in width, and 1,200 pixels in height; there is no additional embedded pixel-count limit. These values are configured programmatically and are not exposed as ordinary user preferences.

The editor checks a selected file's byte size before reading it, then reads PNG, JPEG, WebP, AVIF, or GIF dimensions from the file header and applies the input pixel limit before browser pixel decoding. It preserves valid images unchanged. For a static image exceeding an embedded limit, it attempts to resize without upscaling, preserve the aspect ratio, and re-encode until the result satisfies the embedded dimensions and byte limit; it rejects the selection if processing cannot produce a valid result. An animated image is preserved if it already satisfies the embedded limits and is rejected if a transformation would be necessary.

The shared game reader enforces the embedded byte, width, and height limits for image scenes in both legacy and versioned XML.

The shared image view caps the rendered height at 300 CSS pixels and the rendered width at its container width. This presentation rule does not alter the embedded image or participate in resource validation.

The scenes toolbar shows the current serialized game-file size relative to the configured complete-game limit. The estimate refreshes after committed changes, including adding or replacing an image and reloading the database. Saving and exporting independently serialize and measure the game again, and refuse to write a file larger than the configured limit so that a successfully written file remains acceptable to the loader under the same settings.
