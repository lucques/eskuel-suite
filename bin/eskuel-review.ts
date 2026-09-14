import { Effect } from 'effect';

import { GameEditorSession } from '../src/apps/game-editor/session';
import { createSceneTestStatuses } from '../src/apps/game-editor/testing';
import { cliAdapters, CliImages, jsonStringify, parseOptions, readGameFile, reportCliError } from './game-cli/common';
import { checkPassed, sceneIndexEntry, selectSceneRange, summarizeChecks } from './game-cli/review-report';

const USAGE = `Usage: eskuel-review <game.xml|game.eskuelgame> [options]

Inspect game content and run the editor's reference solutions and manipulation checks.
  --scene N       Show scene N and test its prerequisites and that scene (numbered from 1).
  --scenes N-M    Show an inclusive scene range and test all scenes through M.
  --index         List scene numbers, types, and short text previews without running SQL.
  --summary       Run checks and show counts and issues without scene content or result tables.
  --inspect-only  Parse and inspect without initializing or executing the database.
  --database FILE Supply a database for standalone XML without an embedded database.
  --json          Print a structured JSON report.

Use --scene or --scenes with --index or --summary to limit the report.
--index and --summary are mutually exclusive; --summary requires execution.
Omit --index and --summary for full author content, schema, and detailed check results.
The report exposes author information, including solutions. It does not edit files.
Full reports extract images to temporary files and include their paths.
Exit status: 0 = checks passed (or inspection succeeded), 1 = errors, untested tasks,
or a manipulation check that cannot distinguish the initial and solved state.
`;

async function main(args: string[]): Promise<void> {
    const options = parseOptions(args, true);
    if (options.help) {
        process.stdout.write(USAGE);
    }
    else if (options.index && options.summary) {
        throw new Error('--index and --summary cannot be combined');
    }
    else if (options.summary && options['inspect-only']) {
        throw new Error('--summary requires execution and cannot be combined with --inspect-only');
    }
    else {
        const loaded = await readGameFile(options.filename, options.database);
        const { game, packageInfo } = loaded;
        const selection = selectSceneRange(options.scene, options.scenes, game.scenes.length);
        const inspectOnly = options.index || options['inspect-only'];
        const compact = options.index || options.summary;
        const session = new GameEditorSession(options.filename, { type: 'object', source: game },
            cliAdapters(new URL('./game-database-worker.mjs', import.meta.url)), undefined, { packageInfo });
        let statuses = createSceneTestStatuses(game.scenes);
        let database: object = { kind: 'not-opened' };
        let executionError: unknown;
        try {
            if (!inspectOnly) {
                await Effect.runPromise(session.resolve());
                const initial = session.getSnapshot();
                if (initial.kind === 'ready') {
                    if (initial.databaseStatus.kind === 'loaded') {
                        await Effect.runPromise(session.dispatch({ type: 'test-scenes-up-to', index: selection.last - 1 }));
                    }
                    const tested = session.getSnapshot();
                    if (tested.kind === 'ready') {
                        statuses = tested.sceneTestStatuses;
                        const status = tested.databaseStatus;
                        database = status.kind === 'loaded'
                            ? { kind: status.kind, ...(options.summary ? {} : { schema: status.schema }) }
                            : status;
                    }
                    else if (tested.kind === 'failed') {
                        executionError = tested.error;
                    }
                    else if (tested.kind === 'loading') {
                        throw new Error('Editor is still loading after testing');
                    }
                    else { const _n: never = tested; return _n; }
                }
                else if (initial.kind === 'failed') {
                    executionError = initial.error;
                }
                else if (initial.kind === 'loading') {
                    throw new Error('Editor is still loading after initialization');
                }
                else { const _n: never = initial; return _n; }
            }
            const checkedStatuses = statuses.slice(0, selection.last);
            const snapshot = session.getSnapshot();
            const databaseFailed = snapshot.kind === 'ready' && snapshot.databaseStatus.kind === 'failed';
            const ok = inspectOnly
                || (executionError === undefined && !databaseFailed && checkedStatuses.every(checkPassed));
            const images = new CliImages();
            const scenes = [];
            if (!options.summary) {
                for (let index = selection.first - 1; index < selection.last; index++) {
                    const scene = game.scenes[index];
                    if (options.index) {
                        scenes.push(sceneIndexEntry(scene, index + 1));
                    }
                    else {
                        scenes.push({ sceneNumber: index + 1, ...(scene.type === 'image' ? await images.export(scene) : scene) });
                    }
                }
            }
            const report = {
                ok,
                execution: inspectOnly ? 'not-run' : 'tested',
                game: {
                    title: game.title,
                    ...(compact ? {} : { teaser: game.teaser, copyright: game.copyright }),
                    sceneCount: game.scenes.length, databaseSystem: game.dbSystem, databaseSystemMinVersion: game.dbSystemMinVersion,
                },
                ...(compact ? {} : { packageInfo }),
                database,
                ...(compact || options.scenes !== undefined ? { selection } : {}),
                ...(options.summary ? summarizeChecks(checkedStatuses) : {
                    scenes,
                    ...(options.index ? {} : {
                        checks: checkedStatuses.map((test, index) => ({ sceneNumber: index + 1, ...test })),
                    }),
                }),
                ...(executionError === undefined ? {} : { error: executionError }),
            };
            if (!options.json) {
                process.stdout.write(`${game.title}: ${inspectOnly ? 'inspection complete' : ok ? 'checks passed' : 'checks need attention'}\n`);
            }
            process.stdout.write(`${jsonStringify(report, true)}\n`);
            if (!ok) {
                process.exitCode = 1;
            }
        }
        finally {
            session.dispose();
        }
    }
}

void main(process.argv.slice(2)).catch(error => reportCliError(error, process.argv.includes('--json')));
