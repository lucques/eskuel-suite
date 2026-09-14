export type GameDocumentLock = {
    release(): void;
};

export interface GameDocumentLockManager {
    tryAcquire(resourceKey: string): Promise<GameDocumentLock | null>;
}

type BrowserLockManager = {
    request<T>(
        name: string,
        options: { mode: 'exclusive', ifAvailable: true },
        callback: (lock: Lock | null) => Promise<T> | T,
    ): Promise<T>;
};

const fallbackLocks = new Set<string>();

export function createBrowserGameDocumentLockManager(
    browserLocks: BrowserLockManager | null = getBrowserLockManager(),
): GameDocumentLockManager {
    if (browserLocks === null) {
        return {
            async tryAcquire(resourceKey) {
                if (fallbackLocks.has(resourceKey)) {
                    return null;
                }
                else {
                    fallbackLocks.add(resourceKey);
                    let released = false;
                    return {
                        release() {
                            if (!released) {
                                released = true;
                                fallbackLocks.delete(resourceKey);
                            }
                        },
                    };
                }
            },
        };
    }
    else {
        return {
            tryAcquire(resourceKey) {
                return new Promise<GameDocumentLock | null>((resolve, reject) => {
                    let acquisitionSettled = false;
                    const held = browserLocks.request(
                        `eskuel:game-editor:${resourceKey}`,
                        { mode: 'exclusive', ifAvailable: true },
                        lock => {
                            if (lock === null) {
                                acquisitionSettled = true;
                                resolve(null);
                                return;
                            }
                            else {
                                return new Promise<void>(release => {
                                    let released = false;
                                    acquisitionSettled = true;
                                    resolve({
                                        release() {
                                            if (!released) {
                                                released = true;
                                                release();
                                            }
                                        },
                                    });
                                });
                            }
                        },
                    );
                    void held.catch((error: unknown) => {
                        if (!acquisitionSettled) {
                            acquisitionSettled = true;
                            reject(error);
                        }
                    });
                });
            },
        };
    }
}

function getBrowserLockManager(): BrowserLockManager | null {
    if (typeof navigator === 'undefined' || navigator.locks === undefined) {
        return null;
    }
    else {
        return navigator.locks;
    }
}
