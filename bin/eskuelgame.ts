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
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { Effect } from 'effect';
import initSqlJs from 'sql.js';

import {
    createGamePackage,
    DEFAULT_GAME_DATABASE_PACKAGE_BYTES,
    DEFAULT_GAME_DATABASE_RESOURCE_BYTES,
    DEFAULT_GAME_PACKAGE_BYTES,
    DEFAULT_GAME_XML_BYTES,
    parseGamePackageRecipe,
} from '../src/game/package-authoring';
import type { GamePackageRecipe } from '../src/game/package-authoring';
import {
    MAX_GAME_PACKAGE_AUXILIARY_FILE_BYTES,
    MAX_GAME_PACKAGE_LICENSE_BYTES,
    readGamePackage,
} from '../src/game/package';
import type { GamePackageContents, GamePackageDescriptor } from '../src/game/package';
import { loadGameWithInfo } from '../src/game/loader';
import { fastXmlParser } from '../src/game/xml/fast-parser';

const USAGE = `Usage:
  eskuelgame pack <recipe.json> <game.xml> <database.eskueldb> <output.eskuelgame> [--overwrite]
  eskuelgame validate <package.eskuelgame> [--deep]
  eskuelgame inspect <package.eskuelgame> [--json]

Commands:
  pack      Create a deterministic package and validate it before writing.
  validate  Validate both package layers and the game/database contract; --deep also checks SQLite integrity.
  inspect   Validate the package and print its game and database metadata.
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
    if (positional.length !== 4) {
        throw new Error(`pack requires a recipe, game XML, database package, and output path\n\n${USAGE}`);
    }
    const [recipePath, gameXmlPath, databasePackagePath, outputPath] = positional.map(path => resolve(path));
    requireExtension(gameXmlPath, '.xml', 'Game XML');
    requireExtension(databasePackagePath, '.eskueldb', 'Database package');
    requireExtension(outputPath, '.eskuelgame', 'Output');

    const recipe = await readRecipe(recipePath);
    const gameXmlBytes = await readLimitedRegularFile(gameXmlPath, DEFAULT_GAME_XML_BYTES, 'Game XML');
    const databasePackageBytes = await readLimitedRegularFile(
        databasePackagePath,
        DEFAULT_GAME_DATABASE_PACKAGE_BYTES,
        'Database package',
    );
    const packageFiles = await readPackageFiles(recipe, dirname(recipePath));
    const archive = await createGamePackage(recipe, gameXmlBytes, databasePackageBytes, packageFiles);
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
    if (deep && contents.dbData.type === 'sqlite-db') {
        await validateSqliteIntegrity(contents.dbData.data);
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
        process.stdout.write(`${JSON.stringify({
            game: contents.descriptor,
            database: contents.database.descriptor,
        }, null, 4)}\n`);
    }
    else {
        process.stdout.write(formatPackageSummary(contents, archive.byteLength));
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

async function readRecipe(path: string): Promise<GamePackageRecipe> {
    let candidate: unknown;
    try {
        candidate = JSON.parse(await readFile(path, 'utf8'));
    }
    catch (error: unknown) {
        throw new Error(`Could not read recipe '${path}': ${String(error)}`);
    }
    try {
        return parseGamePackageRecipe(candidate);
    }
    catch (error: unknown) {
        throw new Error(`Invalid recipe '${path}': ${String(error)}`);
    }
}

async function readPackageFiles(
    recipe: GamePackageRecipe,
    recipeDirectory: string,
): Promise<Map<string, Uint8Array>> {
    const files = new Map<string, Uint8Array>();
    for (const license of recipe.licenses) {
        const inputPath = resolvePortablePath(recipeDirectory, license.inputPath);
        const bytes = await readLimitedRegularFile(inputPath, MAX_GAME_PACKAGE_LICENSE_BYTES, 'License input');
        files.set(license.path, bytes);
    }
    for (const notice of recipe.notices ?? []) {
        const inputPath = resolvePortablePath(recipeDirectory, notice.inputPath);
        const bytes = await readLimitedRegularFile(
            inputPath,
            MAX_GAME_PACKAGE_AUXILIARY_FILE_BYTES,
            'Notice input',
        );
        files.set(notice.path, bytes);
    }
    if (recipe.provenance !== undefined) {
        const inputPath = resolvePortablePath(recipeDirectory, recipe.provenance.inputPath);
        const bytes = await readLimitedRegularFile(
            inputPath,
            MAX_GAME_PACKAGE_AUXILIARY_FILE_BYTES,
            'Provenance input',
        );
        files.set(recipe.provenance.path, bytes);
    }
    return files;
}

async function readValidatedPackage(path: string): Promise<{
    archive: Uint8Array;
    contents: GamePackageContents;
}> {
    requireExtension(path, '.eskuelgame', 'Package');
    const archive = await readLimitedRegularFile(path, DEFAULT_GAME_PACKAGE_BYTES, 'Game package');
    const result = await readGamePackage(archive, {
        maxGameXmlBytes: DEFAULT_GAME_XML_BYTES,
        maxDatabasePackageBytes: DEFAULT_GAME_DATABASE_PACKAGE_BYTES,
        maxDatabaseResourceBytes: DEFAULT_GAME_DATABASE_RESOURCE_BYTES,
    });
    if (!result.ok) {
        throw new Error(result.error.kind === 'file-size-too-large'
            ? `Package exceeds an Eskuel Suite implementation limit: ${path}`
            : `Invalid game package '${path}': ${result.error.details}`);
    }
    await validatePlayablePackage(archive);
    return { archive, contents: result.data };
}

async function validatePlayablePackage(archive: Uint8Array): Promise<void> {
    try {
        await Effect.runPromise(loadGameWithInfo({
            type: 'eskuel-game-package',
            source: { type: 'inline', content: archive },
        }, fastXmlParser));
    }
    catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'kind' in error) {
            if (error.kind === 'file-size-too-large') {
                throw new Error('Game package exceeds an Eskuel Suite implementation limit');
            }
            else if ('details' in error && typeof error.details === 'string') {
                throw new Error(`Invalid game package: ${error.details}`);
            }
        }
        throw new Error(`Invalid game package: ${String(error)}`);
    }
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
        const integrityValues = integrityResult.flatMap(result => result.values).map(row => row[0]);
        if (integrityValues.length !== 1 || integrityValues[0] !== 'ok') {
            throw new Error(`SQLite integrity_check failed: ${JSON.stringify(integrityValues.slice(0, 10))}`);
        }
        const foreignKeyErrors = database.exec('PRAGMA foreign_key_check').flatMap(result => result.values);
        if (foreignKeyErrors.length !== 0) {
            throw new Error(`SQLite foreign_key_check failed: ${JSON.stringify(foreignKeyErrors.slice(0, 10))}`);
        }
    }
    finally {
        database.close();
    }
}

function formatPackageSummary(contents: GamePackageContents, archiveBytes: number): string {
    const descriptor = contents.descriptor;
    const gameResource = descriptor.resources.find(resource => resource.name === 'game')!;
    const databaseDescriptor = contents.database.descriptor;
    const databaseResource = databaseDescriptor.resources[0];
    const database = databaseResource['eskuel:database'];
    return [
        'Game package',
        `Name: ${descriptor.name}`,
        `Title: ${descriptor.title}`,
        `Version: ${descriptor.version}`,
        `Game resource: ${gameResource.path}`,
        `Game bytes: ${gameResource.bytes}`,
        `Game hash: ${gameResource.hash}`,
        `Package bytes: ${archiveBytes}`,
        `Game licenses: ${formatLicenses(descriptor)}`,
        `Game notices: ${descriptor.notices?.map(notice => notice.title ?? notice.path).join(', ') ?? 'none'}`,
        `Game provenance: ${formatProvenance(descriptor)}`,
        '',
        'Database dependency',
        `Name: ${databaseDescriptor.name}`,
        `Title: ${databaseDescriptor.title}`,
        `Version: ${databaseDescriptor.version}`,
        `System: ${database.system} >= ${database.systemMinVersion}`,
        `Inner artifact: ${database.artifactType}`,
        `Database licenses: ${formatLicenses(databaseDescriptor)}`,
        `Database notices: ${databaseDescriptor.notices?.map(notice => notice.title ?? notice.path).join(', ') ?? 'none'}`,
        `Database provenance: ${formatProvenance(databaseDescriptor)}`,
        '',
    ].join('\n');
}

function formatLicenses(descriptor: Pick<GamePackageDescriptor, 'licenses'>): string {
    return descriptor.licenses.map(license => license.name ?? license.title ?? license.path).join(', ');
}

function formatProvenance(descriptor: Pick<GamePackageDescriptor, 'provenance'>): string {
    return descriptor.provenance === undefined
        ? 'none'
        : `${descriptor.provenance.path} (${descriptor.provenance.mediatype})`;
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

main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
