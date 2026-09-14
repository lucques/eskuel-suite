import type { Game } from './model';
import { gameToXML } from './xml/codec';

export const GAME_FINGERPRINT_VERSION = 1;

export async function fingerprintGame(game: Game): Promise<string> {
    const canonicalGame = gameToXML(game);
    const bytes = new TextEncoder().encode(canonicalGame);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const hexadecimalDigest = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return `sha256:${hexadecimalDigest}`;
}
