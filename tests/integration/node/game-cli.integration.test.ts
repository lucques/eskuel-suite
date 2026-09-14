import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';

import { Game } from '../../../src/game/model';
import { gameToXML } from '../../../src/game/xml/codec';
import { createInventoryGame } from '../support/game-builder';

let directory: string;
let gameFile: string;
let hintedGameFile: string;
const children = new Set<ChildProcessWithoutNullStreams>();

beforeAll(async () => {
    await mkdir(resolve('node_modules/.tmp'), { recursive: true });
    directory = await mkdtemp(resolve('node_modules/.tmp/game-cli-test-'));
    await build({
        configFile: resolve('bin/game-cli.vite.config.ts'),
        logLevel: 'silent',
        build: { outDir: directory },
    });
    gameFile = await saveGame('inventory', createInventoryGame());
    const hinted = createInventoryGame();
    const select = hinted.scenes[1];
    if (select.type === 'select') {
        hinted.scenes[1] = {
            ...select,
            sqlSol: `${select.sqlSol} /* reference secret */`,
            ordinaryHints: [{ type: 'text', text: 'Use the items table.' }, { type: 'expected-result' }],
            hasSolHint: true,
        };
        hinted.scenes[2] = { type: 'text', text: 'Future scene secret' };
    }
    else {
        throw new Error('Expected a SELECT fixture');
    }
    hintedGameFile = await saveGame('hints', hinted);
}, 30_000);

afterEach(() => {
    for (const child of children) {
        child.kill('SIGKILL');
    }
    children.clear();
});

afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
});

async function saveGame(name: string, game: Game): Promise<string> {
    const path = join(directory, `${name}.xml`);
    await writeFile(path, gameToXML(game));
    return path;
}

function startCli(name: 'eskuel-play' | 'eskuel-review', args: string[]) {
    const child = spawn(process.execPath, [join(directory, `${name}.mjs`), ...args], { stdio: 'pipe' });
    children.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout += String(data); });
    child.stderr.on('data', data => { stderr += String(data); });
    const finished = new Promise<{ stdout: string, stderr: string, code: number | null }>((resolveResult, reject) => {
        child.on('error', reject);
        child.on('close', code => {
            children.delete(child);
            resolveResult({ stdout, stderr, code });
        });
    });
    return { child, finished };
}

async function runCli(name: 'eskuel-play' | 'eskuel-review', args: string[], input = '') {
    const process = startCli(name, args);
    process.child.stdin.end(input);
    return process.finished;
}

async function playBatch(file: string, commands: string[]) {
    const result = await runCli('eskuel-play', [file, '--json'], `${commands.join('\n')}\n`);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    return result.stdout.trim().split('\n').map(line => JSON.parse(line));
}

function openPlayer(file: string) {
    const process = startCli('eskuel-play', [file, '--json']);
    const lines = createInterface({ input: process.child.stdout });
    const buffered: Record<string, unknown>[] = [];
    const waiting: Array<(reply: Record<string, unknown>) => void> = [];
    lines.on('line', line => {
        const reply = JSON.parse(line) as Record<string, unknown>;
        const resolveReply = waiting.shift();
        if (resolveReply === undefined) {
            buffered.push(reply);
        }
        else {
            resolveReply(reply);
        }
    });
    return {
        ...process,
        send(command: string) { process.child.stdin.write(`${command}\n`); },
        next(): Promise<Record<string, unknown>> {
            const reply = buffered.shift();
            if (reply === undefined) {
                return new Promise(resolveReply => { waiting.push(resolveReply); });
            }
            else {
                return Promise.resolve(reply);
            }
        },
    };
}

