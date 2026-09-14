import type { Game, Scene } from '../../game/model';

export type SceneStatus = 'task-unsolved' | 'task-solved-by-user' | 'task-solved-by-sol-hint' | 'task-skipped' | 'nontask-unseen' | 'nontask-seen';

// Captures: "Where is the player in the game?"
export type GameProgress = {
    curSceneIndex: number,
    sceneStatuses: SceneStatus[],
};

export type GameProgressEffect = {
    type: 'apply-scene-solution',
    database: 'user' | 'reference',
    sceneIndex: number,
};

export type GameProgressTransition = {
    progress: GameProgress,
    effects: GameProgressEffect[],
};

export const createInitialSceneStatuses = (game: Game): SceneStatus[] => {
    return game.scenes.map(scene => {
        switch (scene.type) {
            case 'text':
            case 'image':
                return 'nontask-unseen';
            case 'select':
            case 'manipulate':
                return 'task-unsolved';
            default: {
                const _n: never = scene;
                return _n;
            }
        }
    });
};

export const getCurScene = (game: Game, progress: GameProgress): Scene => {
    return game.scenes[progress.curSceneIndex];
};

export const getCurSceneStatus = (progress: GameProgress): SceneStatus => {
    return progress.sceneStatuses[progress.curSceneIndex];
};

export const isCurSceneTask = (game: Game, progress: GameProgress): boolean => {
    const scene = getCurScene(game, progress);

    if (scene.type === 'text' || scene.type === 'image') {
        return false;
    }
    else if (scene.type === 'select' || scene.type === 'manipulate') {
        return true;
    }
    else {
        const _n: never = scene;
        return _n;
    }
};

export const isCurSceneUnsolvedTask = (game: Game, progress: GameProgress): boolean => {
    if (!isCurSceneTask(game, progress)) {
        return false;
    }

    const sceneStatus = getCurSceneStatus(progress);
    switch (sceneStatus) {
        case 'task-unsolved':
        case 'task-skipped':
            return true;
        case 'task-solved-by-user':
        case 'task-solved-by-sol-hint':
            return false;
        case 'nontask-unseen':
        case 'nontask-seen':
            throw new Error('A task scene must have a task scene status');
        default: {
            const _n: never = sceneStatus;
            return _n;
        }
    }
};

export const hasNextScene = (game: Game, progress: GameProgress): boolean => {
    return progress.curSceneIndex + 1 < game.scenes.length;
};

export const isFinished = (game: Game, progress: GameProgress): boolean => {
    if (hasNextScene(game, progress)) {
        return false;
    }

    const sceneStatus = getCurSceneStatus(progress);
    switch (sceneStatus) {
        case 'task-unsolved':
            return false;
        case 'task-solved-by-user':
        case 'task-solved-by-sol-hint':
        case 'task-skipped':
        case 'nontask-unseen':
        case 'nontask-seen':
            return true;
        default: {
            const _n: never = sceneStatus;
            return _n;
        }
    }
};

export const getSkippedTaskCount = (progress: GameProgress): number => {
    return progress.sceneStatuses.filter(sceneStatus => sceneStatus === 'task-skipped').length;
};

export const getSolvedTaskCount = (progress: GameProgress): number => {
    return progress.sceneStatuses.filter(sceneStatus => (
        sceneStatus === 'task-solved-by-user'
        || sceneStatus === 'task-solved-by-sol-hint'
    )).length;
};

export const getTaskCount = (game: Game): number => {
    return game.scenes.filter(scene => {
        switch (scene.type) {
            case 'text':
            case 'image':
                return false;
            case 'select':
            case 'manipulate':
                return true;
            default: { const _n: never = scene; return _n; }
        }
    }).length;
};

export const transitionToPreviousScene = (game: Game, progress: GameProgress): GameProgressTransition => {
    assertProgress(game, progress);

    const nextProgress = copyProgress(progress);
    if (!hasNextScene(game, nextProgress) && getCurSceneStatus(nextProgress) === 'task-skipped') {
        nextProgress.sceneStatuses[nextProgress.curSceneIndex] = 'task-unsolved';
        return { progress: nextProgress, effects: [] };
    }

    if (progress.curSceneIndex === 0) {
        throw new Error('There is no previous scene');
    }

    nextProgress.curSceneIndex -= 1;

    if (getCurSceneStatus(nextProgress) === 'task-skipped') {
        nextProgress.sceneStatuses[nextProgress.curSceneIndex] = 'task-unsolved';
    }

    return { progress: nextProgress, effects: [] };
};

