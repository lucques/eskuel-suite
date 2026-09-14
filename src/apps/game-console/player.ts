import { Effect } from 'effect';

import type { GameConsoleCommand, GameConsoleSession, GameConsoleSessionSnapshot, ResultEntry } from './session';
import { isGameSessionCommandCancellable } from './session';
import {
    getCurScene, getCurSceneStatus, getSkippedTaskCount, getSolvedTaskCount, getTaskCount,
    hasNextScene, isCurSceneUnsolvedTask, isFinished,
} from './game-progress';
import { createOrdinaryHintViewState, getHintControls, revealNextOrdinaryHint } from './hints';

export const playerCommands = [
    'look', 'schema', 'results', 'about', 'next', 'previous', 'skip', 'hint', 'solution',
    'reset-hints', 'reset-db', 'restart', 'cancel', 'help', 'quit', 'sql', 'remove-result',
] as const;

export type PlayerCommandName = typeof playerCommands[number];
export type PlayerCommand =
    | { command: Exclude<PlayerCommandName, 'sql' | 'remove-result'> }
    | { command: 'sql', sql: string }
    | { command: 'remove-result', id: number };

// Expected SELECT results are visible in the console; their generating SQL is not.
export function getPlayerResult(entry: ResultEntry) {
    switch (entry.type) {
        case 'ordinary-hint-select': {
            const { sql: _sql, ...expectedResult } = entry.expectedResult;
            return { ...entry, expectedResult };
        }
        case 'database-reset-notice':
        case 'correct':
        case 'miss':
        case 'sql':
        case 'sample-sol':
        case 'sol-hint':
        case 'ordinary-hint-manipulate':
            return entry;
        default: { const _n: never = entry; return _n; }
    }
}

/** Player-visible projection and controls, without exposing the underlying game document. */
export class GamePlayer {
    private hints = createOrdinaryHintViewState(0);

    constructor(readonly session: GameConsoleSession) {}

    private ready(): Extract<GameConsoleSessionSnapshot, { kind: 'ready' }> {
        const snapshot = this.session.getSnapshot();
        if (snapshot.kind === 'ready') {
            if (this.hints.sceneIndex !== snapshot.progress.curSceneIndex) {
                this.hints = createOrdinaryHintViewState(snapshot.progress.curSceneIndex);
            }
            return snapshot;
        }
        else if (snapshot.kind === 'failed') {
            throw new Error(JSON.stringify(snapshot.error));
        }
        else if (snapshot.kind === 'loading') {
            throw new Error('The game is still loading');
        }
        else { const _n: never = snapshot; return _n; }
    }

    availableCommands(): PlayerCommandName[] {
        const { game, progress, commandStatus, results } = this.ready();
        const commands: PlayerCommandName[] = ['look', 'schema', 'results', 'about', 'help', 'quit'];
        if (results.length > 0) {
            commands.push('remove-result');
        }
        if (commandStatus.kind === 'running') {
            if (isGameSessionCommandCancellable(commandStatus.command)) {
                commands.push('cancel');
            }
        }
        else if (commandStatus.kind === 'rebuilding-after-cancellation') {
            // The browser also blocks further mutations during reconstruction.
        }
        else if (commandStatus.kind === 'idle') {
            commands.push('sql', 'reset-db', 'restart');
            const status = getCurSceneStatus(progress);
            if (progress.curSceneIndex > 0 || (status === 'task-skipped' && !hasNextScene(game, progress))) {
                commands.push('previous');
            }
            if (hasNextScene(game, progress) && !isCurSceneUnsolvedTask(game, progress)) {
                commands.push('next');
            }
            if (status === 'task-unsolved') {
                commands.push('skip');
            }
            const controls = getHintControls(getCurScene(game, progress), status, this.hints);
            if (status === 'task-solved-by-user') {
                commands.push('solution');
            }
            else if (!isFinished(game, progress)) {
                if (controls.showOrdinaryHintButton && !controls.ordinaryHintDisabled) {
                    commands.push('hint');
                }
                if (controls.showSolutionHintButton && !controls.solutionHintDisabled) {
                    commands.push('solution');
                }
                if (controls.showResetHintsButton) {
                    commands.push('reset-hints');
                }
            }
        }
        else { const _n: never = commandStatus; return _n; }
        return commands;
    }

