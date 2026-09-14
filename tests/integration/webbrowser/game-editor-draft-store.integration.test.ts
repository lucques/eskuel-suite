import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

import type { GameDocument } from '../../../src/apps/game-editor/document';
import { makeGameDocumentID } from '../../../src/apps/game-editor/document';
import {
    createIndexedDBGameDocumentDraftStore,
    GameDocumentDraftConflictError,
    makeGameDocumentSceneID,
} from '../../../src/apps/game-editor/draft-store';
import { Game } from '../../../src/game/model';
import { createGamePackageInfo } from '../support/package-info';

describe('IndexedDB game-document draft store', () => {
    it('restores normalized scenes and native binary database data', async () => {
        const store = createIndexedDBGameDocumentDraftStore(
            window.indexedDB,
            `game-editor-draft-store-test-${uuidv4()}`,
        );
        const documentId = makeGameDocumentID(uuidv4());
        const firstSceneId = makeGameDocumentSceneID(uuidv4());
        const secondSceneId = makeGameDocumentSceneID(uuidv4());
        const databaseData = new Uint8Array([1, 2, 3, 4]);
        const savedGameFingerprint = `sha256:${'a'.repeat(64)}`;
        const packageInfo = createGamePackageInfo();
        const initialDocument: GameDocument = {
            id: documentId,
            filename: 'draft.xml',
            revision: 0,
            sourceKey: null,
            savedGameFingerprint,
            game: new Game(
                'Draft game',
                'Teaser',
                'Copyright',
                {
                    type: 'sqlite-db',
                    system: 'sqlite',
                    systemMinVersion: '3.0.0',
                    data: databaseData,
                },
                [
                    { type: 'text', text: 'First' },
                    { type: 'image', mediaType: 'image/png', base64string: 'large-image-data' },
                ],
            ),
        };
        await store.replace({
            document: initialDocument,
            packageInfo,
            sceneIds: [firstSceneId, secondSceneId],
            updatedAt: Date.now(),
        }, null);

        const changedDocument: GameDocument = {
            ...initialDocument,
            revision: 1,
            game: new Game(
                'Changed title',
                initialDocument.game.teaser,
                initialDocument.game.copyright,
                initialDocument.game.dbData,
                initialDocument.game.scenes,
            ),
        };
        await store.update({
            document: changedDocument,
            sceneIds: [secondSceneId, firstSceneId],
            scenesToPut: [{ id: firstSceneId, scene: { type: 'text', text: 'Changed first scene' } }],
            sceneIdsToDelete: [],
            databaseSource: { type: 'unchanged' },
        }, 0);

        const [restored] = await store.loadAll();
        expect(restored?.document.filename).toBe('draft.xml');
        expect(restored?.document.revision).toBe(1);
        expect(restored?.document.savedGameFingerprint).toBe(savedGameFingerprint);
        expect(restored?.document.game.title).toBe('Changed title');
        expect(restored?.document.game.scenes).toEqual([
            { type: 'image', mediaType: 'image/png', base64string: 'large-image-data' },
            { type: 'text', text: 'Changed first scene' },
        ]);
        expect(restored?.document.game.dbData).toEqual({
            type: 'sqlite-db',
            system: 'sqlite',
            systemMinVersion: '3.0.0',
            data: databaseData,
        });
        expect(restored?.packageInfo).toEqual(packageInfo);
        expect(restored?.sceneIds).toEqual([secondSceneId, firstSceneId]);

        await store.deleteDocument(documentId, 1);
        await expect(store.loadAll()).resolves.toEqual([]);
    });

    it('removes package information during a full draft replacement', async () => {
        const store = createIndexedDBGameDocumentDraftStore(
            window.indexedDB,
            `game-editor-draft-store-test-${uuidv4()}`,
        );
        const document: GameDocument = {
            id: makeGameDocumentID(uuidv4()),
            filename: 'dismiss-package.xml',
            revision: 0,
            sourceKey: null,
            savedGameFingerprint: null,
            game: new Game('Dismiss package', '', '', null, [{ type: 'text', text: 'Scene' }]),
        };
        const sceneId = makeGameDocumentSceneID(uuidv4());
        await store.replace({
            document,
            packageInfo: createGamePackageInfo(),
            sceneIds: [sceneId],
            updatedAt: 1,
        }, null);

        await store.replace({ document, sceneIds: [sceneId], updatedAt: 2 }, 0);

        const [restored] = await store.loadAll();
        expect(restored?.packageInfo).toBeUndefined();
    });

    it('keeps the previous draft when a full replacement transaction is aborted', async () => {
        const store = createIndexedDBGameDocumentDraftStore(
            window.indexedDB,
            `game-editor-draft-store-test-${uuidv4()}`,
        );
        const documentId = makeGameDocumentID(uuidv4());
        const firstSceneId = makeGameDocumentSceneID(uuidv4());
        const secondSceneId = makeGameDocumentSceneID(uuidv4());
        const initialDocument: GameDocument = {
            id: documentId,
            filename: 'atomic-draft.xml',
            revision: 3,
            sourceKey: null,
            savedGameFingerprint: null,
            game: new Game(
                'Before failed replacement',
                'Original teaser',
                'Original copyright',
                {
                    type: 'initial-sql-script',
                    system: 'sqlite',
                    systemMinVersion: '3.0.0',
                    sql: 'CREATE TABLE original (id INTEGER);',
                },
                [
                    { type: 'text', text: 'Original first scene' },
                    { type: 'text', text: 'Original second scene' },
                ],
            ),
        };
        await store.replace({
            document: initialDocument,
            sceneIds: [firstSceneId, secondSceneId],
            updatedAt: Date.now(),
        }, null);
        const invalidReplacement: GameDocument = {
            ...initialDocument,
            revision: 4,
            game: new Game(
                'Replacement that must roll back',
                'Changed teaser',
                'Changed copyright',
                {
                    type: 'initial-sql-script',
                    system: 'sqlite',
                    systemMinVersion: '3.0.0',
                    sql: 'CREATE TABLE changed (id INTEGER);',
                },
                [
                    { type: 'text', text: 'Changed first scene' },
                    { type: 'text', text: 'Changed second scene' },
                ],
            ),
        };

        await expect(store.replace({
            document: invalidReplacement,
            sceneIds: [firstSceneId],
            updatedAt: Date.now(),
        }, 3)).rejects.toThrow('The game document and draft scene-ID order must have equal lengths');

        const [restored] = await store.loadAll();
        expect(restored?.document.revision).toBe(3);
        expect(restored?.document.game.title).toBe('Before failed replacement');
        expect(restored?.document.game.scenes).toEqual(initialDocument.game.scenes);
        expect(restored?.document.game.dbData).toEqual(initialDocument.game.dbData);
        expect(restored?.sceneIds).toEqual([firstSceneId, secondSceneId]);
    });

    it('rejects stale updates and deletion without overwriting the newer draft', async () => {
        const store = createIndexedDBGameDocumentDraftStore(
            window.indexedDB,
            `game-editor-draft-store-test-${uuidv4()}`,
        );
        const documentId = makeGameDocumentID(uuidv4());
        const sceneId = makeGameDocumentSceneID(uuidv4());
        const initialDocument: GameDocument = {
            id: documentId,
            filename: 'concurrent-draft.xml',
            revision: 5,
            sourceKey: null,
            savedGameFingerprint: null,
            game: new Game('Initial title', '', '', null, [{ type: 'text', text: 'Scene' }]),
        };
        await store.replace({
            document: initialDocument,
            sceneIds: [sceneId],
            updatedAt: Date.now(),
        }, null);
        const firstWriterDocument: GameDocument = {
            ...initialDocument,
            revision: 6,
            game: new Game('First writer', '', '', null, initialDocument.game.scenes),
        };
        const staleWriterDocument: GameDocument = {
            ...initialDocument,
            revision: 6,
            game: new Game('Stale writer', '', '', null, initialDocument.game.scenes),
        };
        const unchangedScenes = {
            sceneIds: [sceneId],
            scenesToPut: [],
            sceneIdsToDelete: [],
            databaseSource: { type: 'unchanged' as const },
        };

        await store.update({ document: firstWriterDocument, ...unchangedScenes }, 5);
        await expect(store.update({ document: staleWriterDocument, ...unchangedScenes }, 5)).rejects.toEqual(
            new GameDocumentDraftConflictError(documentId, 5, 6),
        );
        await expect(store.deleteDocument(documentId, 5)).rejects.toBeInstanceOf(
            GameDocumentDraftConflictError,
        );

        const [restored] = await store.loadAll();
        expect(restored?.document.revision).toBe(6);
        expect(restored?.document.game.title).toBe('First writer');
    });

    it('skips malformed, incomplete, and invalid-database drafts while restoring valid drafts', async () => {
        const databaseName = `game-editor-draft-store-test-${uuidv4()}`;
        const store = createIndexedDBGameDocumentDraftStore(window.indexedDB, databaseName);
        const validDocumentId = makeGameDocumentID('valid-document');
        const validSceneId = makeGameDocumentSceneID('valid-scene');
        const draftWithoutFingerprint = makeRawDocumentRecord(
            'draft-without-fingerprint',
            ['draft-without-fingerprint-scene'],
        );
        delete draftWithoutFingerprint.savedGameFingerprint;
        await store.replace({
            document: {
                id: validDocumentId,
                filename: 'valid.xml',
                revision: 1,
                sourceKey: null,
                savedGameFingerprint: null,
                game: new Game(
                    'Valid draft',
                    'Valid teaser',
                    'Valid copyright',
                    null,
                    [{ type: 'text', text: 'Valid scene' }],
                ),
            },
            sceneIds: [validSceneId],
            updatedAt: 10,
        }, null);

        const database = await openDatabase(databaseName);
        await writeRawDraftRecords(database, {
            documents: [
                makeRawDocumentRecord('malformed-document', ['malformed-scene'], { revision: 'not-a-number' }),
                makeRawDocumentRecord('missing-scene-document', ['scene-that-does-not-exist']),
                makeRawDocumentRecord('invalid-database-document', ['invalid-database-scene']),
                makeRawDocumentRecord('invalid-package-info-document', ['invalid-package-info-scene']),
                draftWithoutFingerprint,
            ],
            scenes: [
                {
                    documentId: 'invalid-database-document',
                    id: 'invalid-database-scene',
                    scene: { type: 'text', text: 'Structurally valid scene' },
                },
                {
                    documentId: 'draft-without-fingerprint',
                    id: 'draft-without-fingerprint-scene',
                    scene: { type: 'text', text: 'Draft without fingerprint' },
                },
                {
                    documentId: 'invalid-package-info-document',
                    id: 'invalid-package-info-scene',
                    scene: { type: 'text', text: 'Draft with invalid package information' },
                },
            ],
            databaseSources: [{
                documentId: 'invalid-database-document',
                data: { type: 'sqlite-db', data: 'not-binary-data' },
            }],
            packageInfos: [{
                documentId: 'invalid-package-info-document',
                info: {},
            }],
        });
        database.close();

        const restored = await store.loadAll();
        expect(restored).toHaveLength(1);
        expect(restored[0]?.document.id).toBe(validDocumentId);
        expect(restored[0]?.document.game.title).toBe('Valid draft');
    });
});

