import { Effect } from 'effect';

import type {
    DatabaseConnection,
    DatabaseEngine,
    DatabaseEngineFactory,
    DbData,
    InitDbFail,
} from './api';
import type { DatabaseSystem } from './system';

export class SystemDatabaseEngine implements DatabaseEngine {
    private readonly engines = new Map<DatabaseSystem, DatabaseEngine>();
    private disposed = false;

    constructor(private readonly factories: Record<DatabaseSystem, DatabaseEngineFactory>) {}

    open(
        source: DbData | null,
        system: DatabaseSystem,
        systemMinVersion: string,
    ): Effect.Effect<DatabaseConnection, InitDbFail> {
        return Effect.suspend(() => {
            if (this.disposed) {
                return Effect.fail({ kind: 'database-engine' as const, details: 'Database engine is disposed' });
            }
            else {
                return this.getEngine(system).open(source, system, systemMinVersion);
            }
        });
    }

    dispose(): void {
        if (!this.disposed) {
            this.disposed = true;
            for (const engine of this.engines.values()) {
                engine.dispose();
            }
            this.engines.clear();
        }
    }

    private getEngine(system: DatabaseSystem): DatabaseEngine {
        const existing = this.engines.get(system);
        if (existing !== undefined) {
            return existing;
        }
        else {
            const engine = this.factories[system]();
            this.engines.set(system, engine);
            return engine;
        }
    }
}
