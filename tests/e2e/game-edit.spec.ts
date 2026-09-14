import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures';

const secondGamePath = fileURLToPath(
    new URL('./fixtures/games/valid/minimal-playthrough.xml', import.meta.url),
);

async function waitForEditorCommit(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(() => new Promise<void>(resolve => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    }));
    await expect(page.locator('[aria-busy="true"]:visible')).toHaveCount(0);
}

test('smoke test for game-editor', async ({ page }) => {
    await page.goto('/game-editor/');

    await expect(page.getByText('SQL Game Editor', { exact: true })).toBeVisible();
    const gameTabs = page.getByTestId('game-editor-session-tab');
    await expect(gameTabs).toHaveCount(1);
    await expect(page.locator('input[value="Default E2E Game"]')).toBeVisible();
    const databasePanel = page.getByTestId('game-editor-database-panel');
    const schemaPanel = page.getByTestId('game-editor-schema-panel');
    await expect(databasePanel).toBeVisible();
    await expect(databasePanel.getByText('Loaded', { exact: true })).toBeVisible();
    await expect(schemaPanel).toBeVisible();
    await expect(schemaPanel.getByText('items', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Open game' }).click();
    const openGameDialog = page.getByRole('dialog', { name: 'Open game', exact: true });
    await openGameDialog.locator('input[type="file"]').setInputFiles(secondGamePath);
    await openGameDialog.getByRole('button', { name: 'Open', exact: true }).click();

    await expect(gameTabs).toHaveCount(2);
    await expect(gameTabs.filter({ hasText: 'minimal-playthrough' })).toBeVisible();
    await expect(page.locator('input[value="Minimal Playthrough E2E"]')).toBeVisible();
});

test('restores an automatically persisted game draft after a reload', async ({ page }) => {
    await page.goto('/game-editor/');
    await page.getByRole('button', { name: 'New game' }).click();
    const newGameModal = page.getByRole('dialog', { name: 'New game', exact: true });
    await newGameModal.locator('#new-game-name').fill('reload-recovery');
    await newGameModal.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('[data-testid="game-editor-title"]:visible').getByLabel('Name:')).toHaveValue('reload-recovery');

    await expect.poll(() => page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('eskuel-suite:game-editor-drafts', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction('documents', 'readonly');
        const documents = await new Promise<Array<{ filename?: unknown }>>((resolve, reject) => {
            const request = transaction.objectStore('documents').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        database.close();
        return documents.some(document => document.filename === 'reload_recovery.xml');
    })).toBe(true);

    await page.reload();

    const restoredTab = page.getByTestId('game-editor-session-tab').filter({ hasText: 'reload_recovery.xml' });
    await expect(restoredTab).toBeVisible();
    await restoredTab.click();
    await expect(page.locator('[data-testid="game-editor-title"]:visible').getByLabel('Name:')).toHaveValue('reload-recovery');
});

test('restores incrementally persisted metadata, scene order, and database changes', async ({ page }) => {
    test.slow();

    await page.goto('/game-editor/');
    await page.getByRole('button', { name: 'New game' }).click();
    const newGameModal = page.getByRole('dialog', { name: 'New game', exact: true });
    await newGameModal.locator('#new-game-name').fill('incremental reload');
    await newGameModal.getByRole('button', { name: 'Create' }).click();

    const title = page.locator('[data-testid="game-editor-title"]:visible');
    const scenesPanel = page.locator('[data-testid="game-editor-scenes-panel"]:visible');
    const databasePanel = page.locator('[data-testid="game-editor-database-panel"]:visible');
    await title.getByLabel('Name:').fill('Persisted title');
    await title.getByLabel('Name:').press('Tab');
    await waitForEditorCommit(page);

    await page.getByText('Additional information', { exact: true }).click();
    const metadataPanel = page.locator('[data-testid="game-editor-metadata-panel"]:visible');
    await metadataPanel.getByLabel('Teaser').fill('Persisted teaser');
    await metadataPanel.getByLabel('Teaser').press('Tab');
    await waitForEditorCommit(page);
    await page.getByText('Scenes', { exact: true }).click();

    await scenesPanel.getByRole('button', { name: 'Edit scene', exact: true }).click();
    const editSceneModal = page.getByRole('dialog', { name: 'Edit scene', exact: true });
    await editSceneModal.locator('textarea:visible').fill('First persisted scene');
    await editSceneModal.getByRole('button', { name: 'Save', exact: true }).click();
    await waitForEditorCommit(page);

    await scenesPanel.getByRole('button', { name: 'Insert scene at end' }).click();
    const addSceneModal = page.getByRole('dialog', { name: 'Add scene', exact: true });
    await addSceneModal.locator('textarea:visible').fill('Second persisted scene');
    await addSceneModal.getByRole('button', { name: 'Add', exact: true }).click();
    await waitForEditorCommit(page);
    const sceneCards = scenesPanel.locator('[data-rfd-draggable-id]');
    await expect(sceneCards).toHaveCount(2);

    const secondSceneDragHandle = sceneCards.nth(1).locator('[data-rfd-drag-handle-draggable-id]');
    await secondSceneDragHandle.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Space');
    await waitForEditorCommit(page);
    await expect(sceneCards.first()).toContainText('Second persisted scene');
    await expect(sceneCards.nth(1)).toContainText('First persisted scene');

    const databaseChooserPromise = page.waitForEvent('filechooser');
    await databasePanel.getByRole('button', { name: 'Open', exact: true }).click();
    const databaseChooser = await databaseChooserPromise;
    await databaseChooser.setFiles({
        name: 'persisted.sql',
        mimeType: 'text/plain',
        buffer: Buffer.from('CREATE TABLE persisted_table (id INTEGER PRIMARY KEY);'),
    });
    await expect(page.getByTestId('game-editor-schema-panel').getByText('persisted_table', { exact: true })).toBeVisible();

    await expect.poll(() => page.evaluate(async filename => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('eskuel-suite:game-editor-drafts', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const documentTransaction = database.transaction('documents', 'readonly');
        const documents = await new Promise<Array<{
            id: string,
            filename: string,
            title: string,
            teaser: string,
            sceneIds: string[],
        }>>((resolve, reject) => {
            const request = documentTransaction.objectStore('documents').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const documentRecord = documents.find(candidate => candidate.filename === filename);
        if (documentRecord === undefined) {
            database.close();
            return null;
        }
        else {
            const relatedTransaction = database.transaction(['scenes', 'databaseSources'], 'readonly');
            const sceneRecordsPromise = new Promise<Array<{
                id: string,
                scene: { type: string, text?: string },
            }>>((resolve, reject) => {
                const request = relatedTransaction.objectStore('scenes').index('documentId').getAll(documentRecord.id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            const databaseSourcePromise = new Promise<{ data?: { type?: string, sql?: string } } | undefined>((resolve, reject) => {
                const request = relatedTransaction.objectStore('databaseSources').get(documentRecord.id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            const [sceneRecords, databaseSource] = await Promise.all([
                sceneRecordsPromise,
                databaseSourcePromise,
            ]);
            database.close();
            const scenesById = new Map(sceneRecords.map(record => [record.id, record.scene]));
            return {
                title: documentRecord.title,
                teaser: documentRecord.teaser,
                sceneTexts: documentRecord.sceneIds.map(sceneId => scenesById.get(sceneId)?.text),
                databaseType: databaseSource?.data?.type,
                databaseSql: databaseSource?.data?.sql,
            };
        }
    }, 'incremental_reload.xml')).toEqual({
        title: 'Persisted title',
        teaser: 'Persisted teaser',
        sceneTexts: ['Second persisted scene', 'First persisted scene'],
        databaseType: 'initial-sql-script',
        databaseSql: 'CREATE TABLE persisted_table (id INTEGER PRIMARY KEY);',
    });

    await page.reload();

    const restoredTab = page.getByTestId('game-editor-session-tab').filter({ hasText: 'incremental_reload.xml' });
    await expect(restoredTab).toBeVisible();
    await restoredTab.click();
    await expect(page.locator('[data-testid="game-editor-title"]:visible').getByLabel('Name:')).toHaveValue('Persisted title');
    const restoredScenesPanel = page.locator('[data-testid="game-editor-scenes-panel"]:visible');
    const restoredSceneCards = restoredScenesPanel.locator('[data-rfd-draggable-id]');
    await expect(restoredSceneCards).toHaveCount(2);
    await expect(restoredSceneCards.first()).toContainText('Second persisted scene');
    await expect(restoredSceneCards.nth(1)).toContainText('First persisted scene');
    await page.getByText('Additional information', { exact: true }).click();
    await expect(page.locator('[data-testid="game-editor-metadata-panel"]:visible').getByLabel('Teaser')).toHaveValue('Persisted teaser');
    await page.getByText('Database/SQL console', { exact: true }).click();
    await expect(page.getByTestId('game-editor-schema-panel').getByText('persisted_table', { exact: true })).toBeVisible();
});