export const transitionToNextScene = (game: Game, progress: GameProgress): GameProgressTransition => {
    assertProgress(game, progress);

    if (!hasNextScene(game, progress)) {
        throw new Error('There is no next scene');
    }

    const nextProgress = copyProgress(progress);
    const sceneStatus = getCurSceneStatus(nextProgress);

    switch (sceneStatus) {
        case 'task-solved-by-user':
        case 'task-solved-by-sol-hint':
        case 'nontask-seen':
            break;
        case 'nontask-unseen':
            nextProgress.sceneStatuses[nextProgress.curSceneIndex] = 'nontask-seen';
            break;
        case 'task-unsolved':
        case 'task-skipped':
            throw new Error('Cannot advance from a non-solved task');
        default: {
            const _n: never = sceneStatus;
            return _n;
        }
    }

    return advanceToNextScene(game, nextProgress);
};

export const transitionToSkippedScene = (game: Game, progress: GameProgress): GameProgressTransition => {
    assertProgress(game, progress);

    const nextProgress = copyProgress(progress);
    const sceneStatus = getCurSceneStatus(nextProgress);

    switch (sceneStatus) {
        case 'task-unsolved':
        case 'task-skipped':
            nextProgress.sceneStatuses[nextProgress.curSceneIndex] = 'task-skipped';
            break;
        case 'task-solved-by-user':
        case 'task-solved-by-sol-hint':
        case 'nontask-unseen':
        case 'nontask-seen':
            throw new Error('Only a non-solved task can be skipped');
        default: {
            const _n: never = sceneStatus;
            return _n;
        }
    }

    return hasNextScene(game, nextProgress)
        ? advanceToNextScene(game, nextProgress)
        : { progress: nextProgress, effects: [] };
};

export const transitionToSolvedScene = (game: Game, progress: GameProgress): GameProgressTransition => {
    assertProgress(game, progress);

    const nextProgress = copyProgress(progress);
    const sceneStatus = getCurSceneStatus(nextProgress);

    switch (sceneStatus) {
        case 'task-unsolved':
        case 'task-skipped':
            nextProgress.sceneStatuses[nextProgress.curSceneIndex] = 'task-solved-by-user';
            break;
        case 'task-solved-by-user':
        case 'task-solved-by-sol-hint':
        case 'nontask-unseen':
        case 'nontask-seen':
            throw new Error('Current scene is not a non-solved task');
        default: {
            const _n: never = sceneStatus;
            return _n;
        }
    }

    return hasNextScene(game, nextProgress)
        ? advanceToNextScene(game, nextProgress)
        : { progress: nextProgress, effects: [] };
};

export const transitionToSolutionHintedScene = (game: Game, progress: GameProgress): GameProgressTransition => {
    assertProgress(game, progress);

    const nextProgress = copyProgress(progress);
    const sceneStatus = getCurSceneStatus(nextProgress);
    switch (sceneStatus) {
        case 'task-unsolved':
        case 'task-skipped':
            nextProgress.sceneStatuses[nextProgress.curSceneIndex] = 'task-solved-by-sol-hint';
            return { progress: nextProgress, effects: [] };
        case 'task-solved-by-user':
        case 'task-solved-by-sol-hint':
        case 'nontask-unseen':
        case 'nontask-seen':
            throw new Error('Current scene is not a non-solved task');
        default: { const _n: never = sceneStatus; return _n; }
    }
};

export const transitionToResetSolutionHint = (game: Game, progress: GameProgress): GameProgressTransition => {
    assertProgress(game, progress);

    const nextProgress = copyProgress(progress);
    const sceneStatus = getCurSceneStatus(nextProgress);
    switch (sceneStatus) {
        case 'task-solved-by-sol-hint':
            nextProgress.sceneStatuses[nextProgress.curSceneIndex] = 'task-unsolved';
            return { progress: nextProgress, effects: [] };
        case 'task-unsolved':
        case 'task-solved-by-user':
        case 'task-skipped':
        case 'nontask-unseen':
        case 'nontask-seen':
            throw new Error('Current scene was not solved by a solution hint');
        default: { const _n: never = sceneStatus; return _n; }
    }
};

export const createReplayEffects = (game: Game, progress: GameProgress): GameProgressEffect[] => {
    assertProgress(game, progress);

    const effects: GameProgressEffect[] = [];

    for (let sceneIndex = 0; sceneIndex <= progress.curSceneIndex; sceneIndex++) {
        const scene = game.scenes[sceneIndex];
        const sceneStatus = progress.sceneStatuses[sceneIndex];

        switch (scene.type) {
            case 'text':
            case 'image':
                switch (sceneStatus) {
                    case 'nontask-unseen':
                        if (sceneIndex !== progress.curSceneIndex) {
                            throw new Error('Cannot navigate past an unseen non-task scene');
                        }
                        break;
                    case 'nontask-seen':
                        break;
                    case 'task-unsolved':
                    case 'task-solved-by-user':
                    case 'task-solved-by-sol-hint':
                    case 'task-skipped':
                        throw new Error('A non-task scene must have a non-task scene status');
                    default: {
                        const _n: never = sceneStatus;
                        return _n;
                    }
                }
                break;
            case 'select':
                validateTaskStatus(sceneStatus, sceneIndex, progress.curSceneIndex);
                break;
            case 'manipulate':
                effects.push({
                    type: 'apply-scene-solution',
                    database: 'reference',
                    sceneIndex,
                });

                validateTaskStatus(sceneStatus, sceneIndex, progress.curSceneIndex);

                if (sceneStatus === 'task-solved-by-user'
                    || sceneStatus === 'task-solved-by-sol-hint'
                    || (sceneStatus === 'task-skipped' && sceneIndex < progress.curSceneIndex)) {
                    effects.push({
                        type: 'apply-scene-solution',
                        database: 'user',
                        sceneIndex,
                    });
                }
                break;
            default: {
                const _n: never = scene;
                return _n;
            }
        }
    }

    return effects;
};

