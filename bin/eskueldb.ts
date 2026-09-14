import {
    chmod,
    link,
    mkdir,
    readFile,
    rename,
    stat,
    unlink,
    writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import initSqlJs from 'sql.js';

import {
    createDatabasePackage,
    DEFAULT_DATABASE_PACKAGE_BYTES,
    DEFAULT_DATABASE_RESOURCE_BYTES,
    parseDatabasePackageRecipe,
} from '../src/database/package-authoring';
import type { DatabasePackageRecipe } from '../src/database/package-authoring';
import {
    MAX_DATABASE_PACKAGE_AUXILIARY_FILE_BYTES,
    readDatabasePackage,
} from '../src/database/package';
import type {
    DatabasePackageContents,
    DatabasePackageDescriptor,
} from '../src/database/package';

const USAGE = `Usage:
  eskueldb pack <recipe.json> <artifact> <output.eskueldb> [--overwrite]
  eskueldb validate <package.eskueldb> [--deep]
  eskueldb inspect <package.eskueldb> [--json]

Commands:
  pack      Create a deterministic package and validate it before writing.
  validate  Validate the complete package contract; --deep also checks SQLite integrity.
  inspect   Validate the package and print a summary or its descriptor as JSON.
`;

async function main(args: string[]): Promise<void> {
    const command = args[0];
    if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
        process.stdout.write(USAGE);
    }
    else if (command === 'pack') {
        await packCommand(args.slice(1));
    }
    else if (command === 'validate') {
        await validateCommand(args.slice(1));
    }
    else if (command === 'inspect') {
        await inspectCommand(args.slice(1));
    }
    else {
        throw new Error(`Unknown command '${command}'\n\n${USAGE}`);
    }
}

async function packCommand(args: string[]): Promise<void> {
    const overwrite = args.includes('--overwrite');
    const positional = positionalArguments(args, ['--overwrite']);
    if (positional.length !== 3) {
        throw new Error(`pack requires a recipe, artifact, and output path\n\n${USAGE}`);
    }
    const [recipePath, artifactPath, outputPath] = positional.map(path => resolve(path));
    requireExtension(outputPath, '.eskueldb', 'Output');

    const recipe = await readRecipe(recipePath);
    const artifactBytes = await readLimitedRegularFile(
        artifactPath,
        DEFAULT_DATABASE_RESOURCE_BYTES,
        'Database artifact',
    );
    const packageFiles = await readPackageFiles(recipe, dirname(recipePath));
    const archive = await createDatabasePackage(recipe, artifactBytes, packageFiles);
    await writePackageAtomically(outputPath, archive, overwrite);
    process.stdout.write(`Created ${outputPath} (${archive.byteLength} bytes)\n`);
}

async function validateCommand(args: string[]): Promise<void> {
    const deep = args.includes('--deep');
    const positional = positionalArguments(args, ['--deep']);
    if (positional.length !== 1) {
        throw new Error(`validate requires one package path\n\n${USAGE}`);
    }
    const packagePath = resolve(positional[0]);
    const { archive, contents } = await readValidatedPackage(packagePath);
    if (deep && contents.data.type === 'sqlite-db') {
        await validateSqliteIntegrity(contents.data.data);
    }
    process.stdout.write(
        `Valid ${packagePath}: ${contents.descriptor.name} ${contents.descriptor.version}, ${archive.byteLength} bytes\n`,
    );
}

async function inspectCommand(args: string[]): Promise<void> {
    const json = args.includes('--json');
    const positional = positionalArguments(args, ['--json']);
    if (positional.length !== 1) {
        throw new Error(`inspect requires one package path\n\n${USAGE}`);
    }
    const packagePath = resolve(positional[0]);
    const { archive, contents } = await readValidatedPackage(packagePath);
    if (json) {
        process.stdout.write(`${JSON.stringify(contents.descriptor, null, 4)}\n`);
    }
    else {
        process.stdout.write(formatPackageSummary(contents.descriptor, archive.byteLength));
    }
}

function positionalArguments(args: string[], allowedOptions: string[]): string[] {
    const allowed = new Set(allowedOptions);
    const unknown = args.find(arg => arg.startsWith('-') && !allowed.has(arg));
    if (unknown !== undefined) {
        throw new Error(`Unknown option '${unknown}'`);
    }
    return args.filter(arg => !allowed.has(arg));
}

async function readRecipe(path: string): Promise<DatabasePackageRecipe> {
    let candidate: unknown;
    try {
        candidate = JSON.parse(await readFile(path, 'utf8'));
    }
    catch (error: unknown) {
        throw new Error(`Could not read recipe '${path}': ${String(error)}`);
    }
    try {
        return parseDatabasePackageRecipe(candidate);
    }
    catch (error: unknown) {
        throw new Error(`Invalid recipe '${path}': ${String(error)}`);
    }
}

async function readPackageFiles(
    recipe: DatabasePackageRecipe,
    recipeDirectory: string,
): Promise<Map<string, Uint8Array>> {
    const files = new Map<string, Uint8Array>();
    for (const license of recipe.licenses) {
        const inputPath = resolvePortablePath(recipeDirectory, license.inputPath);
        const bytes = await readLimitedRegularFile(inputPath, 256 * 1024, 'License input');
        files.set(license.path, bytes);
    }
    for (const notice of recipe.notices ?? []) {
        const inputPath = resolvePortablePath(recipeDirectory, notice.inputPath);
        const bytes = await readLimitedRegularFile(
            inputPath,
            MAX_DATABASE_PACKAGE_AUXILIARY_FILE_BYTES,
            'Notice input',
        );
        files.set(notice.path, bytes);
    }
    if (recipe.provenance !== undefined) {
        const inputPath = resolvePortablePath(recipeDirectory, recipe.provenance.inputPath);
        const bytes = await readLimitedRegularFile(
            inputPath,
            MAX_DATABASE_PACKAGE_AUXILIARY_FILE_BYTES,
            'Provenance input',
        );
        files.set(recipe.provenance.path, bytes);
    }
    return files;
}

