import { expect, test } from './fixtures';

for (const layout of ['Desktop', 'Mobile'] as const) {
    test(`reorders a long scene list with keyboard and pointer after resizing the ${layout} layout`, async ({ page }) => {
        const dragWarnings: string[] = [];
        page.on('console', message => {
            if (message.text().includes('@hello-pangea/dnd')) {
                dragWarnings.push(message.text());
            }
        });
        const sceneTexts = Array.from({ length: 12 }, (_, index) => `Scene ${index + 1}`);
        const gameXml = `<?xml version='1.0' encoding='UTF-8'?>
<game format-version='2' db-system='sqlite' db-system-min-version='3.0.0'>
    <head>
        <title>Long scene list</title>
        <teaser>Scene reordering test</teaser>
        <copyright>Test fixture</copyright>
    </head>
    <scenes>
        ${sceneTexts.map(text => `<text-scene><text>${text}</text></text-scene>`).join('\n        ')}
    </scenes>
</game>`;

        await page.goto('/game-editor/');
        await expect(page.getByLabel('Name:', { exact: true })).toHaveValue('Default E2E Game');
        await page.getByRole('button', { name: 'Open game' }).click();
        const openDialog = page.getByRole('dialog', { name: 'Open game', exact: true });
        await openDialog.locator('input[type="file"]').setInputFiles({
            name: 'long-scenes.xml',
            mimeType: 'application/xml',
            buffer: Buffer.from(gameXml),
        });
        await openDialog.getByRole('button', { name: 'Open', exact: true }).click();
        const scenesPanel = page.locator('[data-testid="game-editor-scenes-panel"]:visible');
        await expect(scenesPanel.getByText('Scene 1', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Switch layout', exact: true }).click();
        await page.getByRole('button', { name: new RegExp(`${layout}$`) }).press('Enter');
        await page.setViewportSize({ width: 1000, height: 700 });
        const divider = page.locator('.dv-sash.dv-enabled:visible').first();
        const dividerBounds = await divider.boundingBox();
        if (dividerBounds === null) {
            throw new Error('The panel divider is unavailable');
        }
        else {
            const x = dividerBounds.x + dividerBounds.width / 2;
            const y = dividerBounds.y + dividerBounds.height / 2;
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(
                x + (layout === 'Desktop' ? -100 : 0),
                y + (layout === 'Mobile' ? -60 : 0),
                { steps: 10 },
            );
            await page.mouse.up();
        }

        const announcements = page.locator('[aria-live="assertive"][id^="rfd-announcement-"]');
        const handles = scenesPanel.getByRole('button', { name: 'Reorder scene', exact: true });
        await handles.first().focus();
        await page.keyboard.press('Space');
        for (let position = 2; position <= sceneTexts.length; position++) {
            await page.keyboard.press('ArrowDown');
            await expect(announcements).toContainText([new RegExp(`from position 1\\s+to position ${position}\\b`)]);
        }
        await page.keyboard.press('Space');
        await expect(scenesPanel.getByText(/^Scene \d+$/)).toHaveText([...sceneTexts.slice(1), sceneTexts[0]]);

        await handles.first().scrollIntoViewIfNeeded();
        const handleBounds = await handles.first().boundingBox();
        const panelBounds = await scenesPanel.boundingBox();
        if (handleBounds === null || panelBounds === null) {
            throw new Error('The scene drag handle or panel is unavailable');
        }
        else {
            const x = handleBounds.x + 30;
            const y = handleBounds.y + handleBounds.height / 2;
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x, y + 10, { steps: 5 });
            await page.mouse.move(x, panelBounds.y + panelBounds.height - 8, { steps: 10 });
            await expect(announcements).toContainText([new RegExp(`from position 1\\s+to position ${sceneTexts.length}\\b`)]);
            await page.mouse.up();
        }
        await expect(scenesPanel.getByText(/^Scene \d+$/)).toHaveText([...sceneTexts.slice(2), sceneTexts[0], sceneTexts[1]]);
        expect(dragWarnings).toEqual([]);
    });
}
