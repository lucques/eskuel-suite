import { mkdtemp, open, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Effect } from 'effect';

import { Game } from '../../src/game/model';
import type { ImageScene } from '../../src/game/model';
import { loadGameWithInfo } from '../../src/game/loader';
import type { LoadedGame } from '../../src/game/loader';
import { getGameFileSourceType } from '../../src/game/source';
import type { GameSource } from '../../src/game/source';
import { fastXmlParser } from '../../src/game/xml/fast-parser';
import { loadDatabase } from '../../src/database/loader';
import { getDatabaseFileSourceType } from '../../src/database/source';
import { defaultSettingsStore } from '../../src/settings/store';
import type { GamePlatformAdapters } from '../../src/platform/game';
import { createCliDatabaseEngine } from './database';

export function cliAdapters(workerUrl: URL): GamePlatformAdapters {
    return {
        databaseEngineFactory: () => createCliDatabaseEngine(workerUrl),
        supportedDatabaseSystems: ['sqlite', 'postgresql'],
        xmlParser: fastXmlParser,
    };
}

export function parseOptions(args: string[], review: boolean) {
    const parsed = parseArgs({
        args,
        allowPositionals: true,
        options: {
            help: { type: 'boolean', short: 'h' },
            json: { type: 'boolean' },
            database: { type: 'string' },
            ...(review ? {
                scene: { type: 'string' as const },
                scenes: { type: 'string' as const },
                index: { type: 'boolean' as const },
                summary: { type: 'boolean' as const },
                'inspect-only': { type: 'boolean' as const },
            } : {}),
        },
    });
    if (!parsed.values.help && parsed.positionals.length !== 1) {
        throw new Error('Provide one .xml or .eskuelgame file. Use --help for usage.');
    }
    else {
        return {
            help: parsed.values.help === true,
            json: parsed.values.json === true,
            database: parsed.values.database,
            scene: typeof parsed.values.scene === 'string' ? parsed.values.scene : undefined,
            scenes: typeof parsed.values.scenes === 'string' ? parsed.values.scenes : undefined,
            index: parsed.values.index === true,
            summary: parsed.values.summary === true,
            'inspect-only': parsed.values['inspect-only'] === true,
            filename: parsed.positionals[0],
        };
    }
}

async function readLimitedFile(filename: string, maxBytes: number): Promise<Buffer> {
    const file = await open(filename, 'r');
    try {
        const info = await file.stat();
        if (!info.isFile() || info.size > maxBytes) {
            throw new Error(`Expected a regular file of at most ${maxBytes} bytes: ${filename}`);
        }
        else {
            const data = await file.readFile();
            if (data.byteLength > maxBytes) {
                throw new Error(`File exceeds ${maxBytes} bytes: ${filename}`);
            }
            else {
                return data;
            }
        }
    }
    finally {
        await file.close();
    }
}

export async function readGameFile(filename: string, databaseFilename?: string): Promise<LoadedGame & { source: GameSource }> {
    const settings = defaultSettingsStore.getSnapshot();
    const type = getGameFileSourceType(filename);
    if (type === undefined) {
        throw new Error('Expected a .xml or .eskuelgame file');
    }
    else {
        const bytes = await readLimitedFile(filename, type === 'xml' ? settings.maxGameFileBytes : settings.maxGamePackageBytes);
        const source: GameSource = type === 'xml'
            ? { type, source: { type: 'inline', content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) } }
            : { type, source: { type: 'inline', content: new Uint8Array(bytes) } };
        const loaded = await Effect.runPromise(loadGameWithInfo(source, fastXmlParser));
        if (databaseFilename === undefined) {
            return { ...loaded, source };
        }
        else if (type !== 'xml' || loaded.game.dbData !== null) {
            throw new Error('--database requires standalone XML without an embedded database');
        }
        else {
            const dbType = getDatabaseFileSourceType(databaseFilename);
            if (dbType === undefined) {
                throw new Error('Expected a .eskueldb, .sql, or SQLite database file for --database');
            }
            else {
                const dbBytes = await readLimitedFile(databaseFilename, settings.maxDatabaseFileBytes);
                const database = await Effect.runPromise(loadDatabase(dbType === 'initial-sql-script'
                    ? { type: dbType, source: { type: 'inline', content: new TextDecoder('utf-8', { fatal: true }).decode(dbBytes) } }
                    : { type: dbType, source: { type: 'inline', content: new Uint8Array(dbBytes) } }));
                const game = loaded.game;
                if (database.system !== game.dbSystem) {
                    throw new Error(`Game requires ${game.dbSystem}, database uses ${database.system}`);
                }
                else {
                    const combined = new Game(game.title, game.teaser, game.copyright, database, game.scenes, game.dbSystem, game.dbSystemMinVersion);
                    return { game: combined, source: { type: 'object', source: combined } };
                }
            }
        }
    }
}

// Images remain available after exit so an AI or author can open the reported paths.
export class CliImages {
    private directory: string | null = null;
    private readonly paths = new Map<string, string>();

    async export(scene: ImageScene) {
        let path = this.paths.get(scene.base64string);
        if (path === undefined) {
            this.directory ??= await mkdtemp(join(tmpdir(), 'eskuel-images-'));
            path = join(this.directory, `image-${this.paths.size + 1}.${scene.mediaType.slice('image/'.length)}`);
            await writeFile(path, Buffer.from(scene.base64string, 'base64'), { flag: 'wx' });
            this.paths.set(scene.base64string, path);
        }
        return { type: 'image' as const, mediaType: scene.mediaType, path };
    }
}

export function jsonStringify(value: unknown, pretty = false): string {
    return JSON.stringify(value, (_key, item: unknown) => item instanceof Uint8Array
        ? { type: 'bytes', base64: Buffer.from(item).toString('base64') }
        : item, pretty ? 4 : undefined);
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : jsonStringify(error);
}

export function reportCliError(error: unknown, json: boolean): void {
    const message = errorMessage(error);
    if (json) {
        process.stdout.write(`${jsonStringify({ ok: false, error: message })}\n`);
    }
    else {
        process.stderr.write(`Error: ${message}\n`);
    }
    process.exitCode = 1;
}
