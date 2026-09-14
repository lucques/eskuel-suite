import type { GameSource } from '../../game/loader';
import type { GameProgress, SceneStatus } from './game-progress';
import { GAME_FINGERPRINT_VERSION } from '../../game/fingerprint';

export type GameLocator =
    | { kind: 'url', url: string }
    | { kind: 'object' };

export type GameCheckpoint = {
    checkpointVersion: 1,
    fingerprintVersion: typeof GAME_FINGERPRINT_VERSION,
    gameFingerprint: string,
    gameLocator: GameLocator,
    gameTitle: string,
    progress: GameProgress,
    updatedAt: number,
};

export type GameCheckpointStore = {
    findByFingerprint(gameFingerprint: string): GameCheckpoint | null;
    getLastCheckpoint(): GameCheckpoint | null;
    remove(gameFingerprint: string): void;
    save(checkpoint: GameCheckpoint): void;
};

type CheckpointStorage = Pick<Storage, 'getItem' | 'setItem'>;

const checkpointStorageKey = 'eskuel-suite:game-console-checkpoints:v1';
const maximumStoredCheckpoints = 50;

const sceneStatuses = new Set<SceneStatus>([
    'task-unsolved',
    'task-solved-by-user',
    'task-solved-by-sol-hint',
    'task-skipped',
    'nontask-unseen',
    'nontask-seen',
]);

export function createGameCheckpointStore(storage?: CheckpointStorage): GameCheckpointStore {
    const readCheckpoints = (): GameCheckpoint[] => {
        if (storage === undefined) {
            return [];
        }
        else {
            try {
                const serialized = storage.getItem(checkpointStorageKey);
                if (serialized === null) {
                    return [];
                }
                else {
                    const parsed: unknown = JSON.parse(serialized);
                    return Array.isArray(parsed)
                        ? parsed.flatMap(candidate => {
                            const checkpoint = parseGameCheckpoint(candidate);
                            return checkpoint === null ? [] : [checkpoint];
                        })
                        : [];
                }
            }
            catch (error: unknown) {
                console.error('Failed to read SQL game checkpoints:', error);
                return [];
            }
        }
    };

    const writeCheckpoints = (checkpoints: GameCheckpoint[]): void => {
        try {
            storage?.setItem(checkpointStorageKey, JSON.stringify(checkpoints));
        }
        catch (error: unknown) {
            console.error('Failed to persist SQL game checkpoints:', error);
        }
    };

    return {
        findByFingerprint(gameFingerprint) {
            return readCheckpoints().find(checkpoint => checkpoint.gameFingerprint === gameFingerprint) ?? null;
        },
        getLastCheckpoint() {
            return readCheckpoints().reduce<GameCheckpoint | null>((latest, checkpoint) => (
                latest === null || checkpoint.updatedAt > latest.updatedAt ? checkpoint : latest
            ), null);
        },
        remove(gameFingerprint) {
            writeCheckpoints(readCheckpoints().filter(checkpoint => checkpoint.gameFingerprint !== gameFingerprint));
        },
        save(checkpoint) {
            const retainedCheckpoints = readCheckpoints().filter(candidate => {
                if (candidate.gameFingerprint === checkpoint.gameFingerprint) {
                    return false;
                }
                else if (candidate.gameLocator.kind === 'url' && checkpoint.gameLocator.kind === 'url') {
                    return candidate.gameLocator.url !== checkpoint.gameLocator.url;
                }
                else {
                    return true;
                }
            });
            const checkpoints = [...retainedCheckpoints, checkpoint]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, maximumStoredCheckpoints);
            writeCheckpoints(checkpoints);
        },
    };
}

export function getGameLocator(source: GameSource, baseUrl: string): GameLocator {
    if (source.type === 'object') {
        return { kind: 'object' };
    }
    else if (source.type === 'xml' || source.type === 'eskuel-game-package') {
        if (source.source.type === 'fetch') {
            return {
                kind: 'url',
                url: normalizeGameUrl(source.source.url, baseUrl),
            };
        }
        else if (source.source.type === 'inline') {
            return { kind: 'object' };
        }
        else { const _n: never = source.source; return _n; }
    }
    else { const _n: never = source; return _n; }
}

export function normalizeGameUrl(url: string, baseUrl: string): string {
    try {
        const normalized = new URL(url, baseUrl);
        normalized.hash = '';
        return normalized.href;
    }
    catch (_error: unknown) {
        return url;
    }
}

function parseGameCheckpoint(candidate: unknown): GameCheckpoint | null {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    else {
        const values = candidate as Partial<Record<keyof GameCheckpoint, unknown>>;
        const locator = parseGameLocator(values.gameLocator);
        const progress = parseGameProgress(values.progress);
        if (values.checkpointVersion !== 1
            || values.fingerprintVersion !== GAME_FINGERPRINT_VERSION
            || typeof values.gameFingerprint !== 'string'
            || !/^sha256:[0-9a-f]{64}$/.test(values.gameFingerprint)
            || locator === null
            || typeof values.gameTitle !== 'string'
            || progress === null
            || typeof values.updatedAt !== 'number'
            || !Number.isFinite(values.updatedAt)) {
            return null;
        }
        else {
            return {
                checkpointVersion: 1,
                fingerprintVersion: GAME_FINGERPRINT_VERSION,
                gameFingerprint: values.gameFingerprint,
                gameLocator: locator,
                gameTitle: values.gameTitle,
                progress,
                updatedAt: values.updatedAt,
            };
        }
    }
}

function parseGameLocator(candidate: unknown): GameLocator | null {
    if (typeof candidate !== 'object' || candidate === null || !('kind' in candidate)) {
        return null;
    }
    else if (candidate.kind === 'url' && 'url' in candidate && typeof candidate.url === 'string') {
        return { kind: 'url', url: candidate.url };
    }
    else if (candidate.kind === 'object') {
        return { kind: 'object' };
    }
    else {
        return null;
    }
}

function parseGameProgress(candidate: unknown): GameProgress | null {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    else {
        const values = candidate as Partial<Record<keyof GameProgress, unknown>>;
        const parsedSceneStatuses = Array.isArray(values.sceneStatuses)
            ? values.sceneStatuses
            : null;
        if (typeof values.curSceneIndex !== 'number'
            || !Number.isSafeInteger(values.curSceneIndex)
            || parsedSceneStatuses === null
            || !parsedSceneStatuses.every(status => sceneStatuses.has(status as SceneStatus))) {
            return null;
        }
        else {
            return {
                curSceneIndex: values.curSceneIndex,
                sceneStatuses: [...parsedSceneStatuses] as SceneStatus[],
            };
        }
    }
}