async function readValidatedPackage(path: string): Promise<{
    archive: Uint8Array;
    contents: DatabasePackageContents;
}> {
    requireExtension(path, '.eskueldb', 'Package');
    const archive = await readLimitedRegularFile(
        path,
        DEFAULT_DATABASE_PACKAGE_BYTES,
        'Database package',
    );
    const result = await readDatabasePackage(archive, DEFAULT_DATABASE_RESOURCE_BYTES);
    if (!result.ok) {
        throw new Error(result.error.kind === 'file-size-too-large'
            ? `Package exceeds an Eskuel Suite implementation limit: ${path}`
            : `Invalid database package '${path}': ${result.error.details}`);
    }
    return { archive, contents: result.data };
}

async function readLimitedRegularFile(path: string, maxBytes: number, label: string): Promise<Uint8Array> {
    let details;
    try {
        details = await stat(path);
    }
    catch (error: unknown) {
        throw new Error(`${label} does not exist or cannot be read: ${path}: ${String(error)}`);
    }
    if (!details.isFile()) {
        throw new Error(`${label} is not a regular file: ${path}`);
    }
    else if (details.size > maxBytes) {
        throw new Error(`${label} exceeds the ${maxBytes}-byte limit: ${path}`);
    }
    const bytes = new Uint8Array(await readFile(path));
    if (bytes.byteLength > maxBytes) {
        throw new Error(`${label} grew beyond the ${maxBytes}-byte limit while being read: ${path}`);
    }
    return bytes;
}

async function writePackageAtomically(path: string, bytes: Uint8Array, overwrite: boolean): Promise<void> {
    const directory = dirname(path);
    await mkdir(directory, { recursive: true });
    const temporaryPath = join(directory, `.${basename(path)}-${process.pid}-${randomUUID()}.tmp`);
    try {
        await writeFile(temporaryPath, bytes, { flag: 'wx', mode: 0o600 });
        await chmod(temporaryPath, 0o644);
        if (overwrite) {
            await rename(temporaryPath, path);
        }
        else {
            try {
                await link(temporaryPath, path);
            }
            catch (error: unknown) {
                if (isNodeError(error, 'EEXIST')) {
                    throw new Error(`Output already exists; pass --overwrite to replace it: ${path}`);
                }
                else {
                    throw error;
                }
            }
        }
    }
    finally {
        await unlink(temporaryPath).catch(error => {
            if (!isNodeError(error, 'ENOENT')) {
                throw error;
            }
        });
    }
}

async function validateSqliteIntegrity(bytes: Uint8Array): Promise<void> {
    const SQL = await initSqlJs();
    const database = new SQL.Database(bytes);
    try {
        const integrityResult = database.exec('PRAGMA integrity_check');
        const integrityValues = integrityResult.flatMap(result => result.values)
            .map(row => row[0]);
        if (integrityValues.length !== 1 || integrityValues[0] !== 'ok') {
            throw new Error(`SQLite integrity_check failed: ${JSON.stringify(integrityValues.slice(0, 10))}`);
        }
        const foreignKeyResult = database.exec('PRAGMA foreign_key_check');
        const foreignKeyErrors = foreignKeyResult.flatMap(result => result.values);
        if (foreignKeyErrors.length !== 0) {
            throw new Error(`SQLite foreign_key_check failed: ${JSON.stringify(foreignKeyErrors.slice(0, 10))}`);
        }
    }
    finally {
        database.close();
    }
}

function formatPackageSummary(descriptor: DatabasePackageDescriptor, archiveBytes: number): string {
    const resource = descriptor.resources[0];
    const database = resource['eskuel:database'];
    const licenses = descriptor.licenses.map(license => license.name ?? license.title ?? license.path).join(', ');
    const notices = descriptor.notices?.map(notice => notice.title ?? notice.path).join(', ') ?? 'none';
    const provenance = descriptor.provenance === undefined
        ? 'none'
        : `${descriptor.provenance.path} (${descriptor.provenance.mediatype})`;
    return [
        `Name: ${descriptor.name}`,
        `Title: ${descriptor.title}`,
        `Version: ${descriptor.version}`,
        `System: ${database.system} >= ${database.systemMinVersion}`,
        `Inner artifact: ${database.artifactType}`,
        `Resource: ${resource.path}`,
        `Resource bytes: ${resource.bytes}`,
        `Resource hash: ${resource.hash}`,
        `Package bytes: ${archiveBytes}`,
        `Licenses: ${licenses}`,
        `Notices: ${notices}`,
        `Provenance: ${provenance}`,
        '',
    ].join('\n');
}

function resolvePortablePath(base: string, path: string): string {
    return resolve(base, ...path.split('/'));
}

function requireExtension(path: string, extension: string, label: string): void {
    if (extname(path).toLocaleLowerCase('en-US') !== extension) {
        throw new Error(`${label} path must end in ${extension}: ${path}`);
    }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === code;
}

void main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`eskueldb: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
