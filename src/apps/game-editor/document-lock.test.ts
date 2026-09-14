import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

import { makeGameDocumentID } from './document';
import { createBrowserGameDocumentLockManager } from './document-lock';

describe('game-document locking', () => {
    it('allows one writer per document while allowing different documents', async () => {
        const firstManager = createBrowserGameDocumentLockManager(null);
        const secondManager = createBrowserGameDocumentLockManager(null);
        const firstDocumentId = makeGameDocumentID(uuidv4());
        const secondDocumentId = makeGameDocumentID(uuidv4());

        const firstLock = await firstManager.tryAcquire(firstDocumentId);
        expect(firstLock).not.toBeNull();
        expect(await secondManager.tryAcquire(firstDocumentId)).toBeNull();

        const differentDocumentLock = await secondManager.tryAcquire(secondDocumentId);
        expect(differentDocumentLock).not.toBeNull();
        differentDocumentLock?.release();

        firstLock?.release();
        const replacementLock = await secondManager.tryAcquire(firstDocumentId);
        expect(replacementLock).not.toBeNull();
        replacementLock?.release();
    });
});
