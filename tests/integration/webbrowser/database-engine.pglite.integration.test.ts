import { PgliteWorkerEngine } from '../../../src/database/pglite/engine';
import { describeDatabaseEngineContract } from '../support/database-engine-contract';

describeDatabaseEngineContract(
    'PgliteWorkerEngine contract',
    'postgresql',
    settingsStore => new PgliteWorkerEngine(settingsStore),
);
