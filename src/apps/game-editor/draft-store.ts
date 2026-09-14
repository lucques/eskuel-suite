import type { DbData } from '../../database/api';
import {
    isDatabaseSystem,
    isDatabaseSystemVersion,
    type DatabaseSystem,
} from '../../database/system';
import { isImageMediaType } from '../../game/image';
import { Game, type Scene } from '../../game/model';
import type { GamePackageInfo } from '../../game/package';
import { validateGamePackageInfo } from '../../game/package';
import type { GameDocument, GameDocumentID } from './document';
import { makeGameDocumentID } from './document';

const draftStorageVersion = 3;
const defaultDatabaseName = 'eskuel-suite:game-editor-drafts';
const documentsStoreName = 'documents';
const scenesStoreName = 'scenes';
const databaseSourcesStoreName = 'databaseSources';
const packageInfosStoreName = 'packageInfos';
const sceneDocumentIndexName = 'documentId';

export type GameDocumentSceneID = string & { readonly __brand: 'GameDocumentSceneID' };

export type RestoredGameDocumentDraft = {
    document: GameDocument;
    packageInfo?: GamePackageInfo;
    sceneIds: GameDocumentSceneID[];
    updatedAt: number;
};

export type GameDocumentDraftUpdate = {
    document: GameDocument;
    sceneIds: GameDocumentSceneID[];
    scenesToPut: Array<{ id: GameDocumentSceneID, scene: Scene }>;
    sceneIdsToDelete: GameDocumentSceneID[];
    databaseSource:
        | { type: 'unchanged' }
        | { type: 'replace', data: DbData | null };
};

export class GameDocumentDraftConflictError extends Error {
    constructor(
        readonly documentId: GameDocumentID,
        readonly expectedRevision: number | null,
        readonly actualRevision: number | null,
    ) {
        super(`Game-document draft revision conflict: expected ${String(expectedRevision)}, found ${String(actualRevision)}`);
        this.name = 'GameDocumentDraftConflictError';
    }
}

export interface GameDocumentDraftStore {
    loadAll(): Promise<RestoredGameDocumentDraft[]>;
    replace(draft: RestoredGameDocumentDraft, expectedRevision: number | null): Promise<void>;
    update(update: GameDocumentDraftUpdate, expectedRevision: number): Promise<void>;
    deleteDocument(documentId: GameDocumentID, expectedRevision: number): Promise<void>;
}

type StoredGameDocumentRecord = {
    id: string;
    storageVersion: typeof draftStorageVersion;
    filename: string;
    revision: number;
    sourceKey: string | null;
    savedGameFingerprint: string | null;
    title: string;
    teaser: string;
    copyright: string;
    dbSystem: DatabaseSystem;
    dbSystemMinVersion: string;
    sceneIds: string[];
    updatedAt: number;
};

type StoredSceneRecord = {
    documentId: string;
    id: string;
    scene: Scene;
};

type StoredDatabaseSourceRecord = {
    documentId: string;
    data: DbData;
};

type StoredGamePackageInfoRecord = {
    documentId: string;
    info: GamePackageInfo;
};

