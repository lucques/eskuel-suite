import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        copyPublicDir: false,
        emptyOutDir: false,
        minify: false,
        outDir: resolve(__dirname, '../dist-cli'),
        rollupOptions: {
            external: [
                'effect',
                'fast-xml-parser',
                'fflate',
                'sql.js',
            ],
            output: {
                banner: '#!/usr/bin/env node',
                entryFileNames: 'eskuelgame.mjs',
                format: 'es',
            },
        },
        ssr: resolve(__dirname, 'eskuelgame.ts'),
        target: 'node18',
    },
});
