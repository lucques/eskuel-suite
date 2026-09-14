# Playing and reviewing games from the command line

`eskuel-play` provides a live player session. `eskuel-review` inspects author content and executes the game editor's scene tests. Both accept local `.xml` and `.eskuelgame` files and use the same game loaders, database engines, and sessions as the applications. The separate [`eskuelgame` command](./eskuelgame-tool.md) remains the package authoring tool. Edit XML directly with your usual editor; neither new command changes game files.

## Run from a checkout

```sh
npm run game-cli:bundle
node dist-cli/eskuel-play.mjs game.xml
node dist-cli/eskuel-review.mjs game.xml --json
```

The `npm run eskuel-play -- <arguments>` and `npm run eskuel-review -- <arguments>` shortcuts bundle and launch the tools. For machine-readable stdout, bundle once and invoke the `.mjs` files directly; the npm shortcuts also print npm and bundler messages. Installing the package globally makes `eskuel-play` and `eskuel-review` available on `PATH`.

For authoring XML whose database is normally supplied during packaging, both tools accept `--database database.eskueldb`. An initialization `.sql` script or supported SQLite database file also works. This option requires standalone XML without an embedded database, and the database system must match the XML declaration. Both the game's and the database's minimum versions are enforced when the database is opened.

## Play

```sh
eskuel-play game.xml
eskuel-play game.eskuelgame --json
eskuel-play game.xml --database database.eskueldb --json
```

The command prints the initial scene, then accepts one command per input line. Keep the process and its stdin open between actions: the live player database retains unsuccessful SQL attempts as well as successful ones. Closing stdin or sending `quit` disposes the session. Starting a new process starts a new game; no checkpoint files or background service are created.

| Command | Action |
| --- | --- |
| `look` | Show the current scene, task counts, status, SQL placeholder, revealed text hints, and available commands. |
| `schema` | Show the same schema as the console's schema panel. |
| `sql <SQL>` | Execute SQL or a SQL batch; on an unsolved task, evaluate it as an answer. |
| `next`, `previous` | Navigate using the console's rules. Correct answers advance automatically when the console would. |
| `skip` | Skip the current unsolved task, applying the console's canonical scene effects. |
| `hint` | Reveal the next ordinary hint, in document order. |
| `solution` | Use a solution hint when available, or show the sample solution after solving a task yourself. |
| `reset-hints` | Reset the hint sequence and, when applicable, undo the solution hint's solved state. |
| `reset-db` | Reconstruct the database at the current scene, preserving canonical effects from previous scenes. |
| `restart` | Reset progress, results, hints, and databases. |
| `results` | Show all retained results, newest first. |
| `remove-result <id>` | Dismiss a result from the timeline. |
| `about` | Show game metadata and, for packages, the game and database licensing information. |
| `cancel` | Cancel a running query or SQL-backed hint, then reconstruct the databases as the console does. |
| `help`, `quit` | Show help or close the session. |

The response's `availableCommands` lists the actions currently permitted. An unavailable action reports an error without advancing or destroying the game. Solutions, unrevealed hints, future scene contents, comparison settings, and database initialization data are excluded from player output. A SELECT expected-result hint reveals rows but hides the generating SQL. A manipulation hint includes its check query, matching the browser console. A player can still learn information through ordinary SQL exploration, as in the browser.

Image scenes are extracted on demand to temporary files. The scene response contains their absolute `path` and `mediaType`; an AI with an image-viewing tool can inspect that file. Files remain available after process exit, and their temporary directory can be removed when the review is complete.

### JSON input and output

Plain commands and JSON requests are accepted in either output mode. JSON input is useful for multiline SQL:

```json
{"command":"sql","sql":"SELECT\n    name\nFROM items\nORDER BY id"}
{"command":"hint"}
{"command":"remove-result","id":0}
```

With `--json`, stdout contains JSON Lines. The first response has `command: "look"`. Each subsequent action returns `ok`, `command`, `state`, and newly added `results`; `results` explicitly requests the complete retained timeline. `schema`, `about`, and `help` add their requested information. Errors return `{"ok":false,"error":"..."}`. `quit` closes without a reply. SQL errors and incorrect answers appear in the result entries, rather than terminating the session. Result tables preserve the session's `truncated` flag; by default the session displays at most 50 rows per table. Binary SQL values are encoded as `{"type":"bytes","base64":"..."}`.

Ordinary commands supplied in a batch run sequentially. While a command is running, `cancel` is handled immediately; its acknowledgement may precede the cancelled command's final response. Wait for that final response before submitting more SQL. Ctrl-C cancels a cancellable operation; otherwise it exits. Worker threads keep the command interface responsive while either SQLite or PostgreSQL executes SQL.

