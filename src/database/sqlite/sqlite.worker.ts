import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

import { SqliteCore } from './core';
import type { SqliteRequest, SqliteResponse } from './protocol';

type WorkerScope = {
    onmessage: ((event: MessageEvent<SqliteRequest>) => void) | null,
    postMessage(message: SqliteResponse): void,
};

const workerScope = globalThis as unknown as WorkerScope;
const core = new SqliteCore(initSqlJs({ locateFile: () => wasmUrl }));

workerScope.onmessage = event => {
    void core.request(event.data).then(response => workerScope.postMessage(response));
};
