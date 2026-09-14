import { PgliteCore } from './core';
import type { PgliteRequest, PgliteResponse } from './protocol';

type WorkerScope = {
    onmessage: ((event: MessageEvent<PgliteRequest>) => void) | null,
    postMessage(message: PgliteResponse): void,
};

const workerScope = globalThis as unknown as WorkerScope;
const core = new PgliteCore();

workerScope.onmessage = event => {
    void core.request(event.data).then(response => workerScope.postMessage(response));
};