The process exits with status 0 after normal closure and 1 for startup or fatal session failures. Invalid commands and incorrect answers are reported in the stream; consumers should check each response and result.

## Review

```sh
eskuel-review game.xml --json
eskuel-review game.eskuelgame --scene 4 --json
eskuel-review game.xml --inspect-only --json
```

By default, review executes the editor's reference solutions and manipulation checks in scene order. The report includes scene content, hints, solutions, check queries, SELECT comparison settings, the initial database schema, package metadata, and per-scene test results. It omits the raw initialization script and database bytes. Images are extracted to temporary files as in play.

`--scene N` uses scene numbers starting at 1, prints that scene's author content, and tests all prerequisites through that scene. `--scenes N-M` selects an inclusive range, such as `--scenes 4-8`, and tests all scenes from 1 through M. Choose either `--scene` or `--scenes`; ranges must be ascending and within the game. The detailed report's `checks` array includes preceding scenes so a blocking failure is visible. Later scenes are not tested. `--inspect-only` parses and inspects the selected content without opening a database or executing SQL; the report explicitly marks execution as `not-run`.

For agents working with large games, start with an index, inspect relevant scenes, then run a check summary. Use a detailed report for a scene that needs investigation:

```sh
eskuel-review game.xml --index --json
eskuel-review game.xml --scenes 4-8 --inspect-only --json
eskuel-review game.xml --summary --json
eskuel-review game.xml --scene 6 --json
```

| Output mode | Contents and execution |
| --- | --- |
| Default | Full selected scenes, initial schema, package metadata, and detailed results for all checks through the last selected scene. Add `--inspect-only` to skip execution. |
| `--index` | Selected scene numbers and types, with text previews or image media types. Always skips database execution and image extraction; no `checks` array. |
| `--summary` | Executes checks through the last selected scene and returns counts plus failed or untested tasks. Omits scene content, schema, and result tables. |

Both compact modes accept `--scene` or `--scenes`, retain the game title, scene count, and database system requirements, and omit teaser, copyright, and package metadata, including bundled license texts. They include `selection: { first, last }` using the original scene numbers; detailed range reports also include this field. Index previews normalize whitespace and contain at most 120 Unicode characters, including a trailing ellipsis when shortened. Image entries contain their media type; request the full scene to extract a viewable image file. `--index` and `--summary` cannot be combined, and `--summary` cannot be combined with `--inspect-only`.

The summary's `checkSummary` contains `scenes`, `passed`, `failed`, `untested`, and `noTest` counts. Counts cover all scenes from 1 through the last selected scene, including prerequisites; text and image scenes count as `noTest`. Its `checks` array contains only failed or untested tasks, including those before the selected range. Each issue retains its `sceneNumber`, `kind`, and manipulation `outcome` when applicable. SQL errors also include `sql` and `error`. Database initialization errors remain in `database`, and session errors remain in `error`. A successful summary has an empty `checks` array. Omit `--summary` to inspect detailed results; these retain the editor's default limit of 50 rows per result table and mark omitted rows with `truncated: true`.

Check statuses are the editor's own statuses:

| Status | Meaning |
| --- | --- |
| `none` | A text or image scene has no SQL test. |
| `unknown` | A task has not been tested, for example because an earlier manipulation failed. |
| `select-result` | The reference SELECT's SQL result or error. |
| `manipulate-result` / `success` | The solution and check executed, and the check distinguished the before and after states. |
| `manipulate-result` / `sql-sol-error` | The manipulation solution failed. |
| `manipulate-result` / `sql-check-error` | The check failed after the manipulation. |
| `manipulate-result` / `sql-check-no-witness` | The check returned the same result before and after the solution. |

Exit status 0 means the requested checks passed, or that inspection succeeded. Status 1 means an input or execution error, an untested requested task, or an ineffective manipulation check. An empty successful SELECT result remains a successful SQL test; the AI or author should assess whether it fits the task. Executable checks supply evidence for review and do not establish story coherence, unambiguous wording, appropriate difficulty, or whether every incorrect answer is rejected.

## Implementation and verification

Play wraps `GameConsoleSession` with a player-visible projection and shares ordinary-hint controls with `GameConsoleView`. Review wraps `GameEditorSession`. Node worker transports reuse the existing SQLite and PGlite protocol engines and database cores; cancellation disposes the worker and lets the session perform its usual reconstruction. There is no separate game evaluator.

The executable integration tests build isolated CLI bundles and exercise real databases, player restrictions, hints, navigation, resets, cancellation, packages, and review failures:

```sh
npm run test:integration:node -- tests/integration/node/game-cli.integration.test.ts
npm run typecheck
```
