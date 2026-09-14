# eskuel-suite

This library allows building web-based educational material for SQL. It uses [sql.js](https://sql.js.org) for SQLite and [PGlite](https://pglite.dev/) for PostgreSQL in the web browser. There are three main components that can be plugged as widgets into any webpage.

A fully working platform ("online demo" for the library) can be found [here](https://eskuel.de).


# Components
- **SQL Browser**: Given an initial SQL script for setting up tables, the SQL Browser allows viewing the tables' schemas and executing SQL against the database.
- **SQL Game Console**: Based on the [SQL Island](https://sql-island.informatik.uni-kl.de/) game by Johannes Schildgen, the SQL Game Console allows to play a game where the player has to solve SQL queries to progress.
- **SQL Game Editor**: A tool to create new games for the SQL Game Console.


# Documentation
Project-specific behavior, including the responsive presentation and Dockview layout presets, is documented in [doc/main.md](./doc/main.md). The database architecture is documented in [doc/databases.md](./doc/databases.md), `.eskueldb` package authoring in [doc/eskueldb-tool.md](./doc/eskueldb-tool.md), `.eskuelgame` package authoring in [doc/eskuelgame-tool.md](./doc/eskuelgame-tool.md), CLI playtesting and review in [doc/game-cli-tools.md](./doc/game-cli-tools.md), schema extraction in [doc/schema.md](./doc/schema.md), game loading in [doc/games.md](./doc/games.md), and test layers and commands in [doc/testing.md](./doc/testing.md).

The public file formats are documented in the [Eskuel game XML format overview](./spec/game-xml/README.md), [Eskuel SQL metadata format 1](./spec/sql-script/v1/README.md), and [Eskuel database package format overview](./spec/database-package/README.md). Files intended for Eskuel Suite should also observe its [default implementation limits](./spec/implementation-limits.md).

Eskuel Suite 2.0 continues to read legacy game XML, existing SQL initialization scripts, and SQLite database files. SQL scripts without Eskuel metadata retain the historical SQLite defaults. Newly saved games use game XML format 2; existing files do not need to be converted before opening them. The usual format validation and resource limits still apply.


# Setup

Node.js 24 or newer is required for npm and CLI usage. To develop Eskuel Suite itself or run the standalone apps from source, clone the repository and install its dependencies:

```sh
git clone https://github.com/lucques/eskuel-suite.git
cd eskuel-suite
npm ci
```

The database engines, editor, and styles are installed through npm and bundled by Vite.

# Usage
There are two ways to use this library.

## Scenario 1: Standalone
Run `npm run dev` to serve the standalone applications locally.

The Game Console and Game Editor open the included German example [Ein gewöhnlicher Morgen?](./public/res/games/gewoehnlicher-morgen/gewoehnlicher-morgen.xml) by default. It is also available from their German game catalog. The XML includes its database initialization script and images, so it works from a fresh checkout without additional game downloads.

The SQL Browser opens the included German SQLite examples [Fahrschule](./public/res/dbs/fahrschule.sql) and [Onlineshop](./public/res/dbs/onlineshop.sql) by default. These are also the two entries in its German database catalog. Both SQL scripts are copied from the German main versions `1.0.0` in the Eskuel website content.

## Scenario 2: Embedded

The npm package includes all three embeddable widgets, their TypeScript declarations, ready-to-host browser files, and the four CLI tools.

### Importing into a Vite project

Install the package in your website project:

```sh
npm install eskuel-suite
```

Import the widgets in your browser entry point. The npm entry also imports the required styles:

```ts
import { BrowserApp, GameConsoleApp, GameEditorApp } from 'eskuel-suite';

new BrowserApp('browser').init();
new GameConsoleApp('game-console').init();
new GameEditorApp('game-editor').init();
```

Provide a container with each corresponding ID in your HTML. Configure Vite to process the package's workers and database assets directly:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
    optimizeDeps: {
        exclude: ['eskuel-suite', '@electric-sql/pglite'],
    },
    worker: {
        format: 'es',
    },
});
```

The package's root export is an ES module for browser bundlers; import it on the client in applications that also render on the server. Other bundlers need support for CSS modules and Vite-style `?worker` and `?url` asset imports.

### Hosting the ready-made browser files

For plain HTML or a website with a different build setup, copy the complete `node_modules/eskuel-suite/dist/embed` directory into your site's public files, for example as `/embed/`. You can also generate that directory from a source checkout with `npm run build:embed`. It contains the public entry points `eskuel-suite.js`, `eskuel-suite.css`, and the public TypeScript declarations. Deploy the entire directory, including its `assets` and `chunks` subdirectories; they contain the database engines, WebAssembly files, fonts, and workers.

Include the stylesheet and import a widget from an inline module script:

```html
<link rel="stylesheet" href="/embed/eskuel-suite.css">

<div id="browser"></div>

<script type="module">
    import { BrowserApp } from '/embed/eskuel-suite.js';

    const browser = new BrowserApp('browser', {
        linksRight: [{
            en: { title: 'Home', url: '/en/' },
            de: { title: 'Startseite', url: '/de/' },
        }],
    });
    browser.init();
</script>
```

The library places the browser application in the element passed to its constructor. The same module exports `GameConsoleApp` and `GameEditorApp`. The package also exposes `eskuel-suite/style.css` and `eskuel-suite/embed/*` for tools that resolve public package paths.

### Navigation options

Every application displays an About button with its copyright, license, warranty, full GPL text, and source-code link. The full GPL text and source-code links point to the public GitHub repository. Every component constructor also accepts the optional `linksCenterLeft` and `linksRight` navigation settings. Each is an ordered list of links, and each link supplies a title and URL for every supported application language. The app selects the matching title and URL at runtime; omitting a list hides that group of links. A normal click asks for confirmation before leaving the app, while modified clicks such as Ctrl-click retain the browser's native behavior. For example:

```ts
const gameConsole = new GameConsoleApp('game-console', {
    gameCatalog,
    initialGameUrl: '/games/example-game.xml',
    linksCenterLeft: [{
        en: { title: 'Browse Games', url: '/en/games/' },
        de: { title: 'Spiele durchstöbern', url: '/de/spiele/' },
    }],
    linksRight: [{
        en: { title: 'Course overview', url: '/en/' },
        de: { title: 'Kursübersicht', url: '/de/' },
    }],
});
```

The public `supportedLanguages` tuple is the source of truth for the finite language set, currently English (`en`) and German (`de`). The exported `Language`, `AppLink`, and `LocalizedLink` types can be used when constructing navigation settings dynamically. Every localized link requires a value for every supported language.

`BrowserApp`, `GameConsoleApp`, and `GameEditorApp` accept their options as the second constructor argument. The game editor also accepts `persistGameDrafts: true` to store normalized local drafts in IndexedDB and restore them the next time the editor is opened on the same origin. Draft revisions, cross-tab document ownership, and saved-file fingerprints are described in [Game editor drafts and file state](doc/game-editor.md#drafts-and-file-state). Game-console progress persistence is enabled by default and can be disabled with `persistGameProgress: false`.

The embedding page can pass resource URLs directly with `initialGameUrl`, `initialGameUrls`, and `initialDatabaseUrls`. The app performs the fetch so that loading status, size limits, cancellation, and failures follow the same path as catalog resources. Query-string conventions remain the embedding page's responsibility. For example, a page using `?xml=...` can initialize the game console as follows:

```ts
const xmlUrl = new URLSearchParams(window.location.search).get('xml');
const gameConsole = new GameConsoleApp('game-console', {
    initialGameUrl: xmlUrl === null
        ? undefined
        : new URL(xmlUrl, document.baseURI).href,
});
gameConsole.init();
```

The standalone apps select their initial game and databases once at startup, using the saved interface-language preference or the detected interface language, with English as fallback. The game console's `?xml=...` parameter overrides its default game. Changing the interface language later updates the catalog choices while keeping the currently loaded content.

Game URLs ending in `.eskuelgame` are loaded as versioned [Eskuel game packages](./spec/game-package/README.md), while URLs ending in `.xml` are loaded as standalone game XML. Database URLs ending in `.eskueldb` are loaded as versioned [Eskuel database packages](./spec/database-package/README.md). URLs ending in `.sql` are loaded as initialization scripts. URLs ending in `.db`, `.db3`, `.sqlite`, `.sqlite3`, `.s3db`, or `.sl3` are loaded as SQLite database files. Cross-origin resource URLs require the resource server to permit the embedding page's origin through CORS.

### Interface language

All three apps accept `initialLanguage` and `onLanguageChange` in their constructor options:

```ts
const browser = new BrowserApp('root', {
    initialLanguage: 'de',
    onLanguageChange: language => {
        rememberWebsiteLanguage(language); // Supplied by the embedding website.
    },
});
await browser.init();
```

`initialLanguage` accepts the exported `Language` type (`'en' | 'de'`). When supplied, it overrides and updates the saved interface-language preference once at startup. When omitted, the saved preference wins over browser detection, with English as fallback. Unsupported explicit values reject initialization. `init()` returns a promise that resolves after language initialization and scheduling the first render; it does not wait for initial resource loading. Existing calls may still omit `await`. The first render uses the selected language, and users can change it afterwards with the app's language switcher.

`onLanguageChange` receives each subsequent effective language change, including changes synchronized from other app tabs. It does not fire for initialization, selecting the current language, or changes to unrelated settings. The callback is a notification; changing its return value does not control the app's language. Apps on the same origin retain their existing shared preference behavior. The embedding website owns URL parsing and its own preference persistence; it should use this API instead of editing the app's internal storage. Interface-language changes update localized navigation and catalog choices without replacing loaded games or databases. The host should select initial resource URLs in the same language where appropriate.

### Catalogs

Embedded applications can receive structured game and database catalogs. Eskuel Suite selects the localization matching the application's current language and offers each of its files in the Open dialog.

```ts
import { GameConsoleApp } from 'eskuel-suite';
import type { GameCatalogEntry } from 'eskuel-suite';

const gameCatalog: readonly GameCatalogEntry[] = [{
    id: 'example-game',
    localizations: {
        en: {
            title: 'Example Game',
            pageUrl: '/en/games/example-game/',
            files: [{
                url: '/games/example-game.xml',
                filename: 'example-game.xml',
            }],
        },
    },
}];

const gameConsole = new GameConsoleApp('game-console', {
    gameCatalog,
    linksRight: [{
        en: { title: 'Home', url: '/en/' },
        de: { title: 'Startseite', url: '/de/' },
    }],
});
gameConsole.init();
```

`GameEditorApp` and `GameConsoleApp` accept `gameCatalog` through their options, while `BrowserApp` accepts `databaseCatalog`. Catalogs are used only by the Open dialog; startup resources use `initialGameUrl`, `initialGameUrls`, or `initialDatabaseUrls`. The public module exports `GameCatalogEntry`, `DatabaseCatalogEntry`, `CatalogFile`, and `CatalogLocalization`, as well as `assertGameCatalog` and `assertDatabaseCatalog` for validating untyped runtime data. Each localization contains a title, an optional `pageUrl`, and a possibly empty `files` list. Game filenames use `.xml` for standalone XML or `.eskuelgame` for game packages; database filenames use `.eskueldb` for Eskuel database packages, `.sql` for initialization scripts, or a supported SQLite database extension for database files.

## License

Eskuel Suite is Copyright © 2026 Lukas Convent and is free software licensed under the GNU General Public License, version 3 only (`GPL-3.0-only`). You may redistribute and/or modify it under that license. Eskuel Suite is provided without any warranty, including the implied warranties of merchantability or fitness for a particular purpose. See [COPYING](COPYING) for the complete license terms and [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES) for bundled dependencies' notices and license texts. The About modal links to both legal documents in the public GitHub repository; application and embed builds do not include separate copies.

After changing production dependencies, run `npm run licenses:generate` and review the resulting changes. Builds and the full test command reject a missing or stale third-party-license file.

When no catalog entries are provided, the Open button launches the native file picker directly.

## Packaging a release

Run `npm pack` from a source checkout with dependencies installed. Its `prepack` step checks the license notices, builds the ready-to-host embed files and the npm library with generated declarations, and rebuilds all CLI tools from an empty `dist-cli` directory. The npm `files` list includes these generated outputs, documentation, format specifications, example games and databases, and license notices. Editor settings, tests, and deployment scripts stay in the source repository.

Before publishing, run `npm run test:distribution` to pack the release and exercise it from a temporary consumer project. It checks TypeScript imports, CLI startup, and all three widgets in both a Vite production build and a plain-HTML deployment, including SQL execution through the shipped SQLite and PostgreSQL assets. The check uses headless Chromium and a local loopback server.


# Technology

The main technologies are:

- **TypeScript** as the main programming language.
- **React** as the frontend library for building the user interface.
- **Node.js 24+** as the runtime for build scripts, maintenance scripts, and CLI tools.
- **npm** as the package manager and script runner.
- **Vite** as the development server and production bundling tool.
- **sql.js** for running SQLite client-side in the browser through WebAssembly.
- **PGlite** for running PostgreSQL client-side in the browser through WebAssembly.
- **Bootstrap** as the CSS framework.
- **Monaco Editor** as the SQL code editor.
- **Dockview** for movable, resizable workspace panels.
- **Effect** for asynchronous operations and session management.
- **i18next** for English and German translations.

The complete direct dependency list is in [package.json](./package.json), and the source repository's [package-lock.json](https://github.com/lucques/eskuel-suite/blob/master/package-lock.json) records the exact dependency tree used for reproducible installs. [THIRD_PARTY_LICENSES](./THIRD_PARTY_LICENSES) contains the production dependencies' license notices.
