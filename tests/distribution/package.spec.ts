import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { build, preview } from 'vite';
import type { PreviewServer } from 'vite';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
let directory: string;
let server: PreviewServer | undefined;
let baseUrl: string;

test.beforeAll(async () => {
    test.setTimeout(300_000);
    directory = await mkdtemp(join(tmpdir(), 'eskuel-distribution-'));
    await execute('npm', ['pack', '--pack-destination', directory, '--json'], {
        cwd: root,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 240_000,
    });

    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const consumer = join(directory, 'consumer');
    const modules = join(consumer, 'node_modules');
    const installed = join(modules, 'eskuel-suite');
    await mkdir(installed, { recursive: true });
    await execute('tar', ['-xzf', join(directory, `eskuel-suite-${manifest.version}.tgz`),
        '-C', installed, '--strip-components=1']);

    // Reuse installed dependencies, while resolving Eskuel exclusively from the tarball.
    for (const entry of await readdir(join(root, 'node_modules'))) {
        if (entry !== 'eskuel-suite' && !entry.startsWith('.')) {
            await symlink(join(root, 'node_modules', entry), join(modules, entry), 'junction');
        }
    }
    const packagedFiles = await readdir(installed);
    expect(packagedFiles).not.toContain('tests');
    expect(packagedFiles).not.toContain('.vscode');
    expect(packagedFiles).not.toContain('AGENTS.md');
    expect(packagedFiles).not.toContain('bin');

    await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    await cp(join(root, 'tests/distribution/fixtures/consumer-types.ts.txt'), join(consumer, 'types.ts'));
    for (const resolution of ['bundler', 'nodenext']) {
        await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({
            compilerOptions: {
                strict: true,
                noEmit: true,
                noUncheckedSideEffectImports: true,
                skipLibCheck: false,
                module: resolution === 'bundler' ? 'esnext' : 'nodenext',
                moduleResolution: resolution,
                lib: ['ES2022', 'DOM'],
                types: [],
            },
            files: ['types.ts'],
        }));
        await execute(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', consumer]);
    }

    for (const command of ['eskueldb', 'eskuelgame', 'eskuel-play', 'eskuel-review']) {
        const result = await execute(process.execPath, [join(installed, 'dist-cli', `${command}.mjs`), '--help']);
        expect(result.stdout).toContain('Usage:');
    }
    await execute(process.execPath, [join(installed, 'dist-cli/eskuel-review.mjs'),
        join(installed, 'spec/game-xml/v2/minimal.xml'), '--summary', '--json']);

    const main = await readFile(join(root, 'tests/distribution/fixtures/main.js'), 'utf8');
    await writeFile(join(consumer, 'main.js'), main);
    await writeFile(join(consumer, 'index.html'), pageHtml('/main.js'));
    const publicDirectory = join(consumer, 'public');
    await mkdir(publicDirectory, { recursive: true });
    await cp(join(installed, 'dist/embed'), join(publicDirectory, 'embed'), { recursive: true });
    await writeFile(join(publicDirectory, 'native.js'), main.replace('from \'eskuel-suite\'', 'from \'./embed/eskuel-suite.js\''));
    await writeFile(join(publicDirectory, 'native.html'), pageHtml('/native.js', '/embed/eskuel-suite.css'));
    for (const [system, version] of Object.entries({ sqlite: '3.0.0', postgresql: '14.0.0' })) {
        await writeFile(join(publicDirectory, `${system}.sql`), `-- eskuel:system=${system}\n-- eskuel:systemMinVersion=${version}\nCREATE TABLE items (name TEXT);\nINSERT INTO items VALUES ('${system} package result');`);
    }
    await writeFile(join(publicDirectory, 'game.xml'), `<?xml version="1.0"?>
<game format-version="2" db-system="sqlite" db-system-min-version="3.0.0">
    <head><title>Distribution game</title><teaser>Package smoke test</teaser><copyright>Test fixture</copyright></head>
    <scenes><text-scene><text>Game loaded from the package.</text></text-scene></scenes>
    <initial-sql-script>CREATE TABLE items (name TEXT);</initial-sql-script>
</game>`);

    await build({
        root: consumer,
        configFile: false,
        logLevel: 'error',
        optimizeDeps: { exclude: ['eskuel-suite', '@electric-sql/pglite'] },
        worker: { format: 'es' },
        build: { minify: false },
    });
    server = await preview({ root: consumer, configFile: false, preview: { host: '127.0.0.1', port: 0 } });
    const address = server.httpServer.address();
    if (address === null || typeof address === 'string') {
        throw new Error('The distribution preview server did not bind a TCP port');
    }
    else {
        baseUrl = `http://127.0.0.1:${address.port}`;
    }
});

test.afterAll(async () => {
    if (server !== undefined) {
        await new Promise<void>((resolveClosed, reject) => {
            server?.httpServer.close(error => error === undefined ? resolveClosed() : reject(error));
        });
    }
    if (directory !== undefined) {
        await rm(directory, { recursive: true, force: true });
    }
});

for (const entry of ['/', '/native.html']) {
    for (const system of ['sqlite', 'postgresql']) {
        test(`${entry} executes ${system} through the packaged worker and database assets`, async ({ page }) => {
            const failures: string[] = [];
            page.on('pageerror', error => failures.push(error.message));
            await page.goto(`${baseUrl}${entry}?app=browser&system=${system}`);
            await expect(page.getByRole('button', { name: 'Execute', exact: true })).toBeEnabled();
            const sql = 'SELECT name FROM items';
            await page.evaluate(value => navigator.clipboard.writeText(value), sql);
            const editor = page.getByRole('textbox', { name: 'Editor content' });
            await editor.focus();
            await page.keyboard.press('ControlOrMeta+A');
            await page.keyboard.press('ControlOrMeta+V');
            await expect(editor).toHaveValue(sql);
            await page.getByRole('button', { name: 'Execute', exact: true }).click();
            await expect(page.getByRole('cell', { name: `${system} package result`, exact: true })).toBeVisible();
            expect(failures).toEqual([]);
        });
    }

    test(`${entry} loads the packaged Game Console`, async ({ page }) => {
        await page.goto(`${baseUrl}${entry}?app=console`);
        await expect(page.getByText('Game loaded from the package.', { exact: true })).toBeVisible();
    });

    test(`${entry} loads the packaged Game Editor`, async ({ page }) => {
        await page.goto(`${baseUrl}${entry}?app=editor`);
        await expect(page.locator('input[value="Distribution game"]')).toBeVisible();
    });
}

function pageHtml(script: string, stylesheet?: string): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Distribution consumer</title>
${stylesheet === undefined ? '' : `<link rel="stylesheet" href="${stylesheet}">`}</head>
<body><div id="root"></div><script type="module" src="${script}"></script></body></html>`;
}
