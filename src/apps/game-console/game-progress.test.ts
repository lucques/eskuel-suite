import { describe, expect, it } from 'vitest';

import { Game } from '../../game/model';
import type { ManipulateScene } from '../../game/model';
import {
    createReplayEffects,
    getSolvedTaskCount,
    getTaskCount,
    isFinished,
    isGameProgressCompatible,
    isInitialGameProgress,
    type GameProgress,
    transitionToNextScene,
    transitionToPreviousScene,
    transitionToResetSolutionHint,
    transitionToSkippedScene,
    transitionToSolvedScene,
    transitionToSolutionHintedScene,
} from './game-progress';

const manipulateScene = (name: string): ManipulateScene => ({
    type: 'manipulate',
    text: name,
    sqlSol: `UPDATE ${name}`,
    sqlCheck: `SELECT ${name}`,
    sqlPlaceholder: '',
    ordinaryHints: [],
    hasSolHint: false,
});

const createGame = () => new Game(
    'Transitions',
    '',
    '',
    null,
    [
        { type: 'text', text: 'Introduction' },
        manipulateScene('first'),
        manipulateScene('second'),
        { type: 'text', text: 'Finished' },
    ],
);

describe('game progress transitions', () => {
    it('counts solved and total tasks for the finished status', () => {
        const game = createGame();
        const progress: GameProgress = {
            curSceneIndex: 3,
            sceneStatuses: ['nontask-seen', 'task-solved-by-sol-hint', 'task-solved-by-user', 'nontask-unseen'],
        };

        expect(getSolvedTaskCount(progress)).toBe(2);
        expect(getTaskCount(game)).toBe(2);
    });

    it('finishes on the last scene unless its task is unsolved', () => {
        const game = createGame();

        expect(isFinished(game, {
            curSceneIndex: 2,
            sceneStatuses: ['nontask-seen', 'task-solved-by-user', 'task-solved-by-user', 'nontask-unseen'],
        })).toBe(false);
        expect(isFinished(game, {
            curSceneIndex: 3,
            sceneStatuses: ['nontask-seen', 'task-solved-by-user', 'task-solved-by-user', 'nontask-unseen'],
        })).toBe(true);

        const gameEndingWithTask = new Game(
            'Task ending',
            '',
            '',
            null,
            [manipulateScene('last')],
        );

        expect(isFinished(gameEndingWithTask, {
            curSceneIndex: 0,
            sceneStatuses: ['task-solved-by-user'],
        })).toBe(true);
        expect(isFinished(gameEndingWithTask, {
            curSceneIndex: 0,
            sceneStatuses: ['task-solved-by-sol-hint'],
        })).toBe(true);
        expect(isFinished(gameEndingWithTask, {
            curSceneIndex: 0,
            sceneStatuses: ['task-unsolved'],
        })).toBe(false);
        expect(isFinished(gameEndingWithTask, {
            curSceneIndex: 0,
            sceneStatuses: ['task-skipped'],
        })).toBe(true);
    });

    it('keeps a skipped final task as the current scene and finishes the game', () => {
        const game = new Game(
            'Task ending',
            '',
            '',
            null,
            [manipulateScene('last')],
        );

        const transition = transitionToSkippedScene(game, {
            curSceneIndex: 0,
            sceneStatuses: ['task-unsolved'],
        });

        expect(transition).toEqual({
            progress: {
                curSceneIndex: 0,
                sceneStatuses: ['task-skipped'],
            },
            effects: [],
        });
        expect(isFinished(game, transition.progress)).toBe(true);

        const retryTransition = transitionToPreviousScene(game, transition.progress);
        expect(retryTransition).toEqual({
            progress: {
                curSceneIndex: 0,
                sceneStatuses: ['task-unsolved'],
            },
            effects: [],
        });
        expect(isFinished(game, retryTransition.progress)).toBe(false);
    });

    it('marks a non-task scene as seen before advancing', () => {
        const transition = transitionToNextScene(createGame(), {
            curSceneIndex: 0,
            sceneStatuses: ['nontask-unseen', 'task-unsolved', 'task-unsolved', 'nontask-unseen'],
        });

        expect(transition).toEqual({
            progress: {
                curSceneIndex: 1,
                sceneStatuses: ['nontask-seen', 'task-unsolved', 'task-unsolved', 'nontask-unseen'],
            },
            effects: [
                { type: 'apply-scene-solution', database: 'reference', sceneIndex: 1 },
            ],
        });
    });

    it('produces the database effects required when a manipulate scene is skipped', () => {
        const transition = transitionToSkippedScene(createGame(), {
            curSceneIndex: 1,
            sceneStatuses: ['nontask-seen', 'task-unsolved', 'task-unsolved', 'nontask-unseen'],
        });

        expect(transition).toEqual({
            progress: {
                curSceneIndex: 2,
                sceneStatuses: ['nontask-seen', 'task-skipped', 'task-unsolved', 'nontask-unseen'],
            },
            effects: [
                { type: 'apply-scene-solution', database: 'user', sceneIndex: 1 },
                { type: 'apply-scene-solution', database: 'reference', sceneIndex: 2 },
            ],
        });
    });

    it('does not reapply the current manipulate solution after the user solved it', () => {
        const transition = transitionToSolvedScene(createGame(), {
            curSceneIndex: 1,
            sceneStatuses: ['nontask-seen', 'task-unsolved', 'task-unsolved', 'nontask-unseen'],
        });

        expect(transition.effects).toEqual([
            { type: 'apply-scene-solution', database: 'reference', sceneIndex: 2 },
        ]);
        expect(transition.progress.sceneStatuses[1]).toBe('task-solved-by-user');
    });

    it('marks a solution-hinted task without advancing and applies its solution on manual advance', () => {
        const game = createGame();
        const hintedTransition = transitionToSolutionHintedScene(game, {
            curSceneIndex: 1,
            sceneStatuses: ['nontask-seen', 'task-unsolved', 'task-unsolved', 'nontask-unseen'],
        });

        expect(hintedTransition).toEqual({
            progress: {
                curSceneIndex: 1,
                sceneStatuses: ['nontask-seen', 'task-solved-by-sol-hint', 'task-unsolved', 'nontask-unseen'],
            },
            effects: [],
        });

        const nextTransition = transitionToNextScene(game, hintedTransition.progress);
        expect(nextTransition.effects).toEqual([
            { type: 'apply-scene-solution', database: 'user', sceneIndex: 1 },
            { type: 'apply-scene-solution', database: 'reference', sceneIndex: 2 },
        ]);
    });

    it('resets a solution-hinted task to unsolved without progress effects', () => {
        const transition = transitionToResetSolutionHint(createGame(), {
            curSceneIndex: 1,
            sceneStatuses: ['nontask-seen', 'task-solved-by-sol-hint', 'task-unsolved', 'nontask-unseen'],
        });

        expect(transition).toEqual({
            progress: {
                curSceneIndex: 1,
                sceneStatuses: ['nontask-seen', 'task-unsolved', 'task-unsolved', 'nontask-unseen'],
            },
            effects: [],
        });
    });

    it('turns a skipped task back into an unsolved task when navigating back', () => {
        const transition = transitionToPreviousScene(createGame(), {
            curSceneIndex: 2,
            sceneStatuses: ['nontask-seen', 'task-skipped', 'task-unsolved', 'nontask-unseen'],
        });

        expect(transition.progress).toEqual({
            curSceneIndex: 1,
            sceneStatuses: ['nontask-seen', 'task-unsolved', 'task-unsolved', 'nontask-unseen'],
        });
    });

    it('moves back normally when the current skipped task is not the last scene', () => {
        const transition = transitionToPreviousScene(createGame(), {
            curSceneIndex: 2,
            sceneStatuses: ['nontask-seen', 'task-solved-by-user', 'task-skipped', 'nontask-unseen'],
        });

        expect(transition.progress).toEqual({
            curSceneIndex: 1,
            sceneStatuses: ['nontask-seen', 'task-solved-by-user', 'task-skipped', 'nontask-unseen'],
        });
    });

    it('creates the same database replay plan from persisted progress', () => {
        const effects = createReplayEffects(createGame(), {
            curSceneIndex: 2,
            sceneStatuses: ['nontask-seen', 'task-skipped', 'task-unsolved', 'nontask-unseen'],
        });

        expect(effects).toEqual([
            { type: 'apply-scene-solution', database: 'reference', sceneIndex: 1 },
            { type: 'apply-scene-solution', database: 'user', sceneIndex: 1 },
            { type: 'apply-scene-solution', database: 'reference', sceneIndex: 2 },
        ]);
    });

    it('replays a solution-hinted manipulation like a user-solved manipulation', () => {
        const effects = createReplayEffects(createGame(), {
            curSceneIndex: 2,
            sceneStatuses: ['nontask-seen', 'task-solved-by-sol-hint', 'task-unsolved', 'nontask-unseen'],
        });

        expect(effects).toEqual([
            { type: 'apply-scene-solution', database: 'reference', sceneIndex: 1 },
            { type: 'apply-scene-solution', database: 'user', sceneIndex: 1 },
            { type: 'apply-scene-solution', database: 'reference', sceneIndex: 2 },
        ]);
    });

    it('accepts structurally and semantically compatible persisted progress', () => {
        expect(isGameProgressCompatible(createGame(), {
            curSceneIndex: 2,
            sceneStatuses: ['nontask-seen', 'task-solved-by-user', 'task-unsolved', 'nontask-unseen'],
        })).toBe(true);
    });

    it.each([
        {
            name: 'an out-of-bounds current scene',
            progress: {
                curSceneIndex: 4,
                sceneStatuses: ['nontask-seen', 'task-solved-by-user', 'task-unsolved', 'nontask-unseen'],
            },
        },
        {
            name: 'a task status on a non-task scene',
            progress: {
                curSceneIndex: 2,
                sceneStatuses: ['task-solved-by-user', 'task-solved-by-user', 'task-unsolved', 'nontask-unseen'],
            },
        },
        {
            name: 'an unseen scene before the current scene',
            progress: {
                curSceneIndex: 2,
                sceneStatuses: ['nontask-unseen', 'task-solved-by-user', 'task-unsolved', 'nontask-unseen'],
            },
        },
    ] satisfies { name: string, progress: GameProgress }[])('rejects $name', ({ progress }) => {
        expect(isGameProgressCompatible(createGame(), progress)).toBe(false);
    });

    it('recognizes only the exact initial progress', () => {
        const game = createGame();

        expect(isInitialGameProgress(game, {
            curSceneIndex: 0,
            sceneStatuses: ['nontask-unseen', 'task-unsolved', 'task-unsolved', 'nontask-unseen'],
        })).toBe(true);
        expect(isInitialGameProgress(game, {
            curSceneIndex: 0,
            sceneStatuses: ['nontask-seen', 'task-unsolved', 'task-unsolved', 'nontask-unseen'],
        })).toBe(false);
    });
});
