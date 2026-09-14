import { describe, expect, it } from 'vitest';

import { getDatabaseFileSourceType } from './source';

describe('database source filename recognition', () => {
    it.each([
        ['database.sql', 'initial-sql-script'],
        ['database.sqlite', 'sqlite-db'],
        ['database.ESKUELDB', 'eskuel-database-package'],
        ['database.csv', undefined],
    ] as const)('recognizes %s', (filename, expected) => {
        expect(getDatabaseFileSourceType(filename)).toBe(expected);
    });
});
