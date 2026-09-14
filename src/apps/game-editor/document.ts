import type { Game } from '../../game/model';

export type GameDocumentID = string & { readonly __brand: 'GameDocumentID' };

export type GameDocument = {
    readonly id: GameDocumentID;
    readonly filename: string;
    /**
     * Monotonically increasing version of this document's in-memory state. Every
     * committed document change increments it. Persistence compares revisions to
     * distinguish the state that has reached IndexedDB from newer queued changes.
     */
    readonly revision: number;
    readonly sourceKey: string | null;
    /** SHA-256 fingerprint of the current game when clean; null when sticky-dirty. */
    readonly savedGameFingerprint: string | null;
    readonly game: Game;
};

export type GameDocumentChange =
    | { type: 'filename-changed' }
    | { type: 'metadata-updated' }
    | { type: 'scene-updated', index: number }
    | { type: 'scene-added', index: number }
    | { type: 'scene-deleted', index: number }
    | { type: 'scenes-reordered', indices: number[] }
    | { type: 'database-replaced' }
    | { type: 'file-checkpoint-updated' };

export type CommittedGameDocumentChange = {
    readonly document: GameDocument;
    readonly change: GameDocumentChange;
};

export type GameDocumentOptions = {
    id?: GameDocumentID;
    revision?: number;
    sourceKey?: string | null;
    /** Undefined marks the initially loaded game as saved; null marks it as never saved. */
    savedGameFingerprint?: string | null;
};

export function makeGameDocumentID(id: string): GameDocumentID {
    return id as GameDocumentID;
}
