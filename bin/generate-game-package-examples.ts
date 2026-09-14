import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import type { Zippable, ZipOptions } from 'fflate';
import type { GamePackageDescriptor } from '../src/game/package.ts';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplesDirectory = resolve(repositoryDirectory, 'spec/game-package/v1/examples');
const exampleNames = [
    'pokemon-adventure',
    'pokemon-adventure-postgresql',
];
const compressedOptions: ZipOptions = {
    attrs: 0o100644 << 16,
    level: 9,
    mtime: new Date(1980, 0, 1, 0, 0, 0),
    os: 3,
};
const storedOptions: ZipOptions = { ...compressedOptions, level: 0 };

for (const exampleName of exampleNames) {
    const directory = resolve(examplesDirectory, exampleName);
    const descriptorPath = resolve(directory, 'datapackage.json');
    const descriptor: GamePackageDescriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
    const resources = [];
    for (const resource of descriptor.resources) {
        const bytes = new Uint8Array(await readFile(resolvePortablePath(directory, resource.path)));
        resource.bytes = bytes.byteLength;
        resource.hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        resources.push({ path: resource.path, bytes });
    }
    const descriptorBytes = new TextEncoder().encode(`${JSON.stringify(descriptor, null, 4)}\n`);
    await writeFile(descriptorPath, descriptorBytes);

    const entries: Zippable = {
        'datapackage.json': [descriptorBytes, compressedOptions],
    };
    for (const resource of resources) {
        entries[resource.path] = [
            resource.bytes,
            resource.path === 'dependencies/database.eskueldb' ? storedOptions : compressedOptions,
        ];
    }
    const auxiliaryPaths = [
        ...descriptor.licenses.map(license => license.path),
        ...(descriptor.notices ?? []).map(notice => notice.path),
        ...(descriptor.provenance === undefined ? [] : [descriptor.provenance.path]),
    ];
    for (const path of auxiliaryPaths) {
        entries[path] = [new Uint8Array(await readFile(resolvePortablePath(directory, path))), compressedOptions];
    }
    const outputPath = resolve(examplesDirectory, `${basename(directory)}.eskuelgame`);
    await writeFile(outputPath, zipSync(entries));
}

function resolvePortablePath(base: string, path: string): string {
    return resolve(base, ...path.split('/'));
}
