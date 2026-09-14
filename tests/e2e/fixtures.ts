import { fileURLToPath } from 'node:url';

import { expect, test as base } from '@playwright/test';

const port = process.env.E2E_PORT;

const defaultGamePath = fileURLToPath(
    new URL('./fixtures/games/valid/default.xml', import.meta.url),
);
const defaultDatabasePath = fileURLToPath(
    new URL('./fixtures/databases/default.sqlite.sql', import.meta.url),
);

if (port === undefined) {
    throw new Error('Playwright did not capture the Vite E2E server port');
}

export const test = base.extend({
    baseURL: `http://127.0.0.1:${port}`,
    context: async ({ context }, run) => {
        await context.route(/\/res\/(?:dbs|games)\//, async route => {
            const pathname = new URL(route.request().url()).pathname;
            if (pathname.endsWith('.xml')) {
                await route.fulfill({
                    contentType: 'application/xml',
                    path: defaultGamePath,
                });
            }
            else if (pathname.endsWith('.sql')) {
                await route.fulfill({
                    contentType: 'text/plain',
                    path: defaultDatabasePath,
                });
            }
            else {
                await route.abort();
            }
        });
        await run(context);
    },
});

export { expect };
