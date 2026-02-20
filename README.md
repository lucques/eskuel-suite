# eskuel-suite

This library allows to build web-based educational material for the database query language SQL. It builds upon [sql.js](https://sql.js.org) which provides an SQLite implementation for the web browser. There are three main components that can be plugged as widgets into any webpage.

A fully working platform ("online demo" for the library) can be found [here](https://eskuel.de).


# Components
- **SQL Browser**: Given some initial SQL script for setting up tables, the SQL Browser allows viewing the tables' schemas and querying the database.
- **SQL Game Console**: Based on the [SQL Island](sql-island.informatik.uni-kl.de/) game by Johannes Schildgen, the SQL Game Console allows to play a game where the player has to solve SQL queries to progress.
- **SQL Game Editor**: A tool to create new games for the SQL Game Console.


# Setup
1. Clone this repository.
2. Download the following external libraries:
    - sql.js library as described [here](./public/ext/sql-js/README.md)
    - bootstrap framework as described [here](./public/ext/bootstrap/README.md)

# Usage
There are two ways to use this library.

## Scenario 1: Standalone
Run `npm run dev-serve` to build and serve the library on [http://localhost:3000](http://localhost:3000).

## Scenario 2: Embedded
The library offers you to plug in widgets at arbitrary places of your own HTML. Follow these steps.
1. Run `npm run prod-build` to build the library. The library will land in the `dist` folder.
2. Include the `dist/eskuel-suite.js` file in your HTML.
    ```html
    <script defer="defer" src="/res/504.js"></script>
    <script defer="defer" src="/res/eskuel-suite.js"></script>
    ```
    *TODO: How can I make sure the file is not called 504.js? → Change bundler to vite?*
3. Embed widgets in one of the following ways:
    ```html
    <div id="eskuel-root"></div>
    ```
    The library will automatically find the `eskuel-root` div and replace it with the whole suite.
    ```html
    <script>
        document.addEventListener('DOMContentLoaded', function () {       
            const b = new eskuelSuite.MultiBrowserComponent('browser');
            b.addAndOpenUrl('/res/database.sql');
            b.init();
        });
    </script>
    <div id="browser"></div>
    ```
    The library will place a browser component in the `browser` div.


# Technology
Here are some details about the tech stack used in this project:
- Node.js/npm as build environment
- TypeScript as programming language
- React for the UI components
- Webpack for bundling
- sql.js for the SQLite implementation
- Bootstrap for HTML & CSS

Furthermore, the following packages are used:
- `react-tabs` for tabbed views
- `react-grid-layout` for draggable widgets
- `react-syntax-highlighter` for syntax highlighting (uses PrismJS)
