import PgliteWorker from './pglite.worker?worker';

import type { DatabaseEngine } from '../api';
import { defaultSettingsStore } from '../../settings/store';
import type { SettingsStore } from '../../settings/store';
import { PgliteProtocolEngine } from './protocol-engine';
import type { PgliteTransport } from './protocol-engine';
import type { PgliteRequest, PgliteResponse } from './protocol';

type PendingRequest = {
    resolve(response: PgliteResponse): void,
    reject(error: Error): void,
};

class PgliteWorkerTransport implements PgliteTransport {
    private readonly worker = new PgliteWorker();
    private readonly pendingRequests = new Map<number, PendingRequest>();
    private disposed = false;

    constructor(private readonly onFailure: () => void) {
        this.worker.onmessage = (event: MessageEvent<PgliteResponse>) => {
            const response = event.data;
            const pending = this.pendingRequests.get(response.requestId);
            if (pending === undefined) {
                // The request was already rejected during disposal.
            }
            else {
                this.pendingRequests.delete(response.requestId);
                pending.resolve(response);
            }
        };
        this.worker.onerror = event => {
            if (!this.disposed) {
                this.disposed = true;
                const error = new Error(event.message || 'PGlite worker failed');
                this.rejectPendingRequests(error);
                this.worker.terminate();
                this.onFailure();
            }
        };
    }

    request(request: PgliteRequest): Promise<PgliteResponse> {
        if (this.disposed) {
            return Promise.reject(new Error('PGlite worker transport is disposed'));
        }
        else {
            return new Promise((resolve, reject) => {
                this.pendingRequests.set(request.requestId, { resolve, reject });
                this.worker.postMessage(request);
            });
        }
    }

    dispose(): void {
        if (!this.disposed) {
            this.disposed = true;
            this.worker.terminate();
            this.rejectPendingRequests(new Error('PGlite worker transport was disposed'));
        }
    }

    private rejectPendingRequests(error: Error): void {
        for (const request of this.pendingRequests.values()) {
            request.reject(error);
        }
        this.pendingRequests.clear();
    }
}

export class PgliteWorkerEngine extends PgliteProtocolEngine {
    constructor(settingsStore: SettingsStore = defaultSettingsStore) {
        super(onFailure => new PgliteWorkerTransport(onFailure), settingsStore);
    }
}

export const createPgliteDatabaseEngine = (): DatabaseEngine => new PgliteWorkerEngine();
