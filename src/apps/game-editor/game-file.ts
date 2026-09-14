import type { Game, OrdinaryHint } from '../../game/model';
import { gameToXML } from '../../game/xml/codec';

const estimatedDocumentOverheadBytes = 512;
const estimatedSceneOverheadBytes = 200;
const estimatedHintOverheadBytes = 80;
const estimatedTextEncodingExpansion = 1.1;

export interface GameFileHandle {
    readonly name: string;
    createWritable(): Promise<{
        write(data: Blob): Promise<void>;
        close(): Promise<void>;
    }>;
}

export type GameSaveFilePicker = (options: {
    suggestedName: string;
    types: Array<{
        description: string;
        accept: Record<string, string[]>;
    }>;
}) => Promise<GameFileHandle>;

type WindowWithSaveFilePicker = Window & {
    showSaveFilePicker?: GameSaveFilePicker;
};

export class GameFileSizeLimitError extends Error {
    readonly actualBytes: number;
    readonly limitBytes: number;

    constructor(actualBytes: number, limitBytes: number) {
        super(`Game file size ${actualBytes} bytes exceeds the limit of ${limitBytes} bytes`);
        this.name = 'GameFileSizeLimitError';
        this.actualBytes = actualBytes;
        this.limitBytes = limitBytes;
    }
}

export function getBrowserGameSaveFilePicker(browserWindow: Window = window): GameSaveFilePicker | null {
    const saveFilePicker = (browserWindow as WindowWithSaveFilePicker).showSaveFilePicker;
    return saveFilePicker === undefined
        ? null
        : options => saveFilePicker.call(browserWindow, options);
}

export async function saveGameToFile(
    picker: GameSaveFilePicker,
    currentHandle: GameFileHandle | null,
    suggestedName: string,
    game: Game,
    maxFileBytes: number,
): Promise<GameFileHandle> {
    const blob = createGameBlob(game, maxFileBytes);
    const handle = currentHandle ?? await picker({
        suggestedName,
        types: [{
            description: 'XML game file',
            accept: { 'application/xml': ['.xml'] },
        }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return handle;
}

export function exportGameFile(filename: string, game: Game, maxFileBytes: number): void {
    const url = URL.createObjectURL(createGameBlob(game, maxFileBytes));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function isFilePickerCancellation(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

export function gameTitleToFilename(title: string): string {
    const stem = title
        .toLocaleLowerCase('en-US')
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .normalize('NFKD')
        .replace(/\p{Mark}+/gu, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `${stem === '' ? 'game' : stem}.xml`;
}

export function getGameFileSizeBytes(game: Game): number {
    return createUnvalidatedGameBlob(game).size;
}

export function estimateGameFileSizeBytes(game: Game): number {
    let textualCharacters = game.title.length + game.teaser.length + game.copyright.length;
    let payloadBytes = estimatedDocumentOverheadBytes;

    for (const scene of game.scenes) {
        payloadBytes += estimatedSceneOverheadBytes;
        switch (scene.type) {
            case 'text':
                textualCharacters += scene.text.length;
                break;
            case 'image':
                payloadBytes += scene.base64string.length;
                break;
            case 'select':
                textualCharacters += scene.text.length + scene.sqlSol.length + scene.sqlPlaceholder.length;
                textualCharacters += estimateHintTextCharacters(scene.ordinaryHints);
                payloadBytes += scene.ordinaryHints.length * estimatedHintOverheadBytes;
                break;
            case 'manipulate':
                textualCharacters += scene.text.length
                    + scene.sqlSol.length
                    + scene.sqlCheck.length
                    + scene.sqlPlaceholder.length;
                textualCharacters += estimateHintTextCharacters(scene.ordinaryHints);
                payloadBytes += scene.ordinaryHints.length * estimatedHintOverheadBytes;
                break;
            default: { const _n: never = scene; return _n; }
        }
    }

    if (game.dbData === null) {
        // A game without a database has no database payload in its XML file.
    }
    else if (game.dbData.type === 'initial-sql-script') {
        textualCharacters += game.dbData.sql.length;
    }
    else if (game.dbData.type === 'sqlite-db') {
        payloadBytes += 4 * Math.ceil(game.dbData.data.byteLength / 3);
    }
    else { const _n: never = game.dbData; return _n; }

    return payloadBytes + Math.ceil(textualCharacters * estimatedTextEncodingExpansion);
}

function estimateHintTextCharacters(hints: OrdinaryHint[]): number {
    let textualCharacters = 0;
    for (const hint of hints) {
        if (hint.type === 'text') {
            textualCharacters += hint.text.length;
        }
        else if (hint.type === 'expected-result') {
            // The fixed XML markup is covered by estimatedHintOverheadBytes.
        }
        else { const _n: never = hint; return _n; }
    }
    return textualCharacters;
}

function createGameBlob(game: Game, maxFileBytes: number): Blob {
    const blob = createUnvalidatedGameBlob(game);
    if (blob.size > maxFileBytes) {
        throw new GameFileSizeLimitError(blob.size, maxFileBytes);
    }
    else {
        return blob;
    }
}

function createUnvalidatedGameBlob(game: Game): Blob {
    return new Blob([gameToXML(game)], { type: 'application/xml' });
}