export function createIndexedDBGameDocumentDraftStore(
    factory: IDBFactory = window.indexedDB,
    databaseName: string = defaultDatabaseName,
): GameDocumentDraftStore {
    const databasePromise = openDatabase(factory, databaseName);

    return {
        async loadAll() {
            const database = await databasePromise;
            const transaction = database.transaction(documentsStoreName, 'readonly');
            const completion = transactionCompletion(transaction);
            const documentRecords = await requestResult<unknown[]>(
                transaction.objectStore(documentsStoreName).getAll(),
            );
            await completion;
            const restoredDrafts: RestoredGameDocumentDraft[] = [];

            for (const candidate of documentRecords) {
                const record = parseStoredGameDocumentRecord(candidate);
                if (record !== null) {
                    const draft = await restoreDraft(database, record);
                    if (draft !== null) {
                        restoredDrafts.push(draft);
                    }
                }
            }

            return restoredDrafts.sort((a, b) => b.updatedAt - a.updatedAt);
        },

        async replace(draft, expectedRevision) {
            const database = await databasePromise;
            const transaction = database.transaction(
                [documentsStoreName, scenesStoreName, databaseSourcesStoreName, packageInfosStoreName],
                'readwrite',
            );
            const completion = transactionCompletion(transaction);
            await Promise.all([
                conditionallyMutateDraft(
                    transaction,
                    draft.document.id,
                    expectedRevision,
                    () => replaceDraftRecords(transaction, draft),
                ),
                completion,
            ]);
        },

        async update(update, expectedRevision) {
            const database = await databasePromise;
            const transaction = database.transaction(
                [documentsStoreName, scenesStoreName, databaseSourcesStoreName],
                'readwrite',
            );
            const completion = transactionCompletion(transaction);
            await Promise.all([
                conditionallyMutateDraft(transaction, update.document.id, expectedRevision, () => {
                    transaction.objectStore(documentsStoreName).put(
                        toStoredDocumentRecord(update.document, update.sceneIds),
                    );
                    const scenesStore = transaction.objectStore(scenesStoreName);
                    for (const entry of update.scenesToPut) {
                        scenesStore.put(toStoredSceneRecord(update.document.id, entry.id, entry.scene));
                    }
                    for (const sceneId of update.sceneIdsToDelete) {
                        scenesStore.delete([update.document.id, sceneId]);
                    }
                    if (update.databaseSource.type === 'unchanged') {
                        // The existing database source remains untouched.
                    }
                    else if (update.databaseSource.type === 'replace') {
                        replaceDatabaseSource(transaction, update.document.id, update.databaseSource.data);
                    }
                    else { const _n: never = update.databaseSource; return _n; }
                }),
                completion,
            ]);
        },

        async deleteDocument(documentId, expectedRevision) {
            await deleteDocumentRecords(await databasePromise, documentId, expectedRevision);
        },
    };
}

export function makeGameDocumentSceneID(id: string): GameDocumentSceneID {
    return id as GameDocumentSceneID;
}

