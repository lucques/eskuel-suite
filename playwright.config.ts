import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    expect: {
        timeout: 20_000,
    },
    reporter: [
        [process.env.CI ? 'line' : 'list'],
        ['html', {
            outputFolder: 'test-artifacts/playwright/report',
            open: 'never',
        }],
        ['junit', {
            outputFile: 'test-artifacts/playwright/junit.xml',
        }],
    ],
    outputDir: 'test-artifacts/playwright/results',
    use: {
        headless: true,
        locale: 'en-US',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'npm exec vite -- --mode e2e --host 127.0.0.1 --port 4173',
        wait: {
            stdout: /Local:\s+http:\/\/127\.0\.0\.1:(?<e2e_port>\d+)\//,
        },
        stdout: 'pipe',
        timeout: 120_000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
