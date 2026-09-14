/// <reference types='@vitest/browser/providers/playwright' />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        exclude: ['@electric-sql/pglite'],
        include: [
            '@hello-pangea/dnd',
            '@monaco-editor/react',
            'classnames',
            'dockview-core',
            'dockview-react',
            'effect',
            'he',
            'i18next',
            'i18next-browser-languagedetector',
            'lodash',
            'monaco-editor',
            'react-bootstrap',
            'react-i18next',
            'react-dom/client',
            'react-syntax-highlighter',
            'react-syntax-highlighter/dist/esm/styles/prism',
            'react/jsx-dev-runtime',
            'sql.js',
            'string-hash',
            'vitest-browser-react',
        ],
    },
    test: {
        globals: false,
        reporters: ['default', 'html', 'junit'],
        outputFile: {
            html: 'test-artifacts/vitest/report/index.html',
            junit: 'test-artifacts/vitest/junit.xml',
        },
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    environment: 'node',
                    include: ['src/**/*.test.{ts,tsx}'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'component',
                    include: ['tests/component/**/*.test.tsx'],
                    browser: {
                        enabled: true,
                        provider: 'playwright',
                        headless: true,
                        screenshotDirectory: 'test-artifacts/vitest/screenshots/component',
                        instances: [{ browser: 'chromium' }],
                    },
                },
            },
            {
                extends: true,
                test: {
                    name: 'integration-node',
                    environment: 'node',
                    include: ['tests/integration/node/**/*.test.{ts,tsx}'],
                    poolOptions: {
                        forks: {
                            singleFork: true,
                        },
                    },
                },
            },
            {
                extends: true,
                test: {
                    name: 'integration-webbrowser',
                    include: ['tests/integration/webbrowser/**/*.test.{ts,tsx}'],
                    browser: {
                        enabled: true,
                        fileParallelism: false,
                        provider: 'playwright',
                        headless: true,
                        screenshotDirectory: 'test-artifacts/vitest/screenshots/integration/webbrowser',
                        instances: [{ browser: 'chromium' }],
                    },
                },
            },
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            reportsDirectory: 'test-artifacts/coverage',
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/**/*.test.{ts,tsx}',
                'src/**/main.tsx',
                'src/vite-env.d.ts',
                'src/custom.d.ts',
            ],
        },
    },
});
