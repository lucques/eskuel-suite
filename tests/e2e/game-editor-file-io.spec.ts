import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { Download, Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const gamePath = fileURLToPath(
    new URL('./fixtures/games/valid/minimal-playthrough.xml', import.meta.url),
);
const sqliteDatabasePath = fileURLToPath(
    new URL('../../spec/database-package/v1/examples/database-file/data/example-school.sqlite', import.meta.url),
);

async function openGameFile(page: Page, name: string): Promise<void> {
    const source = await readFile(gamePath);
    await page.getByRole('button', { name: 'Open game' }).click();
    const dialog = page.getByRole('dialog', { name: 'Open game', exact: true });
    await dialog.locator('input[type="file"]').setInputFiles({
        name,
        mimeType: 'application/xml',
        buffer: source,
    });
    await dialog.getByRole('button', { name: 'Open', exact: true }).click();

    await expect(page.getByTestId('game-editor-session-tab').filter({ hasText: name })).toBeVisible();
    await expect(page.getByLabel('Name:').filter({ visible: true })).toHaveValue('Minimal Playthrough E2E');
}

async function openDatabaseFile(
    page: Page,
    databasePanel: Locator,
    file: string | { name: string, mimeType: string, buffer: Buffer },
): Promise<void> {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await databasePanel.getByRole('button', { name: 'Open', exact: true }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(file);
}

async function downloadedFilePath(download: Download): Promise<string> {
    const path = await download.path();
    if (path === null) {
        throw new Error('The downloaded file has no local path');
    }
    else {
        return path;
    }
}

for (const filename of ['opened-game.xml', 'opened-game.XML', 'opened-game', 'opened-game.txt']) {
    test(`preserves the opened game filename ${filename} when exporting`, async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
        });
        await page.goto('/game-editor/');
        await openGameFile(page, filename);

        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Export game file' }).click();
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toBe(filename);
        const exportedGame = await readFile(await downloadedFilePath(download), 'utf8');
        expect(exportedGame).toContain('<title>Minimal Playthrough E2E</title>');
    });
}

test('downloads an opened SQL initialization script as database.sql', async ({ page }) => {
    const sql = [
        '-- eskuel:system=sqlite',
        '-- eskuel:systemMinVersion=3.0.0',
        'CREATE TABLE saved_sql (value INTEGER NOT NULL);',
        'INSERT INTO saved_sql VALUES (1);',
    ].join('\n');
    await page.goto('/game-editor/');
    const databasePanel = page.getByTestId('game-editor-database-panel');
    await openDatabaseFile(page, databasePanel, {
        name: 'initialization.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(sql),
    });
    await expect(page.getByTestId('game-editor-schema-panel').getByText('saved_sql', { exact: true })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await databasePanel.getByRole('button', { name: 'Save', exact: true }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('database.sql');
    await expect(readFile(await downloadedFilePath(download), 'utf8')).resolves.toBe(sql);
});

test('opens a binary SQLite database and downloads it as database.db', async ({ page }) => {
    await page.goto('/game-editor/');
    const databasePanel = page.getByTestId('game-editor-database-panel');
    await openDatabaseFile(page, databasePanel, {
        name: 'sqlite-without-extension',
        mimeType: 'text/plain',
        buffer: await readFile(sqliteDatabasePath),
    });
    await expect(page.getByTestId('game-editor-schema-panel').getByText('students', { exact: true })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await databasePanel.getByRole('button', { name: 'Save', exact: true }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('database.db');
    const [downloadedDatabase, originalDatabase] = await Promise.all([
        readFile(await downloadedFilePath(download)),
        readFile(sqliteDatabasePath),
    ]);
    expect(downloadedDatabase.equals(originalDatabase)).toBe(true);
});
