import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { createNodeGameSession } from '../../../src/platform/node/create-game-session';
import { acquireDisposable } from '../support/effect';
import { getReadySnapshot } from '../support/session';
import minimalSelectXml from '../fixtures/games/valid/minimal-select.xml?raw';
import missingTitleXml from '../fixtures/games/invalid/missing-title.xml?raw';
import noDatabaseXml from '../fixtures/games/valid/no-database.xml?raw';
import unsupportedSchemaXml from '../fixtures/games/invalid/unsupported-schema.xml?raw';

describe('XML game loading', () => {
    it.scopedLive('parses an XML fixture and initializes its real database', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => createNodeGameSession({
            type: 'xml',
            source: { type: 'inline', content: minimalSelectXml },
        }));

        yield* session.resolve();
        const snapshot = getReadySnapshot(session);
        expect(snapshot.game.title).toBe('Minimal Select');
        expect(snapshot.schemaStatus.kind).toBe('loaded');

        yield* session.dispatch({ type: 'next-scene', origin: 'navbar' });
        yield* session.dispatch({ type: 'submit-sql', sql: 'SELECT name FROM items ORDER BY id' });
        expect(getReadySnapshot(session).results[0]?.type).toBe('correct');
    }));

    it.scopedLive('publishes a typed parsing failure for invalid XML', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => createNodeGameSession({
            type: 'xml',
            source: { type: 'inline', content: missingTitleXml },
        }));

        const error = yield* Effect.flip(session.resolve());
        expect(error.kind).toBe('parse-xml');
        expect(session.getSnapshot()).toMatchObject({
            kind: 'failed',
            error: { kind: 'parse-xml' },
        });
    }));

    it.scopedLive('initializes an empty database when the XML has no database source', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => createNodeGameSession({
            type: 'xml',
            source: { type: 'inline', content: noDatabaseXml },
        }));

        yield* session.resolve();
        const snapshot = getReadySnapshot(session);
        expect(snapshot.game.dbData).toBeNull();
        expect(snapshot.schemaStatus).toEqual({ kind: 'loaded', data: [] });

        yield* session.dispatch({ type: 'submit-sql', sql: 'SELECT TRUE' });
        expect(getReadySnapshot(session).results[0]?.type).toBe('correct');
    }));

    it.scopedLive('keeps the game available when its database schema cannot be parsed', () => Effect.gen(function* () {
        const session = yield* acquireDisposable(() => createNodeGameSession({
            type: 'xml',
            source: { type: 'inline', content: unsupportedSchemaXml },
        }));

        yield* session.resolve();
        const snapshot = getReadySnapshot(session);
        expect(snapshot.game.title).toBe('Unsupported schema');
        expect(snapshot.schemaStatus).toMatchObject({
            kind: 'failed',
            error: { kind: 'parse-schema' },
        });

        yield* session.dispatch({ type: 'submit-sql', sql: 'SELECT COUNT(*) AS count FROM example' });
        expect(getReadySnapshot(session).results[0]).toMatchObject({
            type: 'sql',
            res: {
                type: 'succ',
                result: [{ columns: ['count'], values: [[0]] }],
            },
        });
    }));
});
