import { expect, test } from './fixtures';

test('smoke test for game-console', async ({ page }) => {
    await page.goto('/game-console/');

    await expect(page.getByText('Default E2E Game', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Scene 1 / 5', { exact: true })).toBeVisible();
    await expect(page.getByText('Welcome to the default E2E game.', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Next' }).first().click();

    await expect(page.getByText('Scene 2 / 5', { exact: true })).toBeVisible();
    await expect(page.getByText('List every item.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Execute' })).toBeEnabled();
});

test('passes the xml query parameter to the game console app', async ({ page }) => {
    const requestedGame = page.waitForRequest(request => new URL(request.url()).pathname === '/res/games/query-game.xml');

    await page.goto('/game-console/?xml=%2Fres%2Fgames%2Fquery-game.xml');

    await requestedGame;
    await expect(page.getByText('Default E2E Game', { exact: true })).toBeVisible({ timeout: 15_000 });
});

test('offers to resume persisted progress after a reload', async ({ page }) => {
    await page.goto('/game-console/');
    await expect(page.getByText('Welcome to the default E2E game.', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Next' }).first().click();
    await expect(page.getByText('Scene 2 / 5', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText('Resume game?', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Resume' }).click();

    await expect(page.getByText('Scene 2 / 5', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('List every item.', { exact: true })).toBeVisible();
});
