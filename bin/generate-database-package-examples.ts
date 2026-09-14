import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import type { Zippable, ZipOptions } from 'fflate';
import type { DatabasePackageDescriptor } from '../src/database/package.ts';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplesDirectory = resolve(repositoryDirectory, 'spec/database-package/v1/examples');
const exampleNames = [
    'database-file',
    'initial-sql-script',
    'postgresql-initial-sql-script',
];
const zipOptions: ZipOptions = {
    attrs: 0o100644 << 16,
    level: 9,
    mtime: new Date(1980, 0, 1, 0, 0, 0),
    os: 3,
};

for (const exampleName of exampleNames) {
    const directory = resolve(examplesDirectory, exampleName);
    const descriptorPath = resolve(directory, 'datapackage.json');
    const descriptor: DatabasePackageDescriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
    const resource = descriptor.resources[0];
    const resourceBytes = new Uint8Array(await readFile(resolvePortablePath(directory, resource.path)));
    resource.bytes = resourceBytes.byteLength;
    resource.hash = `sha256:${createHash('sha256').update(resourceBytes).digest('hex')}`;
    const descriptorBytes = new TextEncoder().encode(`${JSON.stringify(descriptor, null, 4)}\n`);
    await writeFile(descriptorPath, descriptorBytes);

    const entries: Zippable = {
        'datapackage.json': [descriptorBytes, zipOptions],
        [resource.path]: [resourceBytes, zipOptions],
    };
    const auxiliaryPaths = [
        ...descriptor.licenses.map(license => license.path),
        ...(descriptor.notices ?? []).map(notice => notice.path),
        ...(descriptor.provenance === undefined ? [] : [descriptor.provenance.path]),
    ];
    for (const path of auxiliaryPaths) {
        entries[path] = [new Uint8Array(await readFile(resolvePortablePath(directory, path))), zipOptions];
    }
    const outputPath = resolve(examplesDirectory, `${basename(directory)}.eskueldb`);
    await writeFile(outputPath, zipSync(entries));
}

function resolvePortablePath(base: string, path: string): string {
    return resolve(base, ...path.split('/'));
}
