import { createInterface } from 'node:readline';
import { Effect } from 'effect';

import { GameConsoleSession } from '../src/apps/game-console/session';
import { GamePlayer } from '../src/apps/game-console/player';
import type { PlayerCommand } from '../src/apps/game-console/player';
import { cliAdapters, CliImages, errorMessage, jsonStringify, parseOptions, readGameFile, reportCliError } from './game-cli/common';
import { parsePlayCommand, PLAY_COMMAND_HELP } from './game-cli/play-command';

const USAGE = `Usage: eskuel-play <game.xml|game.eskuelgame> [--json] [--database <database-file>]

Play using the same SQL execution, progression, hints, and resets as the game console.
--database supplies a database for standalone XML without an embedded database.

${PLAY_COMMAND_HELP}`;

async function main(args: string[]): Promise<void> {
    const options = parseOptions(args, false);
    if (options.help) {
        process.stdout.write(USAGE);
    }
    else {
        const loaded = await readGameFile(options.filename, options.database);
        const session = new GameConsoleSession(loaded.source, undefined, cliAdapters(new URL('./game-database-worker.mjs', import.meta.url)));
        try {
            await Effect.runPromise(session.resolve());
            await play(session, options.json === true);
        }
        finally {
            session.dispose();
        }
    }
}

async function play(session: GameConsoleSession, json: boolean): Promise<void> {
    const player = new GamePlayer(session);
    const images = new CliImages();
    const interactive = Boolean(process.stdin.isTTY) && !json;

    const writeReply = async (command: string, reply: Awaited<ReturnType<GamePlayer['execute']>>) => {
        const scene = reply.state.scene;
        const state = {
            ...reply.state,
            scene: scene.type === 'image' ? await images.export(scene) : scene,
        };
        if (json) {
            process.stdout.write(`${jsonStringify({ ok: true, command, ...reply, state })}\n`);
        }
        else {
            const { state: _state, results, ...details } = reply;
            if (Object.keys(details).length > 0) {
                process.stdout.write(`${jsonStringify(details, true)}\n`);
            }
            for (const result of results) {
                process.stdout.write(`${jsonStringify(result, true)}\n`);
            }
            process.stdout.write(`\n${state.title} — Scene ${state.sceneNumber}/${state.sceneCount} (${state.status})\n`);
            process.stdout.write(`${state.scene.type === 'image' ? `Image: ${state.scene.path}` : state.scene.text}\n`);
            if (state.sqlPlaceholder !== '') {
                process.stdout.write(`SQL placeholder: ${state.sqlPlaceholder}\n`);
            }
            for (const hint of state.revealedHints) {
                process.stdout.write(`Hint: ${hint}\n`);
            }
            process.stdout.write(`Solved: ${state.solvedTasks}/${state.taskCount}; skipped: ${state.skippedTasks}; finished: ${state.finished}\n`);
            process.stdout.write(`Available: ${state.availableCommands.join(', ')}\n`);
        }
    };

    await writeReply('look', await player.execute({ command: 'look' }));
    const input = createInterface({ input: process.stdin, output: process.stderr, terminal: interactive });
    const queue: string[] = [];
    let processing = false;
    let activeOperation: Promise<void> | null = null;
    let closed = false;
    let quitting = false;
    let complete!: () => void;
    const completion = new Promise<void>(resolve => { complete = resolve; });
    const prompt = () => {
        if (interactive && !closed && !processing) {
            input.setPrompt('eskuel> ');
            input.prompt();
        }
    };
    const finish = () => {
        if (closed && !processing && queue.length === 0) {
            complete();
        }
    };
    const writeError = (error: unknown) => {
        if (json) {
            process.stdout.write(`${jsonStringify({ ok: false, error: errorMessage(error) })}\n`);
        }
        else {
            process.stderr.write(`Error: ${errorMessage(error)}\n`);
        }
    };
    const run = async (request: PlayerCommand) => {
        if (request.command === 'quit') {
            quitting = true;
            queue.length = 0;
            input.close();
        }
        else {
            const reply = await player.execute(request);
            if (request.command === 'help') {
                if (json) {
                    Object.assign(reply, { help: PLAY_COMMAND_HELP });
                }
                else {
                    process.stdout.write(PLAY_COMMAND_HELP);
                }
            }
            await writeReply(request.command, reply);
        }
    };
    const drain = async () => {
        if (!processing) {
            processing = true;
            try {
                while (queue.length > 0 && !quitting) {
                    const line = queue.shift()!;
                    try {
                        activeOperation = run(parsePlayCommand(line));
                        await activeOperation;
                    }
                    catch (error: unknown) {
                        writeError(error);
                        if (session.getSnapshot().kind === 'failed') {
                            process.exitCode = 1;
                            quitting = true;
                            queue.length = 0;
                            input.close();
                        }
                    }
                    finally {
                        activeOperation = null;
                    }
                }
            }
            finally {
                processing = false;
                finish();
                prompt();
            }
        }
    };
    const cancel = async (request: PlayerCommand) => {
        const snapshot = session.getSnapshot();
        if (activeOperation !== null && snapshot.kind === 'ready' && snapshot.commandStatus.kind === 'idle') {
            // A piped cancel can arrive while dispatch is still resolving its cached initialization.
            let started!: () => void;
            const start = new Promise<void>(resolve => { started = resolve; });
            const unsubscribe = session.subscribe(() => {
                const current = session.getSnapshot();
                if (current.kind !== 'ready' || current.commandStatus.kind !== 'idle') {
                    started();
                }
            });
            try {
                await Promise.race([start, activeOperation.catch(() => undefined)]);
            }
            finally {
                unsubscribe();
            }
        }
        await run(request);
    };
    const interrupt = () => {
        if (player.availableCommands().includes('cancel')) {
            session.cancelRunningCommand();
        }
        else {
            quitting = true;
            queue.length = 0;
            process.exitCode = 130;
            session.dispose();
            input.close();
        }
    };
    input.on('line', line => {
        if (line.trim() !== '' && !quitting) {
            try {
                const request = parsePlayCommand(line);
                if (request.command === 'cancel' && processing) {
                    void cancel(request).catch(writeError);
                }
                else {
                    queue.push(line);
                    void drain();
                }
            }
            catch (error: unknown) {
                writeError(error);
                prompt();
            }
        }
        else if (!quitting) {
            prompt();
        }
    });
    input.on('close', () => { closed = true; finish(); });
    input.on('SIGINT', interrupt);
    process.on('SIGINT', interrupt);
    prompt();
    try {
        await completion;
    }
    finally {
        process.off('SIGINT', interrupt);
        input.close();
    }
}

void main(process.argv.slice(2)).catch(error => reportCliError(error, process.argv.includes('--json')));
