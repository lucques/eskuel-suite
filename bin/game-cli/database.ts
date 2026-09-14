import { Worker } from 'node:worker_threads';

import { SystemDatabaseEngine } from '../../src/database/system-engine';
import { SqliteProtocolEngine } from '../../src/database/sqlite/protocol-engine';
import { PgliteProtocolEngine } from '../../src/database/pglite/protocol-engine';
import type { DatabaseSystem } from '../../src/database/system';
import type { SqliteRequest, SqliteResponse } from '../../src/database/sqlite/protocol';
import type { PgliteRequest, PgliteResponse } from '../../src/database/pglite/protocol';

class NodeDatabaseTransport<Request extends { requestId: number }, Response extends { requestId: number }> {
    private readonly worker: Worker;
    private readonly pending = new Map<number, { resolve: (response: Response) => void, reject: (error: Error) => void }>();
    private disposed = false;

    constructor(workerUrl: URL, system: DatabaseSystem, private readonly onFailure: () => void) {
        this.worker = new Worker(workerUrl, { workerData: system });
        this.worker.on('message', (response: Response) => {
            const request = this.pending.get(response.requestId);
            this.pending.delete(response.requestId);
            request?.resolve(response);
        });
        this.worker.on('error', error => this.fail(error));
        this.worker.on('exit', code => this.fail(new Error(`Database worker exited (${code})`)));
    }

    request(request: Request): Promise<Response> {
        if (this.disposed) {
            return Promise.reject(new Error('Database worker is disposed'));
        }
        else {
            return new Promise((resolve, reject) => {
                this.pending.set(request.requestId, { resolve, reject });
                try {
                    this.worker.postMessage(request);
                }
                catch (error: unknown) {
                    this.pending.delete(request.requestId);
                    reject(error);
                }
            });
        }
    }

    dispose(): void {
        if (!this.disposed) {
            this.disposed = true;
            void this.worker.terminate();
            for (const request of this.pending.values()) {
                request.reject(new Error('Database worker was disposed'));
            }
            this.pending.clear();
        }
    }

    private fail(error: Error): void {
        if (!this.disposed) {
            for (const request of this.pending.values()) {
                request.reject(error);
            }
            this.pending.clear();
            this.dispose();
            this.onFailure();
        }
    }
}

export function createCliDatabaseEngine(workerUrl: URL) {
    return new SystemDatabaseEngine({
        sqlite: () => new SqliteProtocolEngine(onFailure => new NodeDatabaseTransport<SqliteRequest, SqliteResponse>(workerUrl, 'sqlite', onFailure)),
        postgresql: () => new PgliteProtocolEngine(onFailure => new NodeDatabaseTransport<PgliteRequest, PgliteResponse>(workerUrl, 'postgresql', onFailure)),
    });
}
