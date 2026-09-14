import { describe, expect, it } from 'vitest';

import type { SqlResult } from './api';
import { truncateSqlResultRowsPerTable } from './result';

describe('truncateSqlResultRowsPerTable', () => {
    it('truncates each table independently and marks tables that lost rows', () => {
        const result: SqlResult = {
            type: 'succ',
            sql: 'SELECT values',
            result: [
                { columns: ['value'], values: [[1], [2], [3]] },
                { columns: ['value'], values: [[4]] },
            ],
        };

        expect(truncateSqlResultRowsPerTable(result, 2)).toEqual({
            type: 'succ',
            sql: 'SELECT values',
            result: [
                { columns: ['value'], values: [[1], [2]], truncated: true },
                { columns: ['value'], values: [[4]] },
            ],
        });
        expect(result.result[0].values).toEqual([[1], [2], [3]]);
    });

    it('preserves truncation reported by the database engine', () => {
        const result: SqlResult = {
            type: 'succ',
            sql: 'SELECT value',
            result: [{ columns: ['value'], values: [[1]], truncated: true }],
        };

        expect(truncateSqlResultRowsPerTable(result, 2)).toEqual(result);
    });

    it('leaves error results unchanged', () => {
        const result: SqlResult = { type: 'error', sql: 'INVALID', message: 'Invalid SQL' };

        expect(truncateSqlResultRowsPerTable(result, 2)).toBe(result);
    });
});
