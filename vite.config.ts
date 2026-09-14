import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
    return {
        plugins: [react()],
        optimizeDeps: {
            // Worker imports are discovered after startup unless explicitly included.
            include: ['sql.js'],
            exclude: ['@electric-sql/pglite'],
        },
        worker: {
            format: 'es',
        },
        server: {
            open: mode === 'e2e' ? false : '/',
            watch: {
                ignored: ['**/test-artifacts/**'],
            },
        },
        build: {
            rollupOptions: {
                input: {
                    index:       resolve(__dirname, 'index.html'),
                    browser:     resolve(__dirname, 'browser/index.html'),
                    gameConsole: resolve(__dirname, 'game-console/index.html'),
                    gameEditor:  resolve(__dirname, 'game-editor/index.html'),
                },
            },
        },
    };
});
