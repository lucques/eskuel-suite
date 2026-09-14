import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { InProcessPgliteEngine } from '../../../src/database/pglite/in-process-engine';
import { InProcessSqliteEngine } from '../../../src/database/sqlite/in-process-engine';
import { loadGame } from '../../../src/game/loader';
import { fastXmlParser } from '../../../src/game/xml/fast-parser';
import { acquireDisposable } from '../support/effect';

describe('Eskuel game package integration', () => {
    it.scopedLive('loads the XML and opens the packaged database dependency', () => Effect.gen(function* () {
        const archive = readExampleArchive('pokemon-adventure.eskuelgame');
        const game = yield* loadGame({
            type: 'eskuel-game-package',
            source: { type: 'inline', content: archive },
        }, fastXmlParser);
        const engine = yield* acquireDisposable(() => new InProcessSqliteEngine());
        const database = yield* engine.open(game.dbData, game.dbSystem, game.dbSystemMinVersion);

        expect(game.title).toBe('Pokémon Adventure');
        expect(game.dbData).toMatchObject({ type: 'initial-sql-script', system: 'sqlite' });
        expect(yield* database.querySchema()).toMatchObject([{ name: 'students' }]);
    }));

    it.scopedLive('loads and opens a PostgreSQL game package', () => Effect.gen(function* () {
        const archive = readExampleArchive('pokemon-adventure-postgresql.eskuelgame');
        const game = yield* loadGame({
            type: 'eskuel-game-package',
            source: { type: 'inline', content: archive },
        }, fastXmlParser);
        const engine = yield* acquireDisposable(() => new InProcessPgliteEngine());
        const database = yield* engine.open(game.dbData, game.dbSystem, game.dbSystemMinVersion);

        expect(game.title).toBe('Pokémon Adventure (PostgreSQL)');
        expect(game.dbData).toMatchObject({ type: 'initial-sql-script', system: 'postgresql' });
        expect(yield* database.querySchema()).toMatchObject([{ name: 'students' }]);
    }), 20_000);
});

function readExampleArchive(filename: string): Uint8Array {
    return new Uint8Array(readFileSync(new URL(
        `../../../spec/game-package/v1/examples/${filename}`,
        import.meta.url,
    )));
}
