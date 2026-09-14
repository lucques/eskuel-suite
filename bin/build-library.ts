import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcssGlobalData from '@csstools/postcss-global-data';
import postcss from 'postcss';
import postcssCustomMedia from 'postcss-custom-media';
import { rollup } from 'rollup';
import { dts } from 'rollup-plugin-dts';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist/library');
const config = ts.readConfigFile(resolve(root, 'tsconfig.library.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = [
    ...(config.error === undefined ? [] : [config.error]),
    ...parsed.errors,
    ...ts.getPreEmitDiagnostics(program),
];

if (diagnostics.length > 0) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: filename => filename,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
    }));
}
else {
    await rm(output, { recursive: true, force: true });
    const emitted = program.emit();
    if (emitted.emitSkipped) {
        throw new Error('Could not emit the browser library');
    }
    else {
        // Resolve Eskuel's custom media queries before another project's CSS pipeline runs.
        const css = postcss([
            postcssGlobalData({ files: [resolve(root, 'src/media-queries.css')] }),
            postcssCustomMedia(),
        ]);
        for (const entry of await readdir(resolve(root, 'src'), { recursive: true })) {
            if (entry.endsWith('.css')) {
                const source = resolve(root, 'src', entry);
                const destination = resolve(output, 'src', entry);
                const result = await css.process(await readFile(source, 'utf8'), { from: source, to: destination });
                await mkdir(dirname(destination), { recursive: true });
                await writeFile(destination, result.css);
            }
        }

        const declarations = await rollup({
            input: resolve(output, 'src/index.d.ts'),
            plugins: [dts()],
        });
        try {
            await declarations.write({ file: resolve(output, 'eskuel-suite.d.ts'), format: 'es' });
        }
        finally {
            await declarations.close();
        }

        await writeFile(resolve(output, 'style.css.d.ts'), 'export {};\n');
        await mkdir(resolve(root, 'dist/embed'), { recursive: true });
        await cp(resolve(output, 'eskuel-suite.d.ts'), resolve(root, 'dist/embed/eskuel-suite.d.ts'));
        await cp(resolve(output, 'style.css.d.ts'), resolve(root, 'dist/embed/eskuel-suite.css.d.ts'));
    }
}
