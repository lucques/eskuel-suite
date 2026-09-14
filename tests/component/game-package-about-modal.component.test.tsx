import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ESKUEL_DATABASE_PACKAGE_PROFILE } from '../../src/database/package';
import { ESKUEL_GAME_PACKAGE_PROFILE } from '../../src/game/package';
import type { GamePackageInfo } from '../../src/game/package';
import { AppThemeScope } from '../../src/gui-helpers/app-theme/AppTheme';
import { GamePackageAboutModal } from '../../src/gui-helpers/game-package-about-modal/GamePackageAboutModal';
import commonEn from '../../src/i18n/locales/common/en.json';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { common: commonEn } },
    defaultNS: 'common',
    showSupportNotice: false,
});

it('shows game and database licensing as separate package scopes', async () => {
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <AppThemeScope theme='game-console'>
                <GamePackageAboutModal info={packageInfo} show={true} onHide={vi.fn()} />
            </AppThemeScope>
        </I18nextProvider>,
    );

    await expect.element(screen.getByRole('dialog')).toBeVisible();
    await expect.element(screen.getByText('Example game', { exact: true })).toBeVisible();
    await expect.element(screen.getByRole('heading', { name: 'Game licensing and provenance' })).toBeVisible();
    await expect.element(screen.getByRole('heading', { name: 'Database package' })).toBeVisible();
    await expect.element(screen.getByText('Example database', { exact: true })).toBeVisible();
    await expect.element(screen.getByRole('heading', { name: 'Database licensing and provenance' })).toBeVisible();

    await screen.getByText('Game License', { exact: true }).click();
    await screen.getByText('Database License', { exact: true }).click();
    await expect.element(screen.getByText('Game license text', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('Database license text', { exact: true })).toBeVisible();
});

const packageInfo: GamePackageInfo = {
    descriptor: {
        $schema: ESKUEL_GAME_PACKAGE_PROFILE,
        name: 'example-game',
        title: 'Example game',
        version: '1.0.0',
        contributors: [{ title: 'Game author', roles: ['creator'] }],
        licenses: [{ name: 'Game-License', title: 'Game License', path: 'LICENSES/Game.txt' }],
        resources: [{
            name: 'game',
            path: 'data/example-game.xml',
            format: 'xml',
            mediatype: 'application/xml',
            bytes: 1,
            hash: `sha256:${'0'.repeat(64)}`,
        }, {
            name: 'database',
            path: 'dependencies/database.eskueldb',
            format: 'eskueldb',
            mediatype: 'application/zip',
            bytes: 1,
            hash: `sha256:${'1'.repeat(64)}`,
        }],
    },
    licenses: [{
        metadata: { name: 'Game-License', title: 'Game License', path: 'LICENSES/Game.txt' },
        text: 'Game license text',
    }],
    notices: [],
    database: {
        descriptor: {
            $schema: ESKUEL_DATABASE_PACKAGE_PROFILE,
            name: 'example-database',
            title: 'Example database',
            version: '1.0.0',
            contributors: [{ title: 'Database author', roles: ['creator'] }],
            licenses: [{
                name: 'Database-License',
                title: 'Database License',
                path: 'LICENSES/Database.txt',
            }],
            resources: [{
                name: 'example-database',
                path: 'data/example.sql',
                format: 'sql',
                mediatype: 'application/sql',
                bytes: 1,
                hash: `sha256:${'2'.repeat(64)}`,
                'eskuel:database': {
                    artifactType: 'initial-sql-script',
                    system: 'sqlite',
                    systemMinVersion: '3.0.0',
                },
            }],
        },
        licenses: [{
            metadata: {
                name: 'Database-License',
                title: 'Database License',
                path: 'LICENSES/Database.txt',
            },
            text: 'Database license text',
        }],
        notices: [],
    },
};
