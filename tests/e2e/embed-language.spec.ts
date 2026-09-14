import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const apps = ['BrowserApp', 'GameConsoleApp', 'GameEditorApp'] as const;

async function openEmbed(page: Page, app: typeof apps[number], initialLanguage?: string) {
    await page.route('**/src/apps/browser/main.tsx', route => route.fulfill({
        contentType: 'text/javascript',
        body: `
            import { ${app} } from '/src/embed.ts';
            import { defaultSettingsStore } from '/src/settings/store.ts';
            window.languageChanges = [];
            window.initialLabels = [];
            window.settingsStore = defaultSettingsStore;
            const observer = new MutationObserver(() => {
                const label = document.querySelector('#language-switcher')?.textContent;
                if (label) window.initialLabels.push(label);
            });
            observer.observe(document.getElementById('root'), { subtree: true, childList: true });
            const app = new ${app}('root', {
                initialLanguage: ${JSON.stringify(initialLanguage) ?? 'undefined'},
                onLanguageChange: language => window.languageChanges.push(language),
                linksRight: [{
                    en: { title: 'Home', url: '/en/' },
                    de: { title: 'Startseite', url: '/de/' },
                }],
                persistGameProgress: false,
                persistGameDrafts: false,
            });
            try {
                await app.init();
            }
            catch (error) {
                window.initializationError = error.message;
                observer.disconnect();
            }
            window.stopObservingLanguage = () => observer.disconnect();
        `,
    }));
    await page.goto('/browser/');
}

for (const app of apps) {
    test(`${app} initializes in the host language and only notifies later changes`, async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('eskuel-suite:settings:v1', JSON.stringify({ language: 'en' }));
        });
        await openEmbed(page, app, 'de');

        const switcher = page.locator('#language-switcher');
        await expect(switcher).toContainText('Deutsch');
        await expect(page.getByRole('link', { name: 'Startseite' })).toHaveAttribute('href', '/de/');
        const initialLabels = await page.evaluate(() => {
            Reflect.get(window, 'stopObservingLanguage')();
            return Reflect.get(window, 'initialLabels') as string[];
        });
        expect(initialLabels.length).toBeGreaterThan(0);
        expect(initialLabels.every(label => label.includes('Deutsch'))).toBe(true);
        expect(await page.evaluate(() => Reflect.get(window, 'languageChanges'))).toEqual([]);
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('eskuel-suite:settings:v1')!).language)).toBe('de');

        await switcher.click();
        await page.getByText('Deutsch', { exact: true }).last().click();
        expect(await page.evaluate(() => Reflect.get(window, 'languageChanges'))).toEqual([]);

        await switcher.click();
        await page.getByText('English', { exact: true }).click();
        await expect(switcher).toContainText('English');
        await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/en/');
        await expect.poll(() => page.evaluate(() => Reflect.get(window, 'languageChanges'))).toEqual(['en']);

        await page.evaluate(() => Reflect.get(window, 'settingsStore').update({ maxOpenDatabases: 8 }));
        await switcher.click();
        await page.getByText('Deutsch', { exact: true }).click();
        await expect(switcher).toContainText('Deutsch');
        expect(await page.evaluate(() => Reflect.get(window, 'languageChanges'))).toEqual(['en', 'de']);
    });

    test(`${app} retains the saved preference when no language is supplied`, async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('eskuel-suite:settings:v1', JSON.stringify({ language: 'de' }));
        });
        await openEmbed(page, app);
        await expect(page.locator('#language-switcher')).toContainText('Deutsch');
        expect(await page.evaluate(() => Reflect.get(window, 'languageChanges'))).toEqual([]);
    });

    test(`${app} uses browser detection without a saved or supplied language`, async ({ page }) => {
        await openEmbed(page, app);
        await expect(page.locator('#language-switcher')).toContainText('English');
        expect(await page.evaluate(() => Reflect.get(window, 'languageChanges'))).toEqual([]);
    });

    test(`${app} rejects an unsupported explicit language before mounting`, async ({ page }) => {
        await openEmbed(page, app, 'fr');
        await expect.poll(() => page.evaluate(() => Reflect.get(window, 'initializationError'))).toMatch(/Unsupported initial language/);
        await expect(page.locator('#root')).toBeEmpty();
    });
}
