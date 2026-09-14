import { expect, test } from './fixtures';

test('language changes synchronize between app tabs without reloading', async ({ context, page }) => {
    await context.addInitScript(() => {
        localStorage.setItem('eskuel-suite:settings:v1', JSON.stringify({
            language: 'en',
            themeMode: 'light',
        }));
        localStorage.removeItem('i18nextLng');
    });

    const gameConsolePage = await context.newPage();
    await Promise.all([
        page.goto('/browser/'),
        gameConsolePage.goto('/game-console/'),
    ]);

    const browserLanguageSwitcher = page.locator('#language-switcher');
    const gameConsoleLanguageSwitcher = gameConsolePage.locator('#language-switcher');
    await expect(browserLanguageSwitcher).toContainText('English');
    await expect(gameConsoleLanguageSwitcher).toContainText('English');
    await expect(page.getByRole('button', { name: 'Open database' })).toBeVisible();
    await expect(gameConsolePage.getByRole('button', { name: 'Open game' })).toBeVisible();

    await browserLanguageSwitcher.click();
    await page.getByText('Deutsch', { exact: true }).click();

    await expect(browserLanguageSwitcher).toContainText('Deutsch');
    await expect(gameConsoleLanguageSwitcher).toContainText('Deutsch');
    await expect(page.getByRole('button', { name: 'Datenbank öffnen' })).toBeVisible();
    await expect(gameConsolePage.getByRole('button', { name: 'Spiel öffnen' })).toBeVisible();
});
