import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-react';

import packageMetadata from '../../package.json';
import { Topbar, TopbarTitle } from '../../src/gui-helpers/topbar/Topbar';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: {
                about: {
                    copyright: 'Copyright © 2026 Lukas Convent',
                    description: 'A suite for SQL-based educational material.',
                    full_license: 'Full license text (GNU GPL v3)',
                    license_notice: 'This program is free software under GNU GPL version 3 only.',
                    source_code: 'Source code',
                    third_party_licenses: 'Third-party software licenses',
                    title: 'About Eskuel Suite',
                    version: 'Version {{version}}',
                    warranty_notice: 'This program is provided WITHOUT ANY WARRANTY.',
                },
                common: {
                    close: 'Close',
                    menu: 'Menu',
                },
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

it('always exposes the complete legal notice through the About button', async () => {
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <Topbar>
                <TopbarTitle>Eskuel Suite</TopbarTitle>
            </Topbar>
        </I18nextProvider>,
    );

    await screen.getByRole('button', { name: 'Menu' }).click();
    await screen.getByRole('button', { name: 'About Eskuel Suite' }).click();

    await expect.element(screen.getByRole('dialog')).toBeVisible();
    await expect.element(screen.getByText(`Version ${packageMetadata.version}`)).toBeVisible();
    await expect.element(screen.getByText('Copyright © 2026 Lukas Convent')).toBeVisible();
    await expect.element(screen.getByText('This program is free software under GNU GPL version 3 only.')).toBeVisible();
    await expect.element(screen.getByText('This program is provided WITHOUT ANY WARRANTY.')).toBeVisible();
    await expect.element(screen.getByRole('link', { name: 'Source code' })).toHaveAttribute(
        'href',
        'https://github.com/lucques/eskuel-suite',
    );

    await expect.element(screen.getByRole('link', { name: 'Full license text (GNU GPL v3)' })).toHaveAttribute(
        'href',
        'https://github.com/lucques/eskuel-suite/blob/master/COPYING',
    );
    await expect.element(screen.getByRole('link', { name: 'Third-party software licenses' })).toHaveAttribute(
        'href',
        'https://github.com/lucques/eskuel-suite/blob/master/THIRD_PARTY_LICENSES',
    );
});
