import { SqliteWorkerEngine } from '../../../src/database/sqlite/engine';
import { describeDatabaseEngineContract } from '../support/database-engine-contract';

describeDatabaseEngineContract(
    'SqliteWorkerEngine contract',
    'sqlite',
    settingsStore => new SqliteWorkerEngine(settingsStore),
);
