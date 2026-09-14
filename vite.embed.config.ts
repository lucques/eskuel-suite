import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
    plugins: [react()],
    worker: {
        format: 'es',
    },
    build: {
        assetsInlineLimit: 0,
        copyPublicDir: false,
        cssCodeSplit: false,
        outDir: 'dist/embed',
        rollupOptions: {
            input: resolve(__dirname, 'src/embed.ts'),
            preserveEntrySignatures: 'exports-only',
            output: {
                assetFileNames: asset => asset.names.some(name => name.endsWith('.css'))
                    ? 'eskuel-suite.css'
                    : 'assets/[name]-[hash][extname]',
                chunkFileNames: 'chunks/[name]-[hash].js',
                entryFileNames: 'eskuel-suite.js',
            },
        },
    },
});
