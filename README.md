# eskuel-suite

This library allows to build web-based educational material for the database query language SQL. It builds upon [sql.js](https://sql.js.org) which provides an SQLite implementation for the web browser. There are three main components that can be plugged as widgets into any webpage.

An online demo can be found [here](https://eskuel.de).


# Components
- **SQL Browser**: Given some initial SQL script for setting up tables, the SQL Browser allows viewing the tables' schemas and querying the database.
- **SQL Game Console**: Based on the [SQL Island](sql-island.informatik.uni-kl.de/) game by Johannes Schildgen, the SQL Game Console allows to play a game where the player has to solve SQL queries to progress.
- **SQL Game Editor**: A tool to create new games for the SQL Game Console.


# Usage
For a quick start, follow these steps:
1. Download the following external libraries:
    - sql.js library as described [here](./public/ext/sql-js/README.md)
    - bootstrap framework as described [here](./public/ext/bootstrap/README.md)
2. Run `npm run dev-serve` to build and serve the library on [http://localhost:3000](http://localhost:3000).

The library can be used in any web-based project. Simply compile the library using `npm run prod-build` and include the resulting `dist/eskuel-suite.js` file in your project.


# Technology
Here are some details about the tech stack used in this project:
- Node.js/npm as build environment
- TypeScript as programming language
- React for the UI components
- Webpack for bundling
- sql.js for the SQLite implementation
- Bootstrap for styling

Furthermore, the following packages are used:
- `react-tabs` for tabbed views
- `react-grid-layout` for draggable widgets
- `react-syntax-highlighter` for syntax highlighting (uses PrismJS)
