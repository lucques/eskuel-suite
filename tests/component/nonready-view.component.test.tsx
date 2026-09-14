import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-react';

import { NonreadyView } from '../../src/gui-helpers/nonready-view/NonreadyView';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: {
                common: {
                    loading: 'Loading...',
                },
                initialization: {
                    technical_details: 'Technical details',
                },
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

it('renders a full-content loading state', async () => {
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <NonreadyView kind='loading' />
        </I18nextProvider>
    );

    await expect.element(screen.getByRole('status')).toHaveTextContent('Loading...');
});

it('renders an accessible failure with optional details and actions', async () => {
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <NonreadyView
                kind='failed'
                error={{
                    title: 'Database initialization failed',
                    message: 'The database could not be initialized.',
                    details: 'near THIS: syntax error',
                }}
                actions={<button type='button'>Close tab</button>}
            />
        </I18nextProvider>
    );

    await expect.element(screen.getByRole('alert')).toBeVisible();
    await expect.element(screen.getByRole('heading', { name: 'Database initialization failed' })).toBeVisible();
    await expect.element(screen.getByText('The database could not be initialized.')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Close tab' })).toBeVisible();
    await screen.getByText('Technical details').click();
    await expect.element(screen.getByText('near THIS: syntax error')).toBeVisible();
});
