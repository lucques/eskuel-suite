import { readFileSync } from 'node:fs';

import { expect, test } from './fixtures';

const game = readFileSync(new URL('./fixtures/games/valid/default.xml', import.meta.url));
const database = readFileSync(new URL('./fixtures/databases/default.sqlite.sql', import.meta.url));
const gistUrl = 'https://gist.githubusercontent.com/lucques/8250abf0204fd2eeafe96723273c0bd9/raw/5f5313345758b8d315894a69f9ef4312126da7f6/gistfile1.txt';
const apps = [
    { kind: 'browser', path: '/browser/', errorTitle: 'Database could not be opened', openLabel: 'Open database' },
    { kind: 'game-console', path: '/game-console/', errorTitle: 'Game could not be opened', openLabel: 'Open game' },
    { kind: 'game-editor', path: '/game-editor/', errorTitle: 'Game could not be opened', openLabel: 'Open game' },
] as const;

for (const app of apps) {
    for (const file of [gistUrl, '../download/?id=123']) {
        test(`${app.kind} opens content from ${file} in place of its defaults`, async ({ page }) => {
            const requestedSources: string[] = [];
            const sourceUrl = new URL(file, 'http://placeholder.test' + app.path);
            const routeUrl = sourceUrl.origin === 'http://placeholder.test'
                ? '**' + sourceUrl.pathname + sourceUrl.search
                : file;
            page.on('request', request => {
                const url = new URL(request.url());
                if (url.href === file || url.pathname === '/download/' || /^\/res\/(?:dbs|games)\//.test(url.pathname)) {
                    requestedSources.push(url.pathname);
                }
            });
            await page.route(routeUrl, route => route.fulfill({
                // Deliberately unrelated to the actual format.
                contentType: 'application/octet-stream',
                body: app.kind === 'browser' ? database : game,
            }));

            await page.goto(`${app.path}?file=${encodeURIComponent(file)}`);

            switch (app.kind) {
                case 'browser':
                    await expect(page.getByTestId('browser-session-tab')).toHaveCount(1);
                    await expect(page.getByTestId('browser-session-tab')).toContainText(file === gistUrl ? 'gistfile1.txt' : 'download');
                    await expect(page.getByRole('button', { name: 'Execute', exact: true })).toBeEnabled();
                    break;
                case 'game-console':
                    await expect(page.getByText('Default E2E Game', { exact: true })).toBeVisible();
                    await expect(page.getByText('Welcome to the default E2E game.', { exact: true })).toBeVisible();
                    break;
                case 'game-editor':
                    await expect(page.getByTestId('game-editor-session-tab')).toHaveCount(1);
                    await expect(page.getByTestId('game-editor-session-tab')).toContainText(file === gistUrl ? 'gistfile1.txt' : 'download');
                    await expect(page.locator('input[value="Default E2E Game"]')).toBeVisible();
                    break;
                default: { const _n: never = app; return _n; }
            }

            expect(requestedSources).toEqual([sourceUrl.pathname]);
        });
    }

    test(`${app.kind} presents a failed download without loading default sources`, async ({ page }) => {
        const requestedSources: string[] = [];
        const pageErrors: string[] = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('request', request => {
            if (request.url() === gistUrl || /^\/res\/(?:dbs|games)\//.test(new URL(request.url()).pathname)) {
                requestedSources.push(request.url());
            }
        });
        await page.route(gistUrl, route => route.fulfill({ status: 404, body: 'Not found' }));

        await page.goto(`${app.path}?file=${encodeURIComponent(gistUrl)}`);

        const alert = page.getByRole('alert');
        await expect(alert.getByRole('heading', { name: app.errorTitle })).toBeVisible();
        await expect(alert).toHaveCount(1);
        await expect(alert).toContainText(gistUrl);
        await expect(page.getByRole('button', { name: app.openLabel, exact: true })).toBeEnabled();
        expect(requestedSources).toEqual([gistUrl]);
        expect(pageErrors).toEqual([]);
    });
}
