import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ResultEntryView } from '../../src/apps/game-console/ResultEntryView';
import { SettingsProvider } from '../../src/settings/settings';
import { createSettingsStore } from '../../src/settings/store';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: {
                result: {
                    error_message: 'Error message',
                    truncated_rows: 'Result was truncated after {{count}} rows',
                },
                session_notice: {
                    game_console_database_reset: 'Database reset to the start of scene {{sceneNumber}}.',
                    game_console_database_reset_after_cancellation: 'Action cancelled. Database reset to the start of scene {{sceneNumber}}.',
                },
            },
            'game-console': {
                result_solution_hint: 'Solution hint',
                sample_solution: 'Sample solution',
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

it.each([
    {
        entry: { id: 1, type: 'database-reset-notice', sceneIndex: 2, trigger: 'manual' },
        message: 'Database reset to the start of scene 3.',
    },
    {
        entry: { id: 2, type: 'database-reset-notice', sceneIndex: 3, trigger: 'cancellation' },
        message: 'Action cancelled. Database reset to the start of scene 4.',
    },
] as const)('renders the $entry.trigger database-reset notice as a dismissible timeline entry', async ({ entry, message }) => {
    const onClose = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <ResultEntryView
                entry={entry}
                onClose={onClose}
            />
        </I18nextProvider>,
    );

    await expect.element(screen.getByRole('alert')).toHaveTextContent(message);
    await screen.getByRole('button').click();
    expect(onClose).toHaveBeenCalledOnce();
});

it('renders a sample-solution result', async () => {
    const settingsStore = createSettingsStore();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SettingsProvider store={settingsStore}>
                <ResultEntryView
                    entry={{
                        id: 3,
                        type: 'sample-sol',
                        res: {
                            type: 'succ',
                            sql: 'SELECT 42 AS answer',
                            result: [{ columns: ['answer'], values: [[42]], truncated: true }],
                        },
                    }}
                    onClose={() => {}}
                />
            </SettingsProvider>
        </I18nextProvider>,
    );

    await expect.element(screen.getByText('Sample solution', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('SELECT 42 AS answer', { exact: true })).toBeVisible();
    await expect.element(screen.getByRole('cell', { name: '42' })).toBeVisible();
    await expect.element(screen.getByRole('cell', { name: '43' })).not.toBeInTheDocument();
    await expect.element(screen.getByText('Result was truncated after 1 rows', { exact: true })).toBeVisible();
});

it('renders an erroneous sample-solution result', async () => {
    const settingsStore = createSettingsStore();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SettingsProvider store={settingsStore}>
                <ResultEntryView
                    entry={{
                        id: 4,
                        type: 'sample-sol',
                        res: {
                            type: 'error',
                            sql: 'INVALID SAMPLE SOLUTION',
                            message: 'Syntax error in sample solution',
                        },
                    }}
                    onClose={() => {}}
                />
            </SettingsProvider>
        </I18nextProvider>,
    );

    await expect.element(screen.getByText('Sample solution', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('INVALID SAMPLE SOLUTION', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('Error message:', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('Syntax error in sample solution', { exact: false })).toBeVisible();
});

it('renders a solution-hint result with its solution SQL', async () => {
    const settingsStore = createSettingsStore();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SettingsProvider store={settingsStore}>
                <ResultEntryView
                    entry={{
                        id: 5,
                        type: 'sol-hint',
                        res: {
                            type: 'succ',
                            sql: 'SELECT 7 AS hinted_answer',
                            result: [{ columns: ['hinted_answer'], values: [[7]], truncated: false }],
                        },
                    }}
                    onClose={() => {}}
                />
            </SettingsProvider>
        </I18nextProvider>,
    );

    await expect.element(screen.getByText('Solution hint', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('SELECT 7 AS hinted_answer', { exact: true })).toBeVisible();
    await expect.element(screen.getByRole('cell', { name: '7' })).toBeVisible();
});
