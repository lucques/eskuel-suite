import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures';

const uploadedDatabasePath = fileURLToPath(
    new URL('./fixtures/databases/uploaded.postgresql.sql', import.meta.url),
);

test('smoke test for the PostgreSQL browser', async ({ page }) => {
    await page.goto('/browser/');

    await expect(page.getByText('SQL-Browser', { exact: true })).toBeVisible();

    const openDatabaseButton = page.getByRole('button', { name: 'Open database' });
    await openDatabaseButton.click();
    await page.getByRole('radio', { name: 'Open file' }).check();
    await page.locator('input[type="file"]').setInputFiles(uploadedDatabasePath);
    await page.getByRole('button', { name: 'Open', exact: true }).click();

    const databaseTab = page.getByTestId('browser-session-tab').filter({ hasText: 'uploaded.postgresql.sql' });
    await expect(databaseTab).toBeVisible();
    await databaseTab.click();
    await expect(page.getByRole('cell', { name: 'uploaded_marker', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Execute' })).toBeEnabled();

    const sql = 'SELECT value, version() AS engine_version FROM uploaded_marker';
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(value => navigator.clipboard.writeText(value), sql);
    const editor = page.getByRole('textbox', { name: 'Editor content' });
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+V');
    await expect(editor).toHaveValue(sql);

    await expect(databaseTab).toBeVisible();
    await page.getByRole('button', { name: 'Execute' }).click();

    await expect(page.getByRole('columnheader', { name: 'value', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'engine_version', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'PostgreSQL upload', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: /^PostgreSQL \d/ })).toBeVisible();
    await expect(databaseTab).toBeVisible();
});
