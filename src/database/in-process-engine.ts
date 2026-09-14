import type { DatabaseEngine } from './api';
import { SystemDatabaseEngine } from './system-engine';
import { createInProcessPgliteDatabaseEngine } from './pglite/in-process-engine';
import { createInProcessSqliteDatabaseEngine } from './sqlite/in-process-engine';

export const createInProcessDatabaseEngine = (): DatabaseEngine => new SystemDatabaseEngine({
    sqlite: createInProcessSqliteDatabaseEngine,
    postgresql: createInProcessPgliteDatabaseEngine,
});