export const isGameProgressCompatible = (game: Game, progress: GameProgress): boolean => {
    try {
        assertProgress(game, progress);
        for (let sceneIndex = 0; sceneIndex < game.scenes.length; sceneIndex++) {
            const scene = game.scenes[sceneIndex];
            const sceneStatus = progress.sceneStatuses[sceneIndex];
            switch (scene.type) {
                case 'text':
                case 'image':
                    if (sceneStatus !== 'nontask-unseen' && sceneStatus !== 'nontask-seen') {
                        return false;
                    }
                    break;
                case 'select':
                case 'manipulate':
                    if (sceneStatus !== 'task-unsolved'
                        && sceneStatus !== 'task-solved-by-user'
                        && sceneStatus !== 'task-solved-by-sol-hint'
                        && sceneStatus !== 'task-skipped') {
                        return false;
                    }
                    break;
                default: { const _n: never = scene; return _n; }
            }
        }

        createReplayEffects(game, progress);
        return true;
    }
    catch (_error: unknown) {
        return false;
    }
};

export const isInitialGameProgress = (game: Game, progress: GameProgress): boolean => {
    const initialSceneStatuses = createInitialSceneStatuses(game);
    return progress.curSceneIndex === 0
        && progress.sceneStatuses.length === initialSceneStatuses.length
        && progress.sceneStatuses.every((status, index) => status === initialSceneStatuses[index]);
};

const advanceToNextScene = (game: Game, progress: GameProgress): GameProgressTransition => {
    if (!hasNextScene(game, progress)) {
        throw new Error('There is no next scene');
    }

    const effects: GameProgressEffect[] = [];
    const currentScene = getCurScene(game, progress);

    const currentSceneStatus = getCurSceneStatus(progress);
    if (currentScene.type === 'manipulate'
        && (isCurSceneUnsolvedTask(game, progress) || currentSceneStatus === 'task-solved-by-sol-hint')) {
        effects.push({
            type: 'apply-scene-solution',
            database: 'user',
            sceneIndex: progress.curSceneIndex,
        });
    }

    const nextProgress = copyProgress(progress);
    nextProgress.curSceneIndex += 1;

    const nextScene = getCurScene(game, nextProgress);
    if (nextScene.type === 'manipulate') {
        effects.push({
            type: 'apply-scene-solution',
            database: 'reference',
            sceneIndex: nextProgress.curSceneIndex,
        });

        const nextSceneStatus = getCurSceneStatus(nextProgress);
        switch (nextSceneStatus) {
            case 'task-solved-by-user':
            case 'task-solved-by-sol-hint':
                effects.push({
                    type: 'apply-scene-solution',
                    database: 'user',
                    sceneIndex: nextProgress.curSceneIndex,
                });
                break;
            case 'task-unsolved':
            case 'task-skipped':
                break;
            case 'nontask-unseen':
            case 'nontask-seen':
                throw new Error('A manipulate scene must have a task scene status');
            default: {
                const _n: never = nextSceneStatus;
                return _n;
            }
        }
    }

    return { progress: nextProgress, effects };
};

const validateTaskStatus = (sceneStatus: SceneStatus, sceneIndex: number, curSceneIndex: number): void => {
    switch (sceneStatus) {
        case 'task-unsolved':
            if (sceneIndex !== curSceneIndex) {
                throw new Error('Cannot navigate past an unsolved task');
            }
            break;
        case 'task-solved-by-user':
        case 'task-solved-by-sol-hint':
        case 'task-skipped':
            break;
        case 'nontask-unseen':
        case 'nontask-seen':
            throw new Error('A task scene must have a task scene status');
        default: {
            const _n: never = sceneStatus;
            return _n;
        }
    }
};

const assertProgress = (game: Game, progress: GameProgress): void => {
    if (!Number.isSafeInteger(progress.curSceneIndex)
        || progress.curSceneIndex < 0
        || progress.curSceneIndex >= game.scenes.length) {
        throw new Error('Scene index is out of bounds');
    }
    if (progress.sceneStatuses.length !== game.scenes.length) {
        throw new Error('Each scene must have a scene status entry');
    }
};

const copyProgress = (progress: GameProgress): GameProgress => ({
    curSceneIndex: progress.curSceneIndex,
    sceneStatuses: [...progress.sceneStatuses],
});