function openDatabase(databaseName: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(databaseName, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Opening the test database failed'));
    });
}

function writeRawDraftRecords(database: IDBDatabase, records: {
    documents: unknown[],
    scenes: unknown[],
    databaseSources: unknown[],
    packageInfos: unknown[],
}): Promise<void> {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(
            ['documents', 'scenes', 'databaseSources', 'packageInfos'],
            'readwrite',
        );
        for (const documentRecord of records.documents) {
            transaction.objectStore('documents').put(documentRecord);
        }
        for (const sceneRecord of records.scenes) {
            transaction.objectStore('scenes').put(sceneRecord);
        }
        for (const databaseSourceRecord of records.databaseSources) {
            transaction.objectStore('databaseSources').put(databaseSourceRecord);
        }
        for (const packageInfoRecord of records.packageInfos) {
            transaction.objectStore('packageInfos').put(packageInfoRecord);
        }
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('Writing raw test records failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Writing raw test records was aborted'));
    });
}

function makeRawDocumentRecord(
    id: string,
    sceneIds: string[],
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        id,
        storageVersion: 1,
        filename: `${id}.xml`,
        revision: 0,
        sourceKey: null,
        savedGameFingerprint: null,
        title: id,
        teaser: '',
        copyright: '',
        system: 'sqlite',
        sceneIds,
        updatedAt: 1,
        ...overrides,
    };
}
