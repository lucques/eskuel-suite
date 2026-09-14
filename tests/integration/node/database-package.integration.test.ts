import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { loadDatabase } from '../../../src/database/loader';
import { InProcessPgliteEngine } from '../../../src/database/pglite/in-process-engine';
import { InProcessSqliteEngine } from '../../../src/database/sqlite/in-process-engine';
import { acquireDisposable } from '../support/effect';

describe('Eskuel database package integration', () => {
    it.scopedLive('loads and opens the packaged SQL example', () => Effect.gen(function* () {
        const source = readExampleArchive('initial-sql-script.eskueldb');
        const dbData = yield* loadDatabase({
            type: 'eskuel-database-package',
            source: { type: 'inline', content: source },
        });
        const engine = yield* acquireDisposable(() => new InProcessSqliteEngine());
        const database = yield* engine.open(dbData, dbData.system, dbData.systemMinVersion);

        expect(yield* database.querySchema()).toMatchObject([{ name: 'students' }]);
    }));

    it.scopedLive('loads and opens the packaged SQLite file example', () => Effect.gen(function* () {
        const source = readExampleArchive('database-file.eskueldb');
        const dbData = yield* loadDatabase({
            type: 'eskuel-database-package',
            source: { type: 'inline', content: source },
        });
        const engine = yield* acquireDisposable(() => new InProcessSqliteEngine());
        const database = yield* engine.open(dbData, dbData.system, dbData.systemMinVersion);

        expect(yield* database.querySchema()).toMatchObject([{ name: 'students' }]);
    }));

    it.scopedLive('loads and opens the packaged PostgreSQL script example', () => Effect.gen(function* () {
        const source = readExampleArchive('postgresql-initial-sql-script.eskueldb');
        const dbData = yield* loadDatabase({
            type: 'eskuel-database-package',
            source: { type: 'inline', content: source },
        });
        const engine = yield* acquireDisposable(() => new InProcessPgliteEngine());
        const database = yield* engine.open(dbData, dbData.system, dbData.systemMinVersion);

        expect(yield* database.querySchema()).toMatchObject([{ name: 'students' }]);
    }), 20_000);
});

function readExampleArchive(filename: string): Uint8Array {
    return new Uint8Array(readFileSync(new URL(
        `../../../spec/database-package/v1/examples/${filename}`,
        import.meta.url,
    )));
}
