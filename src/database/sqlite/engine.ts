import SqliteWorker from './sqlite.worker?worker';

import type { DatabaseEngine } from '../api';
import { SqliteProtocolEngine } from './protocol-engine';
import type { SqliteTransport } from './protocol-engine';
import type { SqliteRequest, SqliteResponse } from './protocol';
import { defaultSettingsStore } from '../../settings/store';
import type { SettingsStore } from '../../settings/store';

type PendingRequest = {
    resolve(response: SqliteResponse): void,
    reject(error: Error): void,
};

class SqliteWorkerTransport implements SqliteTransport {
    private readonly worker = new SqliteWorker();
    private readonly pendingRequests = new Map<number, PendingRequest>();
    private disposed = false;

    constructor(private readonly onFailure: () => void) {
        this.worker.onmessage = (event: MessageEvent<SqliteResponse>) => {
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
            // Handle only the first transport failure.
            if (!this.disposed) {
                this.disposed = true;
                const error = new Error(event.message || 'SQLite worker failed');
                this.rejectPendingRequests(error);
                this.worker.terminate();
                this.onFailure();
            }
        };
    }

    request(request: SqliteRequest): Promise<SqliteResponse> {
        if (this.disposed) {
            return Promise.reject(new Error('SQLite worker transport is disposed'));
        }
        else {
            return new Promise((resolve, reject) => {
                this.pendingRequests.set(request.requestId, { resolve, reject });
                this.worker.postMessage(request);
            });
        }
    }

    dispose(): void {
        // Disposal is idempotent.
        if (!this.disposed) {
            this.disposed = true;
            this.worker.terminate();
            this.rejectPendingRequests(new Error('SQLite worker transport was disposed'));
        }
    }

    private rejectPendingRequests(error: Error): void {
        for (const request of this.pendingRequests.values()) {
            request.reject(error);
        }
        this.pendingRequests.clear();
    }
}

export class SqliteWorkerEngine extends SqliteProtocolEngine {
    constructor(settingsStore: SettingsStore = defaultSettingsStore) {
        super(onFailure => new SqliteWorkerTransport(onFailure), settingsStore);
    }
}

export const createSqliteDatabaseEngine = (): DatabaseEngine => new SqliteWorkerEngine();
