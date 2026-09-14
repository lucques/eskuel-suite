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
                'fflate',
                'sql.js',
            ],
            output: {
                banner: '#!/usr/bin/env node',
                entryFileNames: 'eskueldb.mjs',
                format: 'es',
            },
        },
        ssr: resolve(__dirname, 'eskueldb.ts'),
        target: 'node18',
    },
});