describe('eskuel-play executable', () => {
    it('exposes only current player information and enforces ordered hints and solution visibility', async () => {
        const replies = await playBatch(hintedGameFile, [
            'next', 'solution', 'hint', 'hint', 'solution', 'reset-hints', 'hint', 'reset-hints',
        ]);
        expect(replies[0]).toMatchObject({ ok: true, state: { sceneNumber: 1, scene: { text: 'Introduction' } } });
        expect(JSON.stringify(replies.slice(0, 5))).not.toContain('reference secret');
        expect(JSON.stringify(replies)).not.toContain('Future scene secret');
        expect(replies[2]).toMatchObject({ ok: false });
        expect(replies[3]).toMatchObject({ state: { revealedHints: ['Use the items table.'] } });
        expect(replies[4]).toMatchObject({
            results: [{ type: 'ordinary-hint-select', expectedResult: { type: 'succ', result: [{ values: [['hammer'], ['key']] }] } }],
        });
        expect(replies[4].results[0].expectedResult).not.toHaveProperty('sql');
        expect(replies[5]).toMatchObject({ state: { status: 'task-solved-by-sol-hint', sceneNumber: 2 } });
        expect(JSON.stringify(replies[5])).toContain('reference secret');
        expect(replies[6]).toMatchObject({ state: { status: 'task-unsolved', revealedHints: [] } });
        expect(replies[7]).toMatchObject({ state: { revealedHints: ['Use the items table.'] } });
        expect(replies[8]).toMatchObject({ state: { revealedHints: [] } });
    });

    it('rejects unavailable navigation and hints without destroying the session', async () => {
        const replies = await playBatch(gameFile, ['previous', 'hint', 'next', 'next', 'solution', 'hint', 'schema']);
        expect(replies.filter(reply => !reply.ok)).toHaveLength(5);
        expect(replies.at(-1)).toMatchObject({ ok: true, schema: { kind: 'loaded', data: [{ name: 'items' }] }, state: { sceneNumber: 2 } });
    });

    it('keeps failed attempts in the live database and resets at the current scene', async () => {
        const replies = await playBatch(gameFile, [
            'next',
            'sql SELECT name FROM items ORDER BY id',
            'sql UPDATE items SET collected = 7 WHERE id = 1',
            'sql SELECT collected FROM items ORDER BY id',
            'reset-db',
            'sql SELECT collected FROM items ORDER BY id',
            'sql UPDATE items SET collected = 1 WHERE name = \'key\'',
            'reset-db',
            'sql SELECT name FROM items WHERE collected = 1',
            'restart',
        ]);
        expect(replies[3]).toMatchObject({ state: { sceneNumber: 3 }, results: [{ type: 'miss' }] });
        expect(replies[4].results[0].res.result[0].values).toEqual([[7], [0]]);
        expect(replies[5]).toMatchObject({ state: { sceneNumber: 3 }, results: [{ type: 'database-reset-notice', trigger: 'manual' }] });
        expect(replies[6].results[0].res.result[0].values).toEqual([[0], [0]]);
        expect(replies[8]).toMatchObject({ state: { sceneNumber: 4 } });
        expect(replies[9]).toMatchObject({ state: { finished: true, solvedTasks: 3, sceneNumber: 5 }, results: [{ type: 'correct' }] });
        expect(replies[10]).toMatchObject({ state: { sceneNumber: 1, solvedTasks: 0 }, results: [] });
    });

    it('supports skips, backwards navigation, sample solutions, multiline SQL, and dismissing results', async () => {
        const replies = await playBatch(gameFile, [
            'next',
            JSON.stringify({ command: 'sql', sql: 'SELECT\n    name FROM items ORDER BY id' }),
            'previous', 'solution', 'next', 'skip',
            'sql SELECT name FROM items WHERE collected = 1',
            'results', 'remove-result 0', 'results', 'about',
        ]);
        expect(replies[3]).toMatchObject({ state: { sceneNumber: 2, status: 'task-solved-by-user' } });
        expect(replies[4]).toMatchObject({ results: [{ type: 'sample-sol' }] });
        expect(replies[6]).toMatchObject({ state: { sceneNumber: 4, skippedTasks: 1 } });
        expect(replies[7]).toMatchObject({ state: { finished: true }, results: [{ type: 'correct' }] });
        expect(replies[8].results).toHaveLength(3);
        expect(replies[10].results).toHaveLength(2);
        expect(replies[11]).toMatchObject({ title: 'Inventory', copyright: 'Test fixture' });
    });

    it('keeps a lone expected-result hint repeatable and makes the final skipped task revisit-able', async () => {
        const original = createInventoryGame();
        const scene = original.scenes[1];
        if (scene.type === 'select') {
            const file = await saveGame('single', new Game('Single', '', '', original.dbData, [{ ...scene, ordinaryHints: [{ type: 'expected-result' }] }]));
            const replies = await playBatch(file, ['hint', 'hint', 'skip', 'previous']);
            expect(replies[2].results[0]).toMatchObject({ type: 'ordinary-hint-select' });
            expect(replies[2].state.availableCommands).not.toContain('reset-hints');
            expect(replies[3].state).toMatchObject({ finished: true, status: 'task-skipped' });
            expect(replies[4].state).toMatchObject({ finished: false, status: 'task-unsolved' });
        }
        else {
            throw new Error('Expected a SELECT fixture');
        }
    });

    it('reveals the manipulation check SQL through its ordinary hint, as the browser does', async () => {
        const game = createInventoryGame();
        const scene = game.scenes[2];
        if (scene.type === 'manipulate') {
            game.scenes[2] = { ...scene, ordinaryHints: [{ type: 'expected-result' }] };
            const file = await saveGame('manipulation-hint', game);
            const replies = await playBatch(file, ['next', 'skip', 'hint']);
            expect(replies[3]).toMatchObject({ results: [{ type: 'ordinary-hint-manipulate', checkResult: { sql: scene.sqlCheck } }] });
            expect(JSON.stringify(replies[3])).not.toContain(scene.sqlSol);
        }
        else {
            throw new Error('Expected a manipulation fixture');
        }
    });

    it.each(['sqlite', 'postgresql'] as const)('cancels a real running %s query and remains playable', async system => {
        const file = system === 'sqlite' ? gameFile : await saveGame('cancel-postgresql', createInventoryGame(system));
        const player = openPlayer(file);
        expect(await player.next()).toMatchObject({ ok: true });
        player.send('sql WITH RECURSIVE counter(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM counter) SELECT sum(x) FROM counter');
        await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
        player.send('cancel');
        const replies = [await player.next(), await player.next()];
        expect(replies).toEqual(expect.arrayContaining([
            expect.objectContaining({ ok: true, command: 'cancel' }),
            expect.objectContaining({ ok: true, command: 'sql', results: [expect.objectContaining({ type: 'database-reset-notice', trigger: 'cancellation' })] }),
        ]));
        player.send('sql SELECT CAST(count(*) AS INTEGER) FROM items');
        expect(await player.next()).toMatchObject({ ok: true, results: [{ type: 'sql', res: { result: [{ values: [[2]] }] } }] });
        player.child.stdin.end();
        expect((await player.finished).code).toBe(0);
    }, 40_000);

    it('handles a cancel buffered in the same input batch as its query', async () => {
        const replies = await playBatch(gameFile, [
            'sql WITH RECURSIVE counter(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM counter) SELECT sum(x) FROM counter',
            'cancel', 'schema',
        ]);
        expect(replies).toEqual(expect.arrayContaining([
            expect.objectContaining({ ok: true, command: 'cancel' }),
            expect.objectContaining({ ok: true, command: 'sql', results: [expect.objectContaining({ type: 'database-reset-notice', trigger: 'cancellation' })] }),
            expect.objectContaining({ ok: true, command: 'schema' }),
        ]));
    });

    it('rejects malformed and privileged commands, and still accepts subsequent valid commands', async () => {
        const replies = await playBatch(gameFile, [
            '{', '{"command":"restore-progress","scene":4}', '{"command":"look","sql":"SELECT 1"}',
            'sql', 'remove-result -1', 'look extra', 'schema',
        ]);
        expect(replies.filter(reply => !reply.ok)).toHaveLength(6);
        expect(replies.at(-1)).toMatchObject({ ok: true, command: 'schema' });
    });

    it('marks truncated results and encodes binary SQL values without losing bytes', async () => {
        const replies = await playBatch(gameFile, [
            'sql WITH RECURSIVE counter(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM counter WHERE x < 55) SELECT x FROM counter',
            'sql SELECT X\'0001ff\' AS binary_value',
        ]);
        expect(replies[1].results[0].res.result[0]).toMatchObject({ truncated: true });
        expect(replies[1].results[0].res.result[0].values).toHaveLength(50);
        expect(replies[2].results[0].res.result[0].values).toEqual([[{ type: 'bytes', base64: 'AAH/' }]]);
    });

    it('prints discoverable help and closes on quit without executing subsequent commands', async () => {
        const help = await runCli('eskuel-play', ['--help']);
        expect(help.code).toBe(0);
        expect(help.stdout).toContain('reset-db');
        expect(help.stdout).toContain('cancel');
        const replies = await playBatch(gameFile, ['help', 'quit', 'next']);
        expect(replies).toHaveLength(2);
        expect(replies[1].help).toContain('reset-hints');
    });
});