function openDatabase(factory: IDBFactory, databaseName: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = factory.open(databaseName, 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(documentsStoreName)) {
                database.createObjectStore(documentsStoreName, { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains(scenesStoreName)) {
                const scenesStore = database.createObjectStore(scenesStoreName, {
                    keyPath: ['documentId', 'id'],
                });
                scenesStore.createIndex(sceneDocumentIndexName, 'documentId');
            }
            if (!database.objectStoreNames.contains(databaseSourcesStoreName)) {
                database.createObjectStore(databaseSourcesStoreName, { keyPath: 'documentId' });
            }
            if (!database.objectStoreNames.contains(packageInfosStoreName)) {
                database.createObjectStore(packageInfosStoreName, { keyPath: 'documentId' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Opening the game-draft database failed'));
        request.onblocked = () => reject(new Error('Opening the game-draft database was blocked'));
    });
}

async function restoreDraft(
    database: IDBDatabase,
    record: StoredGameDocumentRecord,
): Promise<RestoredGameDocumentDraft | null> {
    const transaction = database.transaction(
        [scenesStoreName, databaseSourcesStoreName, packageInfosStoreName],
        'readonly',
    );
    const completion = transactionCompletion(transaction);
    const sceneCandidatesPromise = requestResult<unknown[]>(
        transaction.objectStore(scenesStoreName).index(sceneDocumentIndexName).getAll(record.id),
    );
    const databaseCandidatePromise = requestResult<unknown>(
        transaction.objectStore(databaseSourcesStoreName).get(record.id),
    );
    const packageInfoCandidatePromise = requestResult<unknown>(
        transaction.objectStore(packageInfosStoreName).get(record.id),
    );
    const [sceneCandidates, databaseCandidate, packageInfoCandidate] = await Promise.all([
        sceneCandidatesPromise,
        databaseCandidatePromise,
        packageInfoCandidatePromise,
        completion,
    ]);
    const scenesById = new Map<string, Scene>();
    for (const candidate of sceneCandidates) {
        const sceneRecord = parseStoredSceneRecord(candidate, record.id);
        if (sceneRecord !== null) {
            scenesById.set(sceneRecord.id, sceneRecord.scene);
        }
    }
    const scenes = record.sceneIds.map(sceneId => scenesById.get(sceneId));
    if (scenes.some(scene => scene === undefined)) {
        return null;
    }

    const databaseData = parseStoredDatabaseSourceRecord(databaseCandidate, record.id);
    if (databaseCandidate !== undefined && databaseData === undefined) {
        return null;
    }

    const packageInfo = parseStoredGamePackageInfoRecord(packageInfoCandidate, record.id);
    if (packageInfo === undefined) {
        return null;
    }

    try {
        const game = new Game(
            record.title,
            record.teaser,
            record.copyright,
            databaseData ?? null,
            scenes as Scene[],
            record.dbSystem,
            record.dbSystemMinVersion,
        );
        const draft = {
            document: {
                id: makeGameDocumentID(record.id),
                filename: record.filename,
                revision: record.revision,
                sourceKey: record.sourceKey,
                savedGameFingerprint: record.savedGameFingerprint,
                game,
            },
            ...(packageInfo === null ? {} : { packageInfo }),
            sceneIds: record.sceneIds.map(makeGameDocumentSceneID),
            updatedAt: record.updatedAt,
        };
        return draft;
    }
    catch (_error: unknown) {
        return null;
    }
}

function toStoredDocumentRecord(
    document: GameDocument,
    sceneIds: GameDocumentSceneID[],
): StoredGameDocumentRecord {
    if (sceneIds.length !== document.game.scenes.length) {
        throw new Error('The game document and draft scene-ID order must have equal lengths');
    }
    return {
        id: document.id,
        storageVersion: draftStorageVersion,
        filename: document.filename,
        revision: document.revision,
        sourceKey: document.sourceKey,
        savedGameFingerprint: document.savedGameFingerprint,
        title: document.game.title,
        teaser: document.game.teaser,
        copyright: document.game.copyright,
        dbSystem: document.game.dbSystem,
        dbSystemMinVersion: document.game.dbSystemMinVersion,
        sceneIds,
        updatedAt: Date.now(),
    };
}

function toStoredSceneRecord(
    documentId: GameDocumentID,
    sceneId: GameDocumentSceneID,
    scene: Scene,
): StoredSceneRecord {
    return { documentId, id: sceneId, scene };
}

function replaceDatabaseSource(
    transaction: IDBTransaction,
    documentId: GameDocumentID,
    data: DbData | null,
): void {
    const store = transaction.objectStore(databaseSourcesStoreName);
    if (data === null) {
        store.delete(documentId);
    }
    else {
        const record: StoredDatabaseSourceRecord = { documentId, data };
        store.put(record);
    }
}

function replaceGamePackageInfo(
    transaction: IDBTransaction,
    documentId: GameDocumentID,
    info: GamePackageInfo | undefined,
): void {
    const store = transaction.objectStore(packageInfosStoreName);
    if (info === undefined) {
        store.delete(documentId);
    }
    else {
        const record: StoredGamePackageInfoRecord = { documentId, info };
        store.put(record);
    }
}

function replaceDraftRecords(
    transaction: IDBTransaction,
    draft: RestoredGameDocumentDraft,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const scenesStore = transaction.objectStore(scenesStoreName);
        const existingSceneKeys = scenesStore.index(sceneDocumentIndexName).getAllKeys(draft.document.id);
        existingSceneKeys.onsuccess = () => {
            try {
                for (const key of existingSceneKeys.result) {
                    scenesStore.delete(key);
                }
                transaction.objectStore(documentsStoreName).put(
                    toStoredDocumentRecord(draft.document, draft.sceneIds),
                );
                draft.document.game.scenes.forEach((scene, index) => {
                    const sceneId = draft.sceneIds[index];
                    if (sceneId === undefined) {
                        throw new Error('Every game-document scene requires a draft scene ID');
                    }
                    scenesStore.put(toStoredSceneRecord(draft.document.id, sceneId, scene));
                });
                replaceDatabaseSource(transaction, draft.document.id, draft.document.game.dbData);
                replaceGamePackageInfo(transaction, draft.document.id, draft.packageInfo);
                resolve();
            }
            catch (error: unknown) {
                transaction.abort();
                reject(error);
            }
        };
        existingSceneKeys.onerror = () => reject(
            existingSceneKeys.error ?? new Error('Reading existing game-draft scene keys failed'),
        );
    });
}

async function deleteDocumentRecords(
    database: IDBDatabase,
    documentId: GameDocumentID,
    expectedRevision: number,
): Promise<void> {
    const transaction = database.transaction(
        [documentsStoreName, scenesStoreName, databaseSourcesStoreName, packageInfosStoreName],
        'readwrite',
    );
    const completion = transactionCompletion(transaction);
    await Promise.all([
        conditionallyMutateDraft(transaction, documentId, expectedRevision, () => {
            transaction.objectStore(documentsStoreName).delete(documentId);
            transaction.objectStore(databaseSourcesStoreName).delete(documentId);
            transaction.objectStore(packageInfosStoreName).delete(documentId);
            return deleteSceneRecords(transaction, documentId);
        }),
        completion,
    ]);
}

function conditionallyMutateDraft(
    transaction: IDBTransaction,
    documentId: GameDocumentID,
    expectedRevision: number | null,
    mutate: () => void | Promise<void>,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = transaction.objectStore(documentsStoreName).get(documentId);
        request.onsuccess = () => {
            const record = parseStoredGameDocumentRecord(request.result);
            const actualRevision = record?.revision ?? null;
            if (actualRevision !== expectedRevision) {
                reject(new GameDocumentDraftConflictError(documentId, expectedRevision, actualRevision));
                abortTransaction(transaction);
            }
            else {
                try {
                    Promise.resolve(mutate()).then(resolve, error => {
                        reject(error);
                        abortTransaction(transaction);
                    });
                }
                catch (error: unknown) {
                    reject(error);
                    abortTransaction(transaction);
                }
            }
        };
        request.onerror = () => reject(request.error ?? new Error('Reading the game-document draft failed'));
    });
}

