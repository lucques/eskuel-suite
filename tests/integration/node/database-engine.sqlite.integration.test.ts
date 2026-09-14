import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { InProcessSqliteEngine } from '../../../src/database/sqlite/in-process-engine';
import { acquireDisposable } from '../support/effect';
import { describeDatabaseEngineContract } from '../support/database-engine-contract';

describeDatabaseEngineContract(
    'InProcessSqliteEngine contract',
    'sqlite',
    settingsStore => new InProcessSqliteEngine(settingsStore),
);

describe('InProcessSqliteEngine system selection', () => {
    it.scopedLive('rejects PostgreSQL scripts before executing them as SQLite', () => Effect.gen(function* () {
        const engine = yield* acquireDisposable(() => new InProcessSqliteEngine());
        const error = yield* Effect.flip(engine.open({
            type: 'initial-sql-script',
            system: 'postgresql',
            systemMinVersion: '14.0.0',
            sql: 'SELECT TRUE;',
        }, 'postgresql', '14.0.0'));

        expect(error).toMatchObject({
            kind: 'unsupported-database-system',
            system: 'postgresql',
        });
    }));
});

describe('InProcessSqliteEngine version requirements', () => {
    it.scopedLive('rejects a database requiring a newer SQLite version', () => Effect.gen(function* () {
        const engine = yield* acquireDisposable(() => new InProcessSqliteEngine());
        const error = yield* Effect.flip(engine.open({
            type: 'initial-sql-script',
            system: 'sqlite',
            sql: 'SELECT 1;',
            systemMinVersion: '999.0.0',
        }, 'sqlite', '3.0.0'));

        expect(error).toMatchObject({
            kind: 'unsupported-database-system-version',
            system: 'sqlite',
            requiredMinVersion: '999.0.0',
        });
    }));
});

describe('InProcessSqliteEngine schema extraction', () => {
    it.scopedLive('extracts a table-level autoincrement primary key', () => Effect.gen(function* () {
        const engine = yield* acquireDisposable(() => new InProcessSqliteEngine());
        const database = yield* engine.open({
            type: 'initial-sql-script',
            system: 'sqlite',
            systemMinVersion: '3.0.0',
            sql: `
                CREATE TABLE "fahrschueler" (
                    "nr" INTEGER,
                    "vorname" TEXT,
                    PRIMARY KEY("nr" AUTOINCREMENT)
                );
            `,
        }, 'sqlite', '3.0.0');
        const schema = yield* database.querySchema();

        expect(schema).toEqual([{
            name: 'fahrschueler',
            cols: [
                { name: 'nr', type: 'INTEGER' },
                { name: 'vorname', type: 'TEXT' },
            ],
            primaryKey: ['nr'],
            foreignKeys: {},
        }]);
    }));
});