describe('eskuel-review executable', () => {
    it('executes a complete game and reports author content, schema, and real results', async () => {
        const result = await runCli('eskuel-review', [gameFile, '--json']);
        expect(result.stderr).toBe('');
        expect(result.code).toBe(0);
        const report = JSON.parse(result.stdout);
        expect(report).toMatchObject({ ok: true, execution: 'tested', database: { kind: 'loaded', schema: [{ name: 'items' }] } });
        expect(report.scenes[2]).toMatchObject({ sqlSol: 'UPDATE items SET collected = 1 WHERE name = \'key\'' });
        expect(report.checks[2]).toMatchObject({ kind: 'manipulate-result', outcome: 'success' });
        expect(report.checks[3].result.result[0].values).toEqual([['key']]);
    });

    it('reconstructs prerequisites when reviewing one scene', async () => {
        const result = await runCli('eskuel-review', [gameFile, '--scene', '4', '--json']);
        expect(result.code).toBe(0);
        const report = JSON.parse(result.stdout);
        expect(report.scenes).toHaveLength(1);
        expect(report.scenes[0].sceneNumber).toBe(4);
        expect(report.checks[2].outcome).toBe('success');
        expect(report.checks[3].result.result[0].values).toEqual([['key']]);
    });

    it('indexes scene previews without executing SQL or exporting image payloads', async () => {
        const original = createInventoryGame();
        original.scenes[0] = { type: 'text', text: `Introduction\n\n${'🗝'.repeat(130)} hidden ending` };
        const bytes = await readFile(resolve('public/favicon/game-console-32x32.png'));
        original.scenes[4] = { type: 'image', mediaType: 'image/png', base64string: bytes.toString('base64') };
        const game = new Game(original.title, 'Teaser secret', 'Copyright secret', {
            type: 'initial-sql-script', system: 'sqlite', systemMinVersion: '3.0.0', sql: 'INVALID INITIALIZATION SQL',
        }, original.scenes);
        const file = await saveGame('index', game);
        const result = await runCli('eskuel-review', [file, '--index', '--json']);
        expect(result.stderr).toBe('');
        expect(result.code).toBe(0);
        const report = JSON.parse(result.stdout);
        expect(report).toMatchObject({
            ok: true, execution: 'not-run', database: { kind: 'not-opened' },
            selection: { first: 1, last: 5 }, game: { sceneCount: 5 },
        });
        expect(report.scenes).toEqual([
            { sceneNumber: 1, type: 'text', preview: `Introduction ${'🗝'.repeat(106)}…` },
            { sceneNumber: 2, type: 'select', preview: 'List every item' },
            { sceneNumber: 3, type: 'manipulate', preview: 'Collect the key' },
            { sceneNumber: 4, type: 'select', preview: 'Show collected items' },
            { sceneNumber: 5, type: 'image', mediaType: 'image/png' },
        ]);
        expect(report).not.toHaveProperty('checks');
        expect(report.game).not.toHaveProperty('teaser');
        expect(report.game).not.toHaveProperty('copyright');
    });

    it.each([
        { args: ['--scenes', '2-3'], first: 2, last: 3 },
        { args: ['--scene', '3'], first: 3, last: 3 },
    ])('limits the scene index with $args', async ({ args, first, last }) => {
        const result = await runCli('eskuel-review', [gameFile, '--index', ...args, '--json']);
        expect(result.code).toBe(0);
        const report = JSON.parse(result.stdout);
        expect(report.selection).toEqual({ first, last });
        expect(report.scenes.map((scene: { sceneNumber: number }) => scene.sceneNumber))
            .toEqual(Array.from({ length: last - first + 1 }, (_, index) => first + index));
        expect(report).not.toHaveProperty('checks');
    });

    it('reviews an inclusive range with prerequisites and does not execute later scenes', async () => {
        const game = createInventoryGame();
        const select = game.scenes[1];
        if (select.type === 'select') {
            game.scenes.push({ ...select, sqlSol: 'SELECT * FROM missing_later_table' });
        }
        else {
            throw new Error('Expected a SELECT fixture');
        }
        const file = await saveGame('range', game);
        const result = await runCli('eskuel-review', [file, '--scenes', '4-5', '--json']);
        expect(result.code).toBe(0);
        const report = JSON.parse(result.stdout);
        expect(report.selection).toEqual({ first: 4, last: 5 });
        expect(report.scenes.map((scene: { sceneNumber: number }) => scene.sceneNumber)).toEqual([4, 5]);
        expect(report.checks).toHaveLength(5);
        expect(report.checks[2]).toMatchObject({ sceneNumber: 3, outcome: 'success' });
        expect(report.checks[3].result.result[0].values).toEqual([['key']]);

        const inspection = await runCli('eskuel-review', [file, '--scenes', '5-6', '--inspect-only', '--json']);
        expect(inspection.code).toBe(0);
        const inspected = JSON.parse(inspection.stdout);
        expect(inspected.execution).toBe('not-run');
        expect(inspected.scenes.map((scene: { sceneNumber: number }) => scene.sceneNumber)).toEqual([5, 6]);
        expect(inspected.checks[5]).toEqual({ sceneNumber: 6, kind: 'unknown' });
    });

    it('summarizes successful checks without scene content, schema, or result tables', async () => {
        const result = await runCli('eskuel-review', [gameFile, '--summary', '--json']);
        expect(result.stderr).toBe('');
        expect(result.code).toBe(0);
        const report = JSON.parse(result.stdout);
        expect(report).toMatchObject({
            ok: true, execution: 'tested', selection: { first: 1, last: 5 },
            checkSummary: { scenes: 5, passed: 3, failed: 0, untested: 0, noTest: 2 },
            checks: [],
        });
        expect(report.database).toEqual({ kind: 'loaded' });
        expect(report).not.toHaveProperty('scenes');
    });

    it.each(['sql-sol-error', 'sql-check-error', 'sql-check-no-witness'] as const)(
        'keeps prerequisite %s issues in a summary of a later scene range',
        async outcome => {
            const game = createInventoryGame();
            const manipulation = game.scenes[2];
            if (manipulation.type === 'manipulate') {
                switch (outcome) {
                    case 'sql-sol-error':
                        game.scenes[2] = { ...manipulation, sqlSol: 'UPDATE missing_table SET collected = 1' };
                        break;
                    case 'sql-check-error':
                        game.scenes[2] = { ...manipulation, sqlCheck: 'SELECT * FROM missing_table' };
                        break;
                    case 'sql-check-no-witness':
                        game.scenes[2] = { ...manipulation, sqlCheck: 'SELECT 1' };
                        break;
                    default: { const _n: never = outcome; return _n; }
                }
            }
            else {
                throw new Error('Expected a manipulation fixture');
            }
            const file = await saveGame(`summary-${outcome}`, game);
            const result = await runCli('eskuel-review', [file, '--scenes', '4-4', '--summary', '--json']);
            expect(result.code).toBe(1);
            const report = JSON.parse(result.stdout);
            const blocked = outcome !== 'sql-check-no-witness';
            expect(report).toMatchObject({
                ok: false, selection: { first: 4, last: 4 },
                checkSummary: { scenes: 4, passed: blocked ? 1 : 2, failed: 1, untested: blocked ? 1 : 0, noTest: 1 },
            });
            expect(report.checks).toHaveLength(blocked ? 2 : 1);
            expect(report.checks[0]).toMatchObject({ sceneNumber: 3, kind: 'manipulate-result', outcome });
            expect(report.checks[0]).not.toHaveProperty('result');
            if (blocked) {
                expect(report.checks[0]).toMatchObject({ sql: expect.stringContaining('missing_table'), error: expect.any(String) });
                expect(report.checks[1]).toEqual({ sceneNumber: 4, kind: 'unknown' });
            }
        },
    );

    it('retains SELECT errors in summaries and counts other successful checks', async () => {
        const game = createInventoryGame();
        const select = game.scenes[1];
        if (select.type === 'select') {
            game.scenes[1] = { ...select, sqlSol: 'SELECT * FROM missing_table' };
        }
        else {
            throw new Error('Expected a SELECT fixture');
        }
        const file = await saveGame('summary-select-error', game);
        const result = await runCli('eskuel-review', [file, '--summary', '--json']);
        expect(result.code).toBe(1);
        const report = JSON.parse(result.stdout);
        expect(report.checkSummary).toEqual({ scenes: 5, passed: 2, failed: 1, untested: 0, noTest: 2 });
        expect(report.checks).toEqual([
            { sceneNumber: 2, kind: 'select-result', sql: 'SELECT * FROM missing_table', error: expect.any(String) },
        ]);
    });

    it('reports ineffective manipulation checks and blocked subsequent tasks with failing exit codes', async () => {
        const game = createInventoryGame();
        const manipulation = game.scenes[2];
        if (manipulation.type === 'manipulate') {
            game.scenes[2] = { ...manipulation, sqlCheck: 'SELECT 1' };
            const noWitness = await runCli('eskuel-review', [await saveGame('no-witness', game), '--json']);
            expect(noWitness.code).toBe(1);
            expect(JSON.parse(noWitness.stdout).checks[2]).toMatchObject({ outcome: 'sql-check-no-witness' });
            game.scenes[2] = { ...manipulation, sqlSol: 'UPDATE missing_table SET collected = 1' };
            const blocked = await runCli('eskuel-review', [await saveGame('blocked', game), '--json']);
            expect(blocked.code).toBe(1);
            expect(JSON.parse(blocked.stdout).checks.slice(2, 4)).toMatchObject([
                { kind: 'manipulate-result', outcome: 'sql-sol-error' },
                { kind: 'unknown' },
            ]);
        }
        else {
            throw new Error('Expected a manipulation fixture');
        }
    });

    it('can inspect content without executing a broken database initialization script', async () => {
        const original = createInventoryGame();
        const game = new Game(original.title, '', '', {
            type: 'initial-sql-script', system: 'sqlite', systemMinVersion: '3.0.0', sql: 'INVALID INITIALIZATION SQL',
        }, original.scenes);
        const file = await saveGame('broken-initialization', game);
        const inspection = await runCli('eskuel-review', [file, '--inspect-only', '--json']);
        expect(inspection.code).toBe(0);
        expect(JSON.parse(inspection.stdout)).toMatchObject({ ok: true, execution: 'not-run', database: { kind: 'not-opened' } });
        const execution = await runCli('eskuel-review', [file, '--json']);
        expect(execution.code).toBe(1);
        expect(JSON.parse(execution.stdout)).toMatchObject({ ok: false, database: { kind: 'failed' } });
        const summary = await runCli('eskuel-review', [file, '--summary', '--json']);
        expect(summary.code).toBe(1);
        expect(JSON.parse(summary.stdout)).toMatchObject({
            ok: false, database: { kind: 'failed' },
            checkSummary: { scenes: 5, passed: 0, failed: 0, untested: 3, noTest: 2 },
        });
    });

    it('accepts XML with a separate database and leaves source files unchanged', async () => {
        const game = createInventoryGame();
        const xml = await saveGame('external-database', new Game(game.title, '', '', null, game.scenes));
        const database = join(directory, 'database.sql');
        if (game.dbData?.type === 'initial-sql-script') {
            await writeFile(database, game.dbData.sql);
        }
        const before = await readFile(xml, 'utf8');
        const result = await runCli('eskuel-review', [xml, '--database', database, '--json']);
        expect(result.code).toBe(0);
        expect(JSON.parse(result.stdout).ok).toBe(true);
        expect(await readFile(xml, 'utf8')).toBe(before);
        const play = await runCli('eskuel-play', [xml, '--database', database, '--json'], 'schema\n');
        expect(play.code).toBe(0);
        expect(play.stdout).toContain('items');
    });

    it.each(['pokemon-adventure.eskuelgame', 'pokemon-adventure-postgresql.eskuelgame'])('loads and executes package %s in both tools', async filename => {
        const path = resolve('spec/game-package/v1/examples', filename);
        const review = await runCli('eskuel-review', [path, '--json']);
        expect(review.code).toBe(0);
        expect(JSON.parse(review.stdout)).toMatchObject({ ok: true, packageInfo: { descriptor: { name: expect.any(String) } } });
        for (const mode of ['--index', '--summary']) {
            const compact = await runCli('eskuel-review', [path, mode, '--json']);
            expect(compact.code).toBe(0);
            const report = JSON.parse(compact.stdout);
            expect(report.ok).toBe(true);
            expect(report).not.toHaveProperty('packageInfo');
            expect(report.execution).toBe(mode === '--index' ? 'not-run' : 'tested');
        }
        const play = await runCli('eskuel-play', [path, '--json'], 'next\nsql SELECT * FROM students\nabout\n');
        expect(play.code).toBe(0);
        const replies = play.stdout.trim().split('\n').map(line => JSON.parse(line));
        expect(replies[2]).toMatchObject({ state: { finished: true }, results: [{ type: 'correct' }] });
        expect(replies[3]).toHaveProperty('packageInfo');
    }, 40_000);

    it('exports image contents as viewable files in both tools without dumping base64', async () => {
        const bytes = await readFile(resolve('public/favicon/game-console-32x32.png'));
        const game = createInventoryGame();
        game.scenes[1] = { type: 'image', mediaType: 'image/png', base64string: bytes.toString('base64') };
        const file = await saveGame('image', game);
        const play = await playBatch(file, ['next', 'look']);
        expect(play[0].state.scene).not.toHaveProperty('path');
        expect(play[1].state.scene.path).toBe(play[2].state.scene.path);
        expect(play[1].state.scene).not.toHaveProperty('base64string');
        const review = await runCli('eskuel-review', [file, '--inspect-only', '--json']);
        const report = JSON.parse(review.stdout);
        expect(report.scenes[1]).not.toHaveProperty('base64string');
        const paths = [play[1].state.scene.path, report.scenes[1].path] as string[];
        try {
            for (const path of paths) {
                expect(await readFile(path)).toEqual(bytes);
            }
        }
        finally {
            for (const path of paths) {
                await rm(dirname(path), { recursive: true, force: true });
            }
        }
    });

    it('rejects malformed XML and invalid scene numbers with machine-readable errors', async () => {
        const malformed = join(directory, 'malformed.xml');
        await writeFile(malformed, '<game>');
        for (const args of [[malformed, '--json'], [gameFile, '--scene', '999', '--json']]) {
            const result = await runCli('eskuel-review', args);
            expect(result.code).toBe(1);
            expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: expect.any(String) });
        }
    });

    it.each([
        ['--scenes', '0-2'],
        ['--scenes', '3-2'],
        ['--scenes', '1-999'],
        ['--scenes', '2.5-3'],
        ['--scenes', '2'],
        ['--scenes', '1-2-3'],
        ['--scenes', '1-9007199254740992'],
        ['--scene', '2', '--scenes', '2-3'],
        ['--index', '--summary'],
        ['--summary', '--inspect-only'],
    ])('rejects invalid review options %j', async (...args) => {
        const result = await runCli('eskuel-review', [gameFile, ...args, '--json']);
        expect(result.code).toBe(1);
        expect(result.stderr).toBe('');
        expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: expect.any(String) });
    });

    it('documents selective output in the executable help', async () => {
        const help = await runCli('eskuel-review', ['--help']);
        expect(help.code).toBe(0);
        for (const option of ['--index', '--scenes N-M', '--summary', '--inspect-only']) {
            expect(help.stdout).toContain(option);
        }
    });
});
