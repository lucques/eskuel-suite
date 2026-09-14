import { Game } from '../../../src/game/model';
import {
    DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS,
    type DatabaseSystem,
} from '../../../src/database/system';

export function createInventoryGame(dbSystem: DatabaseSystem = 'sqlite'): Game {
    return new Game(
        'Inventory',
        'A real-database integration game',
        'Test fixture',
        {
            type: 'initial-sql-script',
            system: dbSystem,
            systemMinVersion: DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS[dbSystem],
            sql: `
                CREATE TABLE items (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    collected INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO items VALUES
                    (1, 'hammer', 0),
                    (2, 'key', 0);
            `,
        },
        [
            { type: 'text', text: 'Introduction' },
            {
                type: 'select',
                text: 'List every item',
                sqlSol: 'SELECT name FROM items ORDER BY id',
                sqlPlaceholder: 'SELECT',
                ordinaryHints: [],
                hasSolHint: false,
                isRowOrderRelevant: true,
                isColOrderRelevant: true,
                areColNamesRelevant: true,
            },
            {
                type: 'manipulate',
                text: 'Collect the key',
                sqlSol: "UPDATE items SET collected = 1 WHERE name = 'key'",
                sqlCheck: 'SELECT name, collected FROM items ORDER BY id',
                sqlPlaceholder: 'UPDATE',
                ordinaryHints: [],
                hasSolHint: false,
            },
            {
                type: 'select',
                text: 'Show collected items',
                sqlSol: 'SELECT name FROM items WHERE collected = 1',
                sqlPlaceholder: 'SELECT',
                ordinaryHints: [],
                hasSolHint: false,
                isRowOrderRelevant: true,
                isColOrderRelevant: true,
                areColNamesRelevant: true,
            },
            { type: 'text', text: 'Finished' },
        ],
        dbSystem,
        DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS[dbSystem],
    );
}
