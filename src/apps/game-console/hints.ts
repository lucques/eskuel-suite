import type { Scene } from '../../game/model';
import type { SceneStatus } from './game-progress';

export type OrdinaryHintViewState = {
    sceneIndex: number,
    nextOrdinaryHintIndex: number,
    revealedOrdinaryTextHints: string[],
    ordinaryHintUsed: boolean,
};

export function createOrdinaryHintViewState(sceneIndex: number): OrdinaryHintViewState {
    return { sceneIndex, nextOrdinaryHintIndex: 0, revealedOrdinaryTextHints: [], ordinaryHintUsed: false };
}

export function getHintControls(
    scene: Scene,
    sceneStatus: SceneStatus,
    state: OrdinaryHintViewState,
    ordinaryHintActionInProgress = false,
) {
    const taskScene = scene.type === 'select' || scene.type === 'manipulate' ? scene : null;
    const totalHintCount = taskScene === null ? 0 : taskScene.ordinaryHints.length + (taskScene.hasSolHint ? 1 : 0);
    const isRepeatableExpectedResultHint = taskScene !== null
        && !taskScene.hasSolHint
        && taskScene.ordinaryHints.length === 1
        && taskScene.ordinaryHints[0].type === 'expected-result';
    const hasNextOrdinaryHint = taskScene !== null && state.nextOrdinaryHintIndex < taskScene.ordinaryHints.length;
    const showOrdinaryHintButton = taskScene !== null
        && (sceneStatus === 'task-unsolved' || sceneStatus === 'task-skipped')
        && (ordinaryHintActionInProgress || hasNextOrdinaryHint || (taskScene.ordinaryHints.length > 0 && !taskScene.hasSolHint));
    const ordinaryHintDisabled = showOrdinaryHintButton && !hasNextOrdinaryHint && !ordinaryHintActionInProgress;
    const showSolutionHintButton = taskScene !== null && (
        sceneStatus === 'task-solved-by-sol-hint'
        || ((sceneStatus === 'task-unsolved' || sceneStatus === 'task-skipped')
            && !ordinaryHintActionInProgress && !hasNextOrdinaryHint && taskScene.hasSolHint)
    );
    const solutionHintDisabled = sceneStatus === 'task-solved-by-sol-hint';
    const showResetHintsButton = !isRepeatableExpectedResultHint
        && (state.ordinaryHintUsed || sceneStatus === 'task-solved-by-sol-hint');
    return {
        taskScene, totalHintCount, isRepeatableExpectedResultHint, hasNextOrdinaryHint,
        showOrdinaryHintButton, ordinaryHintDisabled, showSolutionHintButton, solutionHintDisabled, showResetHintsButton,
    };
}

export function revealNextOrdinaryHint(scene: Scene, state: OrdinaryHintViewState): OrdinaryHintViewState {
    const controls = getHintControls(scene, 'task-unsolved', state);
    if (controls.taskScene !== null && controls.hasNextOrdinaryHint && !controls.isRepeatableExpectedResultHint) {
        const hint = controls.taskScene.ordinaryHints[state.nextOrdinaryHintIndex];
        return {
            ...state,
            nextOrdinaryHintIndex: state.nextOrdinaryHintIndex + 1,
            revealedOrdinaryTextHints: hint.type === 'text'
                ? [...state.revealedOrdinaryTextHints, hint.text]
                : state.revealedOrdinaryTextHints,
            ordinaryHintUsed: true,
        };
    }
    else {
        return state;
    }
}
