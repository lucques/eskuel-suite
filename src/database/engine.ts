import type { DatabaseEngine } from './api';
import { SystemDatabaseEngine } from './system-engine';
import { createPgliteDatabaseEngine } from './pglite/engine';
import { createSqliteDatabaseEngine } from './sqlite/engine';

export const createDatabaseEngine = (): DatabaseEngine => new SystemDatabaseEngine({
    sqlite: createSqliteDatabaseEngine,
    postgresql: createPgliteDatabaseEngine,
});
