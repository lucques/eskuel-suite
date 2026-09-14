import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        copyPublicDir: false,
        emptyOutDir: false,
        minify: false,
        outDir: resolve(__dirname, '../dist-cli'),
        ssr: true,
        target: 'node18',
        rollupOptions: {
            input: {
                'eskuel-play': resolve(__dirname, 'eskuel-play.ts'),
                'eskuel-review': resolve(__dirname, 'eskuel-review.ts'),
                'game-database-worker': resolve(__dirname, 'game-cli/database.worker.ts'),
            },
            output: {
                banner: '#!/usr/bin/env node',
                entryFileNames: '[name].mjs',
                chunkFileNames: 'chunks/[name]-[hash].mjs',
                format: 'es',
            },
        },
    },
});
