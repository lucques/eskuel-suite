import {
    existsSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type PackageLock = {
    packages: Record<string, {
        dev?: boolean;
        optional?: boolean;
    }>;
};

type PackageManifest = {
    name: string;
    version: string;
    license?: unknown;
    licenses?: (string | { type?: unknown })[];
    repository?: string | { url?: unknown } | null;
    homepage?: unknown;
};

type PackageInfo = {
    key: string;
    license: string;
    name: string;
    packageDirectory: string;
    repository: string;
    version: string;
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(scriptDirectory, '..');
const packageLockPath = resolve(repositoryDirectory, 'package-lock.json');
const outputPath = resolve(repositoryDirectory, 'THIRD_PARTY_LICENSES');
const cc0Text = readFileSync(
    resolve(repositoryDirectory, 'licenses/CC0-1.0.txt'),
    'utf8',
).trim();

const missingLicenseFileOverrides = new Map([
    ['@nodable/entities@3.0.0', mitLicense('Copyright (c) 2026 Nodable')],
    ['dockview@6.6.1', mitLicense('Copyright (c) 2021 mathuo')],
    ['dockview-core@6.6.1', mitLicense('Copyright (c) 2021 mathuo')],
    ['dockview-react@6.6.1', mitLicense('Copyright (c) 2021 mathuo')],
    ['format@0.2.2', mitLicense('Copyright 2010 - 2014 Sami Samhuri <sami@samhuri.net>')],
    ['highlightjs-vue@1.0.0', [
        'The package metadata declares CC0-1.0.',
        'Author: Sara Lissette <lissette.ibnz@gmail.com> (https://github.com/LissetteIbnz)',
        '',
        cc0Text,
    ].join('\n')],
    ['html-parse-stringify@3.0.1', mitLicense('Copyright (c) Henrik Joreteg and contributors')],
    ['string-hash@1.1.3', [
        'To the extent possible by law, The Dark Sky Company, LLC has waived all copyright and related or neighboring rights to this library.',
        '',
        cc0Text,
    ].join('\n')],
    ['toggle-selection@1.0.6', mitLicense('Copyright (c) 2017 sudodoki <smd.deluzion@gmail.com>')],
]);

function mitLicense(copyrightNotice: string): string {
    return `MIT License

${copyrightNotice}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
}

function declaredLicense(manifest: PackageManifest): string {
    if (typeof manifest.license === 'string') {
        return manifest.license;
    }
    else if (Array.isArray(manifest.licenses)) {
        return manifest.licenses
            .map(license => typeof license === 'string' ? license : license.type)
            .filter(license => typeof license === 'string')
            .join(' OR ');
    }
    else {
        return 'UNKNOWN';
    }
}

function repositoryUrl(manifest: PackageManifest): string {
    const repository = manifest.repository;
    if (typeof repository === 'string') {
        return repository;
    }
    else if (repository !== null && typeof repository === 'object' && typeof repository.url === 'string') {
        return repository.url;
    }
    else if (typeof manifest.homepage === 'string') {
        return manifest.homepage;
    }
    else {
        return 'Not specified';
    }
}

function licenseFilenames(packageDirectory: string): string[] {
    return readdirSync(packageDirectory, { withFileTypes: true })
        .filter(entry => entry.isFile() && /^(licen[cs]e|copying|notice)(?:$|[._-])/i.test(entry.name))
        .map(entry => entry.name)
        .sort((left, right) => left.localeCompare(right));
}

function generateNotices(): string {
    const packageLock: PackageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'));
    const packages = new Map<string, PackageInfo>();

    for (const [packagePath, lockEntry] of Object.entries(packageLock.packages)) {
        if (packagePath === '' || lockEntry.dev === true) {
            continue;
        }
        else {
            const packageDirectory = resolve(repositoryDirectory, packagePath);
            const manifestPath = resolve(packageDirectory, 'package.json');
            if (!existsSync(manifestPath)) {
                if (lockEntry.optional === true) {
                    continue;
                }
                else {
                    throw new Error(`Installed production package is missing: ${packagePath}`);
                }
            }
            else {
                const manifest: PackageManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
                const packageKey = `${manifest.name}@${manifest.version}`;
                if (!packages.has(packageKey)) {
                    packages.set(packageKey, {
                        key: packageKey,
                        license: declaredLicense(manifest),
                        name: manifest.name,
                        packageDirectory,
                        repository: repositoryUrl(manifest),
                        version: manifest.version,
                    });
                }
            }
        }
    }

    const sections = [];
    const sortedPackages = [...packages.values()].sort((left, right) => left.key.localeCompare(right.key));
    for (const packageInfo of sortedPackages) {
        const filenames = licenseFilenames(packageInfo.packageDirectory);
        let notice;
        if (filenames.length > 0) {
            notice = filenames.map(filename => {
                const contents = readFileSync(resolve(packageInfo.packageDirectory, filename), 'utf8').trim();
                return filenames.length === 1
                    ? contents
                    : `--- ${filename} ---\n\n${contents}`;
            }).join('\n\n');
        }
        else {
            const override = missingLicenseFileOverrides.get(packageInfo.key);
            if (override === undefined) {
                throw new Error(
                    `${packageInfo.key} has no packaged license/notice file. Review it and add a version-pinned override.`,
                );
            }
            else {
                notice = override;
            }
        }

        if (packageInfo.license === 'UNKNOWN') {
            throw new Error(`${packageInfo.key} has no declared license.`);
        }
        else {
            sections.push([
                '================================================================================',
                `${packageInfo.name} ${packageInfo.version}`,
                `Declared license: ${packageInfo.license}`,
                `Source: ${packageInfo.repository}`,
                '================================================================================',
                '',
                notice,
            ].join('\n'));
        }
    }

    return [
        'THIRD-PARTY SOFTWARE NOTICES AND LICENSES',
        '',
        'This file is generated from the installed production dependency tree recorded in package-lock.json.',
        'It contains license and notice files shipped by those packages, plus reviewed fallbacks for packages that omit a standalone license file from their npm distribution.',
        '',
        ...sections,
        '',
    ].join('\n');
}

const generatedNotices = generateNotices();
if (process.argv.includes('--check')) {
    if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== generatedNotices) {
        console.error('THIRD_PARTY_LICENSES is missing or stale. Run npm run licenses:generate.');
        process.exitCode = 1;
    }
}
else {
    writeFileSync(outputPath, generatedNotices);
}
