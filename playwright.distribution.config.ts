import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/distribution',
    workers: 1,
    maxFailures: 1,
    timeout: 30_000,
    expect: { timeout: 20_000 },
    reporter: 'list',
    outputDir: 'test-artifacts/distribution',
    use: {
        headless: true,
        locale: 'en-US',
        permissions: ['clipboard-read', 'clipboard-write'],
    },
});
