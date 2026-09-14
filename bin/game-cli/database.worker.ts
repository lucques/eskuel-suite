import { parentPort, workerData } from 'node:worker_threads';
import initSqlJs from 'sql.js';

import { SqliteCore } from '../../src/database/sqlite/core';
import { PgliteCore } from '../../src/database/pglite/core';
import type { SqliteRequest } from '../../src/database/sqlite/protocol';
import type { PgliteRequest } from '../../src/database/pglite/protocol';

const port = parentPort;
if (port === null) {
    throw new Error('This module must run in a database worker');
}
else if (workerData === 'sqlite') {
    const core = new SqliteCore(initSqlJs());
    port.on('message', (request: SqliteRequest) => {
        void core.request(request).then(response => port.postMessage(response));
    });
}
else if (workerData === 'postgresql') {
    const core = new PgliteCore();
    port.on('message', (request: PgliteRequest) => {
        void core.request(request).then(response => port.postMessage(response));
    });
}
else {
    throw new Error('Unknown database worker system');
}
