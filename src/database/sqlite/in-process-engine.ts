import initSqlJs from 'sql.js';

import type { DatabaseEngine } from '../api';
import { SqliteCore } from './core';
import { SqliteProtocolEngine } from './protocol-engine';
import type { SqliteTransport } from './protocol-engine';
import type { SqliteRequest, SqliteResponse } from './protocol';
import { defaultSettingsStore } from '../../settings/store';
import type { SettingsStore } from '../../settings/store';

const sqlJs = initSqlJs();

class InProcessSqliteTransport implements SqliteTransport {
    private readonly core = new SqliteCore(sqlJs);

    request(request: SqliteRequest): Promise<SqliteResponse> {
        return this.core.request(request);
    }

    dispose(): void {
        this.core.dispose();
    }
}

export class InProcessSqliteEngine extends SqliteProtocolEngine {
    constructor(settingsStore: SettingsStore = defaultSettingsStore) {
        super(() => new InProcessSqliteTransport(), settingsStore);
    }
}

export const createInProcessSqliteDatabaseEngine = (): DatabaseEngine => new InProcessSqliteEngine();
