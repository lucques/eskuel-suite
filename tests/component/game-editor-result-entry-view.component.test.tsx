import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ResultEntryView } from '../../src/apps/game-editor/ResultEntryView';
import type { ResultEntry } from '../../src/apps/game-editor/session';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: {
                session_notice: {
                    game_editor_database_reset: 'Action cancelled. Database reset to its initial state.',
                    game_editor_source_load_cancelled: 'Opening the database was cancelled.',
                },
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

it.each([
    {
        entry: { id: 1, type: 'database-reset-notice' },
        message: 'Action cancelled. Database reset to its initial state.',
    },
    {
        entry: { id: 2, type: 'database-source-load-cancelled-notice' },
        message: 'Opening the database was cancelled.',
    },
] satisfies { entry: ResultEntry, message: string }[])('renders $entry.type as a dismissible timeline entry', async ({ entry, message }) => {
    const onClose = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <ResultEntryView entry={entry} onClose={onClose} />
        </I18nextProvider>,
    );

    await expect.element(screen.getByRole('alert')).toHaveTextContent(message);
    await screen.getByRole('button').click();
    expect(onClose).toHaveBeenCalledOnce();
});
