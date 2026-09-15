import type { Game } from './model';
import type { Source } from '../util';
import { getFilenameExtension } from '../util';

export type GameSource =
    | { type: 'auto', source: Source<Uint8Array> }
    | { type: 'object', source: Game }
    | { type: 'xml', source: Source<string> }
    | { type: 'eskuel-game-package', source: Source<Uint8Array> };

export type GameFileSourceType = Exclude<GameSource['type'], 'object' | 'auto'>;

export function getGameFileSourceType(filename: string): GameFileSourceType | undefined {
    const extension = getFilenameExtension(filename)?.toLocaleLowerCase('en-US') ?? null;
    if (extension === 'xml') {
        return 'xml';
    }
    else if (extension === 'eskuelgame') {
        return 'eskuel-game-package';
    }
    else {
        return undefined;
    }
}

export function getGameEditorFilename(filename: string, importedPackage: boolean): string {
    if (importedPackage) {
        const suffix = '.eskuelgame';
        return filename.toLocaleLowerCase('en-US').endsWith(suffix)
            ? `${filename.slice(0, -suffix.length)}.xml`
            : filename.toLocaleLowerCase('en-US').endsWith('.xml') ? filename : `${filename}.xml`;
    }
    else {
        return filename;
    }
}
