import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const minimalGamePath = fileURLToPath(
    new URL('./fixtures/games/valid/minimal-playthrough.postgresql.xml', import.meta.url),
);

const initialSql = [
    '-- eskuel:system=postgresql',
    '        -- eskuel:systemMinVersion=14.0.0',
    '        CREATE TABLE items (',
    '            id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,',
    '            name TEXT NOT NULL,',
    '            collected BOOLEAN NOT NULL DEFAULT FALSE',
    '        );',
    '        INSERT INTO items (name) VALUES',
    '            (\'hammer\'),',
    '            (\'key\');',
].join('\n');

async function replaceEditorContents(page: Page, editor: Locator, value: string): Promise<void> {
    await page.evaluate(text => navigator.clipboard.writeText(text), value);
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+V');
    await expect(editor).toHaveValue(value);
}

async function waitForEditorCommit(page: Page): Promise<void> {
    await page.evaluate(() => new Promise<void>(resolve => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    }));
    await expect(page.locator('[aria-busy="true"]:visible')).toHaveCount(0);
}

async function openAddSceneModal(page: Page, scenesPanel: Locator): Promise<Locator> {
    await scenesPanel.getByRole('button', { name: 'Insert scene at end' }).click();
    const modal = page.getByRole('dialog', { name: 'Add scene', exact: true });
    await expect(modal).toBeVisible();
    return modal;
}

function visibleSceneTextArea(modal: Locator): Locator {
    return modal.locator('textarea:not([aria-label="Editor content"]):visible');
}

function visibleSqlEditors(modal: Locator): Locator {
    return modal.locator('textarea[aria-label="Editor content"]:visible');
}

test.setTimeout(90_000);

