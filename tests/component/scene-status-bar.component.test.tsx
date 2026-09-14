import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { SceneStatusBar } from '../../src/apps/game-console/SceneContentView';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: {
                common: {
                    cancel: 'Cancel',
                    cancelling: 'Cancelling',
                    loading: 'Loading',
                },
            },
            'game-console': {
                finished_status: 'Congratulations, you solved all {{total}} tasks.',
                ordinary_hint: 'Hint',
                ordinary_hint_progress: 'Hint ({{current}}/{{total}})',
                reset_hint: 'Reset hint',
                reset_hints: 'Reset hints',
                sample_solution: 'Sample solution',
                show_solution: 'Show solution',
                solved_by_solution_hint_status: 'This scene was solved using the solution hint.',
                solved_task_status: 'This scene has already been solved.',
                unsolved_task_prompt: 'Find a suitable SQL statement.',
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

it.each([
    { gameFinished: false, expectedStatus: 'This scene has already been solved.' },
    { gameFinished: true, expectedStatus: 'Congratulations, you solved all 1 tasks.' },
])('offers the sample solution for a solved task when gameFinished is $gameFinished', async ({ gameFinished, expectedStatus }) => {
    const onShowSolution = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SceneStatusBar
                sceneStatus='task-solved-by-user'
                gameFinished={gameFinished}
                skippedTaskCount={0}
                solvedTaskCount={1}
                taskCount={1}
                onShowOrdinaryHint={() => {}}
                onShowSolution={onShowSolution}
                onCancelOrdinaryHint={() => {}}
                onCancelSolutionHint={() => {}}
                onCancelSolution={() => {}}
            />
        </I18nextProvider>,
    );

    await expect.element(screen.getByText(expectedStatus, { exact: true })).toBeVisible();
    await screen.getByRole('button', { name: 'Sample solution' }).click();
    expect(onShowSolution).toHaveBeenCalledOnce();
});

it('cancels a running sample-solution request', async () => {
    const onCancelSolution = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SceneStatusBar
                sceneStatus='task-solved-by-user'
                gameFinished={false}
                skippedTaskCount={0}
                solvedTaskCount={1}
                taskCount={1}
                onShowOrdinaryHint={() => {}}
                onShowSolution={() => {}}
                onCancelOrdinaryHint={() => {}}
                onCancelSolutionHint={() => {}}
                onCancelSolution={onCancelSolution}
                solutionStatus='running'
            />
        </I18nextProvider>,
    );

    await screen.getByRole('button', { name: 'Cancel' }).click();
    expect(onCancelSolution).toHaveBeenCalledOnce();
});

it('offers the next ordinary hint and reset action for an unsolved task', async () => {
    const onShowOrdinaryHint = vi.fn();
    const onResetHints = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SceneStatusBar
                sceneStatus='task-unsolved'
                gameFinished={false}
                skippedTaskCount={0}
                solvedTaskCount={0}
                taskCount={1}
                onShowOrdinaryHint={onShowOrdinaryHint}
                onResetHints={onResetHints}
                onShowSolution={() => {}}
                onCancelOrdinaryHint={() => {}}
                onCancelSolutionHint={() => {}}
                onCancelSolution={() => {}}
                showOrdinaryHintButton={true}
                nextOrdinaryHintNumber={1}
                ordinaryHintCount={1}
                totalHintCount={1}
                showResetHintsButton={true}
            />
        </I18nextProvider>,
    );

    await screen.getByRole('button', { name: 'Hint', exact: true }).click();
    await screen.getByRole('button', { name: 'Reset hint' }).click();
    expect(onShowOrdinaryHint).toHaveBeenCalledOnce();
    expect(onResetHints).toHaveBeenCalledOnce();
    await expect.element(screen.getByRole('button', { name: 'Show solution' })).not.toBeInTheDocument();
});

it('shows a disabled solution hint and reset action after a solution-hint solve', async () => {
    const onResetHints = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SceneStatusBar
                sceneStatus='task-solved-by-sol-hint'
                gameFinished={false}
                skippedTaskCount={0}
                solvedTaskCount={1}
                taskCount={1}
                onShowOrdinaryHint={() => {}}
                onResetHints={onResetHints}
                onShowSolution={() => {}}
                onCancelOrdinaryHint={() => {}}
                onCancelSolutionHint={() => {}}
                onCancelSolution={() => {}}
                showSolutionHintButton={true}
                solutionHintDisabled={true}
                totalHintCount={2}
                showResetHintsButton={true}
            />
        </I18nextProvider>,
    );

    await expect.element(screen.getByText('This scene was solved using the solution hint.')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Show solution' })).toBeDisabled();
    await screen.getByRole('button', { name: 'Reset hints' }).click();
    expect(onResetHints).toHaveBeenCalledOnce();
});

it('hides all hint controls when the game is finished', async () => {
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SceneStatusBar
                sceneStatus='task-solved-by-sol-hint'
                gameFinished={true}
                skippedTaskCount={0}
                solvedTaskCount={1}
                taskCount={1}
                onShowOrdinaryHint={() => {}}
                onResetHints={() => {}}
                onShowSolution={() => {}}
                onCancelOrdinaryHint={() => {}}
                onCancelSolutionHint={() => {}}
                onCancelSolution={() => {}}
                showOrdinaryHintButton={true}
                showSolutionHintButton={true}
                showResetHintsButton={true}
                totalHintCount={2}
            />
        </I18nextProvider>,
    );

    await expect.element(screen.getByRole('button', { name: 'Hint', exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Show solution' })).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Reset hints' })).not.toBeInTheDocument();
});
