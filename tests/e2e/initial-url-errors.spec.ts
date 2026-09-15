import { readFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

import type { Language } from '../../src/i18n/languages';
import { expect, test } from './fixtures';

type AppName = 'BrowserApp' | 'GameConsoleApp' | 'GameEditorApp';

const invalidUrl = 'https://gist.githubusercontent.com/example/raw/gistfile1.txt';

function getInitialSourceOptions(app: AppName, urls: string[]) {
    switch (app) {
        case 'BrowserApp':
            return { initialDatabaseUrls: urls };
        case 'GameConsoleApp':
            return { initialGameUrl: urls[0] };
        case 'GameEditorApp':
            return { initialGameUrls: urls };
        default: { const _n: never = app; return _n; }
    }
}

async function openApp(page: Page, app: AppName, language: Language, urls = [invalidUrl]) {
    const options = {
        ...getInitialSourceOptions(app, urls),
        initialLanguage: language,
        persistGameProgress: true,
        persistGameDrafts: true,
    };
    await page.route(invalidUrl, route => route.fulfill({
        contentType: 'text/plain',
        body: Buffer.from([0xff, 0xfe, 0xfd]),
    }));
    await page.route('**/src/apps/browser/main.tsx', route => route.fulfill({
        contentType: 'text/javascript',
        body: `
            import { ${app} } from '/src/embed.ts';
            await new ${app}('root', ${JSON.stringify(options)}).init();
        `,
    }));
    await page.goto('/browser/');
}

for (const app of ['BrowserApp', 'GameConsoleApp', 'GameEditorApp'] as const) {
    for (const language of ['en', 'de'] as const) {
        test(`${app} presents invalid downloaded content in ${language} without breaking the app`, async ({ page }) => {
            const pageErrors: string[] = [];
            page.on('pageerror', error => pageErrors.push(error.message));

            await openApp(page, app, language);

            const title = app === 'BrowserApp'
                ? language === 'en' ? 'Database file is invalid' : 'Datenbankdatei ist ungültig'
                : language === 'en' ? 'Game file is invalid' : 'Spieldatei ist ungültig';
            const openLabel = app === 'BrowserApp'
                ? language === 'en' ? 'Open database' : 'Datenbank öffnen'
                : language === 'en' ? 'Open game' : 'Spiel öffnen';
            const alert = page.getByRole('alert');

            await expect(alert.getByRole('heading', { name: title })).toBeVisible();
            await expect(alert).toHaveCount(1);
            await expect(page.getByRole('button', { name: openLabel, exact: true })).toBeEnabled();
            await expect(alert.getByText('The file is not valid UTF-8 text.', { exact: true })).toBeHidden();
            await alert.getByText(language === 'en' ? 'Technical details' : 'Technische Details').click();
            await expect(alert.getByText('The file is not valid UTF-8 text.', { exact: true })).toBeVisible();
            expect(pageErrors).toEqual([]);
        });
    }
}

test('an invalid database download does not prevent another database from loading', async ({ page }) => {
    await openApp(page, 'BrowserApp', 'en', [invalidUrl, '/res/dbs/valid.sql']);

    const validTab = page.getByTestId('browser-session-tab').filter({ hasText: 'valid.sql' });
    await validTab.click();
    await expect(page.getByRole('button', { name: 'Execute', exact: true })).toBeEnabled();

    await page.getByTestId('browser-session-tab').filter({ hasText: 'gistfile1.txt' }).click();
    await expect(page.getByRole('heading', { name: 'Database file is invalid' })).toBeVisible();

    await validTab.click();
    await expect(page.getByRole('button', { name: 'Execute', exact: true })).toBeEnabled();
});

for (const app of ['BrowserApp', 'GameConsoleApp', 'GameEditorApp'] as const) {
    test(`${app} accepts arbitrary upload filenames and reports invalid contents in the app`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await openApp(page, app, 'en', []);
        const openLabel = app === 'BrowserApp' ? 'Open database' : 'Open game';
        const content = readFileSync(new URL(app === 'BrowserApp'
            ? './fixtures/databases/default.sqlite.sql'
            : './fixtures/games/valid/default.xml', import.meta.url));

        async function upload(name: string, buffer: Buffer) {
            const chooserPromise = page.waitForEvent('filechooser');
            await page.getByRole('button', { name: openLabel, exact: true }).click();
            const chooser = await chooserPromise;
            await chooser.setFiles({ name, mimeType: 'application/octet-stream', buffer });
        }

        await upload('upload.txt', content);
        switch (app) {
            case 'BrowserApp':
                await expect(page.getByRole('button', { name: 'Execute', exact: true })).toBeEnabled();
                await expect(page.getByTestId('browser-session-tab')).toContainText('upload.txt');
                break;
            case 'GameConsoleApp':
                await expect(page.getByText('Welcome to the default E2E game.', { exact: true })).toBeVisible();
                break;
            case 'GameEditorApp':
                await expect(page.locator('input[value="Default E2E Game"]')).toBeVisible();
                await expect(page.getByTestId('game-editor-session-tab').filter({ hasText: 'upload.txt' })).toBeVisible();
                break;
            default: { const _n: never = app; return _n; }
        }

        await upload(app === 'BrowserApp' ? 'invalid.sql' : 'invalid.xml', Buffer.from([0xff, 0xfe, 0xfd]));
        await expect(page.getByRole('heading', {
            name: app === 'BrowserApp' ? 'Database file is invalid' : 'Game file is invalid',
        })).toBeVisible();
        await expect(page.getByRole('button', { name: openLabel, exact: true })).toBeEnabled();
        expect(pageErrors).toEqual([]);
    });
}