test('constructs and exports the minimal PostgreSQL play-through game', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
        Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
    });
    await page.goto('/game-editor/');

    await expect(page.getByText('SQL Game Editor', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'New game' }).click();

    const newGameModal = page.getByRole('dialog', { name: 'New game', exact: true });
    await expect(newGameModal).toBeVisible();
    await newGameModal.locator('#new-game-name').fill('minimal-postgresql-playthrough');
    await newGameModal.getByRole('button', { name: 'Create' }).click();

    const title = page.locator('[data-testid="game-editor-title"]:visible');
    const metadata = page.locator('[data-testid="game-editor-metadata-panel"]:visible');
    const scenesPanel = page.locator('[data-testid="game-editor-scenes-panel"]:visible');
    const databasePanel = page.locator('[data-testid="game-editor-database-panel"]:visible');
    await expect(title.getByLabel('Name:')).toHaveValue('minimal-postgresql-playthrough');
    await expect(page.getByText('Results', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Schema', { exact: true })).toHaveCount(0);
    await expect(databasePanel.getByText('SQL', { exact: true })).toHaveCount(0);

    const firstSceneHeader = scenesPanel.locator('[data-scene-emphasis="prominent"]').first();
    await firstSceneHeader.getByRole('button', { name: 'Edit scene' }).click();
    const editSceneModal = page.getByRole('dialog', { name: 'Edit scene', exact: true });
    await expect(editSceneModal).toBeVisible();
    await visibleSceneTextArea(editSceneModal).fill('Welcome to the minimal PostgreSQL game.');
    await editSceneModal.getByRole('button', { name: 'Save' }).click();
    await waitForEditorCommit(page);
    await expect(scenesPanel.getByText('Welcome to the minimal PostgreSQL game.', { exact: true })).toBeVisible();

    const selectModal = await openAddSceneModal(page, scenesPanel);
    await selectModal.getByRole('radio', { name: 'SELECT query' }).check();
    await visibleSceneTextArea(selectModal).fill('List every item.');
    await expect(visibleSqlEditors(selectModal)).toHaveCount(1);
    await replaceEditorContents(
        page,
        visibleSqlEditors(selectModal).first(),
        'SELECT name FROM items ORDER BY id',
    );
    await selectModal.locator('#edit-select-scene-is-row-order-relevant').check();
    await selectModal.locator('#edit-select-scene-is-col-order-relevant').check();
    await selectModal.locator('#edit-select-scene-are-col-names-relevant').check();
    await selectModal.locator('#edit-select-scene-use-sql-placeholder').check();
    await expect(visibleSqlEditors(selectModal)).toHaveCount(2);
    await replaceEditorContents(page, visibleSqlEditors(selectModal).nth(1), 'SELECT');
    await selectModal.getByRole('button', { name: 'Add' }).click();
    await waitForEditorCommit(page);
    await expect(scenesPanel.getByText('List every item.', { exact: true })).toBeVisible();

    const manipulateModal = await openAddSceneModal(page, scenesPanel);
    await manipulateModal.getByRole('radio', { name: 'Manipulation' }).check();
    await visibleSceneTextArea(manipulateModal).fill('Collect the key.');
    await expect(visibleSqlEditors(manipulateModal)).toHaveCount(2);
    await replaceEditorContents(
        page,
        visibleSqlEditors(manipulateModal).nth(0),
        'UPDATE items SET collected = TRUE WHERE name = \'key\'',
    );
    await replaceEditorContents(
        page,
        visibleSqlEditors(manipulateModal).nth(1),
        'SELECT name, collected FROM items ORDER BY id',
    );
    await manipulateModal.locator('#edit-manipulate-scene-use-sql-placeholder').check();
    await expect(visibleSqlEditors(manipulateModal)).toHaveCount(3);
    await replaceEditorContents(page, visibleSqlEditors(manipulateModal).nth(2), 'UPDATE');
    await manipulateModal.getByRole('button', { name: 'Add' }).click();
    await waitForEditorCommit(page);
    await expect(scenesPanel.getByText('Collect the key.', { exact: true })).toBeVisible();

    const finalTextModal = await openAddSceneModal(page, scenesPanel);
    await visibleSceneTextArea(finalTextModal).fill('You finished the minimal PostgreSQL game.');
    await finalTextModal.getByRole('button', { name: 'Add' }).click();
    await waitForEditorCommit(page);
    await expect(scenesPanel.getByText('You finished the minimal PostgreSQL game.', { exact: true })).toBeVisible();
    await expect(scenesPanel.locator('[data-scene-emphasis="prominent"]')).toHaveCount(4);

    await title.getByLabel('Name:').fill('Minimal PostgreSQL Playthrough E2E');
    await title.getByLabel('Name:').press('Tab');
    await waitForEditorCommit(page);
    await page.getByText('Additional information', { exact: true }).click();
    await metadata.getByLabel('Teaser').fill('A minimal PostgreSQL game for the browser play-through test.');
    await metadata.getByLabel('Teaser').press('Tab');
    await waitForEditorCommit(page);
    await metadata.getByLabel('Copyright').fill('Test fixture');
    await metadata.getByLabel('Copyright').press('Tab');
    await waitForEditorCommit(page);

    await page.getByText('Database/SQL console', { exact: true }).click();
    const fileChooserPromise = page.waitForEvent('filechooser');
    await databasePanel.getByRole('button', { name: 'Open', exact: true }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
        name: 'minimal-postgresql-playthrough.sql',
        mimeType: 'text/plain',
        buffer: Buffer.from(initialSql),
    });
    await expect(databasePanel.getByText('Loaded', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(databasePanel.getByText('SQL', { exact: true })).toBeVisible();
    await expect(page.getByText('Results', { exact: true })).toBeVisible();
    await expect(page.getByText('Schema', { exact: true })).toBeVisible();
    const schemaPanel = page.getByTestId('game-editor-schema-panel');
    await expect(schemaPanel.getByText('items', { exact: true })).toBeVisible();

    const saveEventPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export game file' }).click();
    const savedFile = await saveEventPromise;
    expect(savedFile.suggestedFilename()).toBe('minimal_postgresql_playthrough.xml');
    const savedPath = await savedFile.path();
    if (savedPath === null) {
        throw new Error('The saved game has no local path');
    }
    else {
        const [actualXml, expectedXml] = await Promise.all([
            readFile(savedPath, 'utf8'),
            readFile(minimalGamePath, 'utf8'),
        ]);
        const parsedGames = await page.evaluate(async ({ actualSource, expectedSource }) => {
            const gameModulePath = '/src/game/xml/codec.ts';
            const xmlParserModulePath = '/src/game/xml/dom-parser.ts';
            const [{ xmlToGame }, { domXmlParser }] = await Promise.all([
                import(/* @vite-ignore */ gameModulePath),
                import(/* @vite-ignore */ xmlParserModulePath),
            ]);

            const parse = (source: string) => {
                const parsedXml = domXmlParser.parse(source);
                if (parsedXml.ok) {
                    const result = xmlToGame(parsedXml.data);
                    if (result.ok) {
                        return result.data;
                    }
                    else {
                        throw new Error(result.error.details);
                    }
                }
                else {
                    throw new Error(parsedXml.error.details);
                }
            };

            return {
                actual: parse(actualSource),
                expected: parse(expectedSource),
            };
        }, {
            actualSource: actualXml,
            expectedSource: expectedXml,
        });

        expect(parsedGames.actual).toEqual(parsedGames.expected);
    }

    const invalidDatabaseChooserPromise = page.waitForEvent('filechooser');
    await databasePanel.getByRole('button', { name: 'Open', exact: true }).click();
    const invalidDatabaseChooser = await invalidDatabaseChooserPromise;
    await invalidDatabaseChooser.setFiles({
        name: 'invalid.sql',
        mimeType: 'text/plain',
        buffer: Buffer.from('-- eskuel:system=postgresql\n-- eskuel:systemMinVersion=14.0.0\nThis is not SQL.'),
    });
    await expect(databasePanel.getByText('Failed to initialize database', { exact: false })).toBeVisible();
    await expect(page.getByText('Results', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Schema', { exact: true })).toHaveCount(0);
});