function abortTransaction(transaction: IDBTransaction): void {
    try {
        transaction.abort();
    }
    catch (_error: unknown) {
        // The mutation may already have aborted or completed the transaction.
    }
}

function deleteSceneRecords(transaction: IDBTransaction, documentId: GameDocumentID): Promise<void> {
    return new Promise((resolve, reject) => {
        const scenesStore = transaction.objectStore(scenesStoreName);
        const request = scenesStore.index(sceneDocumentIndexName).openKeyCursor(documentId);
        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor === null) {
                resolve();
            }
            else {
                scenesStore.delete(cursor.primaryKey);
                cursor.continue();
            }
        };
        request.onerror = () => reject(request.error ?? new Error('Deleting game-draft scenes failed'));
    });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('The game-draft transaction failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('The game-draft transaction was aborted'));
    });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('The game-draft request failed'));
    });
}

function parseStoredGameDocumentRecord(candidate: unknown): StoredGameDocumentRecord | null {
    // IndexedDB outlives the running JavaScript bundle and is not protected by
    // TypeScript at runtime. It may therefore contain records from an older app
    // version, an interrupted/failed write, or data changed by another script.
    // Validate every value read from it before constructing domain objects. An
    // invalid record makes only that draft unrestorable; loadAll skips it instead
    // of letting one bad draft prevent the editor from starting.
    if (!isRecord(candidate)) {
        return null;
    }
    const sceneIds = candidate.sceneIds;
    if (candidate.storageVersion === draftStorageVersion
        && typeof candidate.id === 'string'
        && typeof candidate.filename === 'string'
        && typeof candidate.revision === 'number'
        && Number.isSafeInteger(candidate.revision)
        && candidate.revision >= 0
        && (candidate.sourceKey === null || typeof candidate.sourceKey === 'string')
        && (candidate.savedGameFingerprint === null
            || isGameFingerprint(candidate.savedGameFingerprint))
        && typeof candidate.title === 'string'
        && typeof candidate.teaser === 'string'
        && typeof candidate.copyright === 'string'
        && typeof candidate.dbSystem === 'string'
        && isDatabaseSystem(candidate.dbSystem)
        && typeof candidate.dbSystemMinVersion === 'string'
        && isDatabaseSystemVersion(candidate.dbSystemMinVersion)
        && Array.isArray(sceneIds)
        && sceneIds.length > 0
        && sceneIds.every(sceneId => typeof sceneId === 'string')
        && new Set(sceneIds).size === sceneIds.length
        && typeof candidate.updatedAt === 'number'
        && Number.isFinite(candidate.updatedAt)) {
        return candidate as StoredGameDocumentRecord;
    }
    else {
        return null;
    }
}