    getView() {
        const { game, progress, commandStatus } = this.ready();
        const scene = getCurScene(game, progress);
        const finished = isFinished(game, progress);
        // Deliberately enumerate visible fields. A raw session snapshot contains all solutions and future scenes.
        const content = scene.type === 'image'
            ? { type: scene.type, mediaType: scene.mediaType, base64string: scene.base64string }
            : { type: scene.type, text: scene.text };
        return {
            title: game.title,
            databaseSystem: game.dbSystem,
            sceneNumber: progress.curSceneIndex + 1,
            sceneCount: game.scenes.length,
            scene: content,
            status: getCurSceneStatus(progress),
            finished,
            solvedTasks: getSolvedTaskCount(progress),
            skippedTasks: getSkippedTaskCount(progress),
            taskCount: getTaskCount(game),
            sqlPlaceholder: scene.type === 'select' || scene.type === 'manipulate' ? scene.sqlPlaceholder : '',
            revealedHints: finished ? [] : [...this.hints.revealedOrdinaryTextHints],
            commandStatus: commandStatus.kind,
            availableCommands: this.availableCommands(),
        };
    }

    async execute(request: PlayerCommand) {
        const before = this.ready();
        if (!this.availableCommands().includes(request.command)) {
            throw new Error(`'${request.command}' is unavailable here. Available commands: ${this.availableCommands().join(', ')}`);
        }
        else {
            const previousResultId = before.results[0]?.id ?? -1;
            let command: GameConsoleCommand | null = null;
            let detail: object = {};
            switch (request.command) {
                case 'look':
                case 'help':
                case 'quit':
                    break;
                case 'schema':
                    detail = { schema: before.schemaStatus };
                    break;
                case 'about':
                    detail = {
                        title: before.game.title, teaser: before.game.teaser, copyright: before.game.copyright,
                        packageInfo: before.packageInfo,
                    };
                    break;
                case 'results':
                    break;
                case 'sql':
                    command = { type: 'submit-sql', sql: request.sql };
                    break;
                case 'next':
                    command = { type: 'next-scene', origin: 'navbar' };
                    break;
                case 'previous':
                    command = { type: 'previous-scene' };
                    break;
                case 'skip':
                    command = { type: 'skip-scene' };
                    break;
                case 'reset-db':
                    command = { type: 'reset-db-in-current-scene' };
                    break;
                case 'restart':
                    this.hints = createOrdinaryHintViewState(0);
                    command = { type: 'restart' };
                    break;
                case 'hint': {
                    const scene = getCurScene(before.game, before.progress);
                    const controls = getHintControls(scene, getCurSceneStatus(before.progress), this.hints);
                    const hint = controls.taskScene?.ordinaryHints[this.hints.nextOrdinaryHintIndex];
                    this.hints = revealNextOrdinaryHint(scene, this.hints);
                    if (hint?.type === 'expected-result') {
                        command = { type: 'show-ordinary-hint' };
                    }
                    break;
                }
                case 'solution':
                    command = { type: getCurSceneStatus(before.progress) === 'task-solved-by-user'
                        ? 'show-solution' : 'show-solution-hint' };
                    break;
                case 'reset-hints':
                    this.hints = createOrdinaryHintViewState(before.progress.curSceneIndex);
                    if (getCurSceneStatus(before.progress) === 'task-solved-by-sol-hint') {
                        command = { type: 'reset-solution-hint' };
                    }
                    break;
                case 'remove-result':
                    if (!before.results.some(result => result.id === request.id)) {
                        throw new Error(`No result with id ${request.id}`);
                    }
                    else {
                        this.session.removeResult(request.id);
                    }
                    break;
                case 'cancel':
                    this.session.cancelRunningCommand();
                    break;
                default: { const _n: never = request; return _n; }
            }
            if (command !== null) {
                await Effect.runPromise(this.session.dispatch(command));
            }
            const after = this.ready();
            return {
                ...detail,
                state: this.getView(),
                results: after.results
                    .filter(result => request.command === 'results' || result.id > previousResultId)
                    .map(getPlayerResult),
            };
        }
    }
}
