import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const slowQueryGamePath = fileURLToPath(
    new URL('./fixtures/games/valid/slow-query.xml', import.meta.url),
);
const slowQueryBatchGamePath = fileURLToPath(
    new URL('./fixtures/games/valid/slow-query-batch.xml', import.meta.url),
);
const slowInitializationDatabasePath = fileURLToPath(
    new URL('./fixtures/databases/slow-initialization.sqlite.sql', import.meta.url),
);

const slowQuerySql = `WITH RECURSIVE counter(value) AS (
    SELECT 0
    UNION ALL
    SELECT value + 1
    FROM counter
    WHERE value < 2000000
)
SELECT CASE WHEN SUM(value) >= 0 THEN 'completed' END AS status
FROM counter`;

type LoadingIndicatorObservation = {
    inserted: boolean,
    painted: boolean,
};

async function observeNextLoadingIndicator(page: Page): Promise<void> {
    await page.evaluate(() => {
        const observation: LoadingIndicatorObservation = {
            inserted: false,
            painted: false,
        };
        const testWindow = window as typeof window & {
            loadingIndicatorObservation: LoadingIndicatorObservation,
        };
        testWindow.loadingIndicatorObservation = observation;

        const observer = new MutationObserver(() => {
            const indicator = document.querySelector('[role="status"]');
            if (indicator === null) {
                return;
            }

            observation.inserted = true;
            window.requestAnimationFrame(() => {
                if (document.contains(indicator)) {
                    observation.painted = true;
                }
            });
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    });
}

async function expectLoadingIndicatorWasPainted(page: Page): Promise<void> {
    expect(await page.evaluate(() => {
        const testWindow = window as typeof window & {
            loadingIndicatorObservation: LoadingIndicatorObservation,
        };
        return testWindow.loadingIndicatorObservation;
    })).toEqual({
        inserted: true,
        painted: true,
    });
}

test('shows the loading indicator while a slow query runs and then displays its result', async ({ page }) => {
    await page.route('**/res/games/ordinary-morning/ordinary-morning.xml', route => route.fulfill({
        contentType: 'application/xml',
        path: slowQueryGamePath,
    }));
    await page.goto('/game-console/');

    await expect(page.getByText('Slow Query E2E', { exact: true })).toBeVisible();
    await expect(page.getByText('Scene 1 / 1', { exact: true })).toBeVisible();

    await observeNextLoadingIndicator(page);

    await page.getByRole('button', { name: 'Execute' }).click();
    await expect(page.getByText('Solved!', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('cell', { name: 'completed', exact: true })).toBeVisible();

    await expectLoadingIndicatorWasPainted(page);
});

test('game editor cancels a slow scene test, resets its database, and remains usable', async ({ page, context }) => {
    await page.route('**/res/games/ordinary-morning/ordinary-morning.xml', route => route.fulfill({
        contentType: 'application/xml',
        path: slowQueryGamePath,
    }));
    await page.goto('/game-editor/');

    await expect(page.locator('input[value="Slow Query E2E"]')).toBeVisible();
    const scenesPanel = page.getByTestId('game-editor-scenes-panel');
    const scene = scenesPanel.locator('[data-scene-type="select"]').first()
        .locator('xpath=ancestor::*[@data-rfd-draggable-id]');
    const status = scene.getByTestId('scene-test-status');
    await expect(status).toHaveAccessibleName('Test');

    await status.click();
    await expect(status).toHaveAccessibleName('Cancel');
    await status.click();
    await expect(status).toHaveAccessibleName('Test');
    await expect(status).toBeEnabled();

    const resultsPanel = page.getByTestId('game-editor-results-panel');
    await expect(resultsPanel.getByText(
        'Action cancelled. Database reset to its initial state.',
        { exact: true },
    )).toBeVisible();
    await expect(resultsPanel.getByRole('cell', { name: 'completed', exact: true })).toHaveCount(0);

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByText('Database/SQL console', { exact: true }).click();
    const sqlPanel = page.getByTestId('game-editor-sql-panel');
    const editor = sqlPanel.getByRole('textbox', { name: 'Editor content' });
    await page.evaluate(() => navigator.clipboard.writeText('SELECT value FROM marker'));
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+V');
    await sqlPanel.getByRole('button', { name: 'Execute' }).click();
    await expect(resultsPanel.getByRole('cell', { name: '1', exact: true })).toBeVisible();
});

test('game editor cancels a test-up-to-here batch and retains completed scene statuses', async ({ page }) => {
    await page.route('**/res/games/ordinary-morning/ordinary-morning.xml', route => route.fulfill({
        contentType: 'application/xml',
        path: slowQueryBatchGamePath,
    }));
    await page.goto('/game-editor/');

    await expect(page.locator('input[value="Slow Query Batch E2E"]')).toBeVisible();
    const scenesPanel = page.getByTestId('game-editor-scenes-panel');
    const taskScenes = scenesPanel.locator('[data-scene-type="select"]')
        .locator('xpath=ancestor::*[@data-rfd-draggable-id]');
    const firstStatus = taskScenes.nth(0).getByTestId('scene-test-status');
    const secondScene = taskScenes.nth(1);
    const secondStatus = secondScene.getByTestId('scene-test-status');
    await expect(firstStatus).toHaveAccessibleName('Test');
    await expect(secondStatus).toHaveAccessibleName('Test');

    await secondScene.getByRole('button', { name: 'Test options' }).click();
    await secondScene.getByText('Test up to here', { exact: true }).click();
    await expect(firstStatus).toHaveAccessibleName('Test status: Query returns a result');
    await expect(secondStatus).toHaveAccessibleName('Cancel');

    await secondStatus.click();

    await expect(firstStatus).toHaveAccessibleName('Test status: Query returns a result');
    await expect(secondStatus).toHaveAccessibleName('Test');
    await expect(secondStatus).toBeEnabled();
    const resultsPanel = page.getByTestId('game-editor-results-panel');
    await expect(resultsPanel.getByText(
        'Action cancelled. Database reset to its initial state.',
        { exact: true },
    )).toBeVisible();
    await expect(resultsPanel.getByRole('cell', { name: 'completed', exact: true })).toHaveCount(0);
});

test('browser shows the loading indicator while a slow query runs and then displays its result', async ({ page, context }) => {
    await page.goto('/browser/');

    await expect(page.getByText('SQL-Browser', { exact: true })).toBeVisible();
    await expect(page.getByText('Schema', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(sql => navigator.clipboard.writeText(sql), slowQuerySql);
    const editor = page.getByRole('textbox', { name: 'Editor content' });
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+V');
    await expect(editor).toHaveValue(slowQuerySql);

    await observeNextLoadingIndicator(page);

    const executeButton = page.getByRole('button', { name: 'Execute' });
    await executeButton.click();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await expect(page.getByRole('cell', { name: 'completed', exact: true })).toBeVisible();
    await expect(executeButton).toBeEnabled();

    await expectLoadingIndicatorWasPainted(page);
});

test('browser shows a spinner while a slow database initializes and remains usable afterward', async ({ page }) => {
    await page.goto('/browser/');

    await expect(page.getByText('SQL-Browser', { exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Open database' }).click();
    await page.getByRole('radio', { name: 'Open file' }).check();
    await page.locator('input[type="file"]').setInputFiles(slowInitializationDatabasePath);
    const openButton = page.getByRole('button', { name: 'Open', exact: true });
    await expect(openButton).toBeEnabled();
    await observeNextLoadingIndicator(page);

    await openButton.click();
    const databaseTab = page.getByTestId('browser-session-tab').filter({ hasText: 'slow-initialization.sqlite.sql' });
    await expect(databaseTab).toBeVisible();
    const spinner = page.getByTestId('nonready-view').getByRole('status');
    await expect(page.getByRole('cell', { name: 'marker', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(spinner).toHaveCount(0);
    await expectLoadingIndicatorWasPainted(page);

    const executeButton = page.getByRole('button', { name: 'Execute' });
    await expect(executeButton).toBeEnabled();
    await executeButton.click();
    await expect(page.getByRole('cell', { name: '1', exact: true })).toBeVisible();
});
