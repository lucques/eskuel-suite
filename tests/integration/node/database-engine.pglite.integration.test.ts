import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { InProcessPgliteEngine } from '../../../src/database/pglite/in-process-engine';
import { acquireDisposable } from '../support/effect';
import { describeDatabaseEngineContract } from '../support/database-engine-contract';

describeDatabaseEngineContract(
    'InProcessPgliteEngine contract',
    'postgresql',
    settingsStore => new InProcessPgliteEngine(settingsStore),
);

describe('InProcessPgliteEngine PostgreSQL behavior', () => {
    it.scopedLive('rejects a database requiring a newer PostgreSQL version', () => Effect.gen(function* () {
        const engine = yield* acquireDisposable(() => new InProcessPgliteEngine());
        const error = yield* Effect.flip(engine.open({
            type: 'initial-sql-script',
            system: 'postgresql',
            sql: 'SELECT TRUE;',
            systemMinVersion: '999.0.0',
        }, 'postgresql', '14.0.0'));

        expect(error).toMatchObject({
            kind: 'unsupported-database-system-version',
            system: 'postgresql',
            requiredMinVersion: '999.0.0',
        });
    }), 20_000);

    it.scopedLive('normalizes PostgreSQL values without losing precision or duplicate columns', () => Effect.gen(function* () {
        const engine = yield* acquireDisposable(() => new InProcessPgliteEngine());
        const database = yield* Effect.acquireRelease(
            engine.open(null, 'postgresql', '14.0.0'),
            connection => connection.close().pipe(Effect.orDie),
        );

        const result = yield* database.exec(`
            SELECT
                TRUE AS duplicate,
                42::integer AS duplicate,
                9007199254740993::bigint AS large_integer,
                1.20::numeric AS decimal,
                DATE '2026-08-11' AS calendar_date,
                '\\x0102'::bytea AS bytes
        `);

        expect(result).toEqual({
            type: 'succ',
            sql: expect.any(String),
            result: [{
                columns: ['duplicate', 'duplicate', 'large_integer', 'decimal', 'calendar_date', 'bytes'],
                values: [[true, 42, '9007199254740993', '1.20', '2026-08-11', new Uint8Array([1, 2])]],
            }],
        });
    }), 20_000);

    it.scopedLive('reads PostgreSQL column types and composite keys from pg_catalog', () => Effect.gen(function* () {
        const engine = yield* acquireDisposable(() => new InProcessPgliteEngine());
        const database = yield* Effect.acquireRelease(
            engine.open({
                type: 'initial-sql-script',
                system: 'postgresql',
                systemMinVersion: '14.0.0',
                sql: `
                    CREATE TABLE parent (
                        tenant_id INTEGER,
                        item_id INTEGER,
                        label VARCHAR(20),
                        PRIMARY KEY (tenant_id, item_id)
                    );
                    CREATE TABLE child (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER,
                        item_id INTEGER,
                        FOREIGN KEY (tenant_id, item_id) REFERENCES parent (tenant_id, item_id)
                    );
                `,
            }, 'postgresql', '14.0.0'),
            connection => connection.close().pipe(Effect.orDie),
        );

        const schema = yield* database.querySchema();

        expect(schema).toEqual([
            {
                name: 'child',
                cols: [
                    { name: 'id', type: 'integer' },
                    { name: 'tenant_id', type: 'integer' },
                    { name: 'item_id', type: 'integer' },
                ],
                primaryKey: ['id'],
                foreignKeys: {
                    tenant_id: [{ kind: 'column', foreignTable: 'parent', foreignCol: 'tenant_id' }],
                    item_id: [{ kind: 'column', foreignTable: 'parent', foreignCol: 'item_id' }],
                },
            },
            {
                name: 'parent',
                cols: [
                    { name: 'tenant_id', type: 'integer' },
                    { name: 'item_id', type: 'integer' },
                    { name: 'label', type: 'character varying(20)' },
                ],
                primaryKey: ['tenant_id', 'item_id'],
                foreignKeys: {},
            },
        ]);
    }), 20_000);
});