function parseStoredGamePackageInfoRecord(
    candidate: unknown,
    documentId: string,
): GamePackageInfo | null | undefined {
    if (candidate === undefined) {
        return null;
    }
    else if (isRecord(candidate) && candidate.documentId === documentId) {
        try {
            return validateGamePackageInfo(candidate.info);
        }
        catch (_error: unknown) {
            return undefined;
        }
    }
    else {
        return undefined;
    }
}

function isGameFingerprint(candidate: unknown): candidate is string {
    return typeof candidate === 'string' && /^sha256:[0-9a-f]{64}$/.test(candidate);
}

function parseStoredSceneRecord(candidate: unknown, documentId: string): StoredSceneRecord | null {
    if (isRecord(candidate)
        && candidate.documentId === documentId
        && typeof candidate.id === 'string'
        && isScene(candidate.scene)) {
        return candidate as StoredSceneRecord;
    }
    else {
        return null;
    }
}

function parseStoredDatabaseSourceRecord(candidate: unknown, documentId: string): DbData | null | undefined {
    if (candidate === undefined) {
        return null;
    }
    else if (isRecord(candidate) && candidate.documentId === documentId && isDbData(candidate.data)) {
        return candidate.data;
    }
    else {
        return undefined;
    }
}

function isDbData(candidate: unknown): candidate is DbData {
    if (!isRecord(candidate) || typeof candidate.type !== 'string') {
        return false;
    }
    else if (candidate.type === 'initial-sql-script') {
        return typeof candidate.system === 'string'
            && isDatabaseSystem(candidate.system)
            && typeof candidate.systemMinVersion === 'string'
            && isDatabaseSystemVersion(candidate.systemMinVersion)
            && typeof candidate.sql === 'string';
    }
    else if (candidate.type === 'sqlite-db') {
        return candidate.system === 'sqlite'
            && typeof candidate.systemMinVersion === 'string'
            && isDatabaseSystemVersion(candidate.systemMinVersion)
            && candidate.data instanceof Uint8Array;
    }
    else {
        return false;
    }
}

function isScene(candidate: unknown): candidate is Scene {
    if (!isRecord(candidate) || typeof candidate.type !== 'string') {
        return false;
    }
    else if (candidate.type === 'text') {
        return typeof candidate.text === 'string';
    }
    else if (candidate.type === 'image') {
        return typeof candidate.base64string === 'string'
            && typeof candidate.mediaType === 'string'
            && isImageMediaType(candidate.mediaType);
    }
    else if (candidate.type === 'select') {
        return typeof candidate.text === 'string'
            && typeof candidate.sqlSol === 'string'
            && typeof candidate.sqlPlaceholder === 'string'
            && typeof candidate.isRowOrderRelevant === 'boolean'
            && typeof candidate.isColOrderRelevant === 'boolean'
            && typeof candidate.areColNamesRelevant === 'boolean';
    }
    else if (candidate.type === 'manipulate') {
        return typeof candidate.text === 'string'
            && typeof candidate.sqlSol === 'string'
            && typeof candidate.sqlCheck === 'string'
            && typeof candidate.sqlPlaceholder === 'string';
    }
    else {
        return false;
    }
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
    return typeof candidate === 'object' && candidate !== null;
}
