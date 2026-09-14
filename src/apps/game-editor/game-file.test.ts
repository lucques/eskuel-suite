import { describe, expect, it, vi } from 'vitest';

import { Game } from '../../game/model';
import {
    estimateGameFileSizeBytes,
    exportGameFile,
    GameFileSizeLimitError,
    gameTitleToFilename,
    getGameFileSizeBytes,
    getBrowserGameSaveFilePicker,
    saveGameToFile,
} from './game-file';
import type { GameFileHandle, GameSaveFilePicker } from './game-file';

describe('game filenames', () => {
    it('creates a snake-case XML filename from a game title', () => {
        expect(gameTitleToFilename('Mein Spiel')).toBe('mein_spiel.xml');
        expect(gameTitleToFilename('Mäuse & Straße')).toBe('maeuse_strasse.xml');
        expect(gameTitleToFilename('Ärger mit Öl, Übergröße und Fuß')).toBe(
            'aerger_mit_oel_uebergroesse_und_fuss.xml',
        );
        expect(gameTitleToFilename('  SQL: Déjà vu!  ')).toBe('sql_deja_vu.xml');
    });

    it('uses a safe fallback for a title without filename characters', () => {
        expect(gameTitleToFilename('!?')).toBe('game.xml');
    });
});

describe('game file saving', () => {
    it('estimates large embedded payloads from their structural sizes', () => {
        const emptyGame = new Game('Estimate', '', '', null, [{ type: 'text', text: '' }]);
        const imageGame = new Game('Estimate', '', '', null, [{
            type: 'image',
            mediaType: 'image/png',
            base64string: 'A'.repeat(4_000),
        }]);
        const databaseGame = new Game(
            'Estimate',
            '',
            '',
            {
                type: 'sqlite-db',
                system: 'sqlite',
                systemMinVersion: '3.0.0',
                data: new Uint8Array(3_000),
            },
            [{ type: 'text', text: '' }],
        );

        expect(estimateGameFileSizeBytes(imageGame) - estimateGameFileSizeBytes(emptyGame)).toBe(4_000);
        expect(estimateGameFileSizeBytes(databaseGame) - estimateGameFileSizeBytes(emptyGame)).toBe(4_000);
    });

    it('detects whether the browser provides a native save-file picker', async () => {
        expect(getBrowserGameSaveFilePicker({} as Window)).toBeNull();

        const handle: GameFileHandle = {
            name: 'picked.xml',
            createWritable: async () => ({
                write: async () => undefined,
                close: async () => undefined,
            }),
        };
        const browserWindow = {
            showSaveFilePicker(this: Window) {
                expect(this).toBe(browserWindow);
                return Promise.resolve(handle);
            },
        } as unknown as Window;
        const picker = getBrowserGameSaveFilePicker(browserWindow);
        if (picker === null) {
            throw new Error('The test browser should expose its save-file picker');
        }
        else {
            await expect(picker({ suggestedName: 'game.xml', types: [] })).resolves.toBe(handle);
        }
    });

    it('serializes the game to an XML blob and closes the selected file', async () => {
        const write = vi.fn(async (_data: Blob) => undefined);
        const close = vi.fn(async () => undefined);
        const handle: GameFileHandle = {
            name: 'picked.xml',
            createWritable: async () => ({ write, close }),
        };
        const picker = vi.fn<GameSaveFilePicker>(async () => handle);
        const game = new Game(
            'Saved game',
            'Saved teaser',
            'Saved copyright',
            null,
            [{ type: 'text', text: 'Saved scene' }],
        );

        await expect(saveGameToFile(
            picker,
            null,
            'suggested.xml',
            game,
            Number.MAX_SAFE_INTEGER,
        )).resolves.toBe(handle);

        expect(picker).toHaveBeenCalledWith({
            suggestedName: 'suggested.xml',
            types: [{
                description: 'XML game file',
                accept: { 'application/xml': ['.xml'] },
            }],
        });
        expect(write).toHaveBeenCalledOnce();
        const blob = vi.mocked(write).mock.calls[0]?.[0];
        if (blob === undefined) {
            throw new Error('The game XML blob was not written');
        }
        else {
            expect(blob).toBeInstanceOf(Blob);
            await expect(blob.text()).resolves.toContain('<title>Saved game</title>');
        }
        expect(close).toHaveBeenCalledOnce();
    });

    it('writes through an existing handle without opening the picker again', async () => {
        const write = vi.fn(async () => undefined);
        const close = vi.fn(async () => undefined);
        const handle: GameFileHandle = {
            name: 'existing.xml',
            createWritable: async () => ({ write, close }),
        };
        const picker = vi.fn<GameSaveFilePicker>();
        const game = new Game('Saved game', '', '', null, [{ type: 'text', text: 'Scene' }]);

        await expect(saveGameToFile(
            picker,
            handle,
            'ignored.xml',
            game,
            Number.MAX_SAFE_INTEGER,
        )).resolves.toBe(handle);

        expect(picker).not.toHaveBeenCalled();
        expect(write).toHaveBeenCalledOnce();
        expect(close).toHaveBeenCalledOnce();
    });

    it('rejects saving before opening a picker when the serialized game exceeds the limit', async () => {
        const picker = vi.fn<GameSaveFilePicker>();
        const game = new Game('Oversized game', '', '', null, [{ type: 'text', text: 'Scene' }]);
        const actualBytes = getGameFileSizeBytes(game);

        await expect(saveGameToFile(
            picker,
            null,
            'oversized.xml',
            game,
            actualBytes - 1,
        )).rejects.toEqual(expect.objectContaining({
            actualBytes,
            limitBytes: actualBytes - 1,
        }));
        expect(picker).not.toHaveBeenCalled();
    });

    it('rejects exporting when the serialized game exceeds the limit', () => {
        const game = new Game('Oversized game', '', '', null, [{ type: 'text', text: 'Scene' }]);
        const actualBytes = getGameFileSizeBytes(game);

        expect(() => exportGameFile('oversized.xml', game, actualBytes - 1)).toThrow(
            GameFileSizeLimitError,
        );
    });
});
