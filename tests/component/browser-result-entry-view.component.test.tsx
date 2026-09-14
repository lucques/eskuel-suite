import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ResultEntryView } from '../../src/apps/browser/ResultEntryView';
import { ResultTablesView } from '../../src/gui-helpers/result-view/ResultTablesView';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: {
                session_notice: {
                    browser_database_reset: 'Query cancelled. Database reset to its initial state.',
                },
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

it('renders the database-reset notice as a dismissible timeline entry', async () => {
    const onClose = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <ResultEntryView
                entry={{ id: 1, type: 'database-reset-notice' }}
                onClose={onClose}
            />
        </I18nextProvider>,
    );

    await expect.element(screen.getByRole('alert')).toHaveTextContent(
        'Query cancelled. Database reset to its initial state.',
    );
    await screen.getByRole('button').click();
    expect(onClose).toHaveBeenCalledOnce();
});

it('renders PostgreSQL boolean and bytea values', async () => {
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <ResultTablesView tables={[{
                columns: ['enabled', 'bytes'],
                values: [[true, new Uint8Array([1, 2])]],
            }]} />
        </I18nextProvider>,
    );

    await expect.element(screen.getByRole('cell', { name: 'TRUE' })).toBeVisible();
    await expect.element(screen.getByRole('cell', { name: '\\x0102' })).toBeVisible();
});
