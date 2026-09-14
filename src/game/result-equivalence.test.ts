import { describe, expect, it } from 'vitest';

import type { SqlTable, SqlValue } from '../database/api';
import { areSqlTablesEquivalent } from './result-equivalence';
import type { SqlTableEquivalenceOptions } from './result-equivalence';

const exactOptions: SqlTableEquivalenceOptions = {
    isRowOrderRelevant: true,
    isColOrderRelevant: true,
    areColNamesRelevant: true,
};

const table = (columns: string[], values: SqlValue[][], truncated = false): SqlTable => ({
    columns,
    values,
    truncated,
});

describe('SQL table equivalence', () => {
    it('accepts identical results containing every supported SQL value type', () => {
        const result = table(
            ['number', 'boolean', 'text', 'nullable', 'binary'],
            [[1, true, 'one', null, new Uint8Array([1, 2, 3])]],
        );

        expect(areSqlTablesEquivalent(result, result, exactOptions)).toBe(true);
    });

    it('rejects truncated results', () => {
        const complete = table(['value'], [[1]]);
        const truncated = table(['value'], [[1]], true);

        expect(areSqlTablesEquivalent(complete, truncated, exactOptions)).toBe(false);
        expect(areSqlTablesEquivalent(truncated, complete, exactOptions)).toBe(false);
    });

    it('rejects different row or column counts', () => {
        const result = table(['value'], [[1]]);

        expect(areSqlTablesEquivalent(result, table(['value'], [[1], [2]]), exactOptions)).toBe(false);
        expect(areSqlTablesEquivalent(result, table(['value', 'other'], [[1, 2]]), exactOptions)).toBe(false);
    });

    it('observes the row-order setting', () => {
        const first = table(['value'], [[1], [2]]);
        const reordered = table(['value'], [[2], [1]]);

        expect(areSqlTablesEquivalent(first, reordered, exactOptions)).toBe(false);
        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isRowOrderRelevant: false,
        })).toBe(true);
    });

    it('observes the column-order setting', () => {
        const first = table(['id', 'name'], [[1, 'hammer'], [2, 'key']]);
        const reordered = table(['name', 'id'], [['hammer', 1], ['key', 2]]);

        expect(areSqlTablesEquivalent(first, reordered, exactOptions)).toBe(false);
        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isColOrderRelevant: false,
        })).toBe(true);
    });

    it('observes the column-name setting', () => {
        const first = table(['expected'], [[1]]);
        const renamed = table(['actual'], [[1]]);

        expect(areSqlTablesEquivalent(first, renamed, exactOptions)).toBe(false);
        expect(areSqlTablesEquivalent(first, renamed, {
            ...exactOptions,
            areColNamesRelevant: false,
        })).toBe(true);
    });

    it('matches reordered columns by signature when column names are ignored', () => {
        const first = table(['number', 'text'], [[1, 'a'], [2, 'b']]);
        const reordered = table(['renamed-text', 'renamed-number'], [['a', 1], ['b', 2]]);

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isColOrderRelevant: false,
            areColNamesRelevant: false,
        })).toBe(true);
    });

    it('tries multiple permutations for duplicate column names', () => {
        const first = table(['value', 'value'], [[1, 'a'], [2, 'b']]);
        const reordered = table(['value', 'value'], [['a', 1], ['b', 2]]);

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isColOrderRelevant: false,
        })).toBe(true);
    });

    it('handles eight duplicate column names with reversed values', () => {
        const columns = Array<string>(8).fill('value');
        const values = Array.from({ length: 8 }, (_, index) => index);
        const first = table(columns, [values]);
        const reversed = table(columns, [[...values].reverse()]);

        expect(areSqlTablesEquivalent(first, reversed, {
            ...exactOptions,
            isColOrderRelevant: false,
        })).toBe(true);
    });

    it('tries multiple permutations for duplicate column signatures', () => {
        const first = table(['left', 'right'], [[1, 2], [2, 1]]);
        const reordered = table(['renamed-right', 'renamed-left'], [[2, 1], [1, 2]]);

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isColOrderRelevant: false,
            areColNamesRelevant: false,
        })).toBe(true);
    });

    it('rejects tables when matching column signatures yield no valid permutation', () => {
        const first = table(['left', 'right'], [[1, 1], [2, 2]]);
        const incompatible = table(['renamed-left', 'renamed-right'], [[1, 2], [2, 1]]);

        expect(areSqlTablesEquivalent(first, incompatible, {
            ...exactOptions,
            isRowOrderRelevant: false,
            isColOrderRelevant: false,
            areColNamesRelevant: false,
        })).toBe(false);
    });

    it('matches reordered columns whose typed values share string representations', () => {
        const first = table(
            ['number', 'numeric-text', 'bytes', 'binary-text'],
            [[0, '0', new Uint8Array([1, 2]), '1,2']],
        );
        const reordered = table(
            ['renamed-numeric-text', 'renamed-number', 'renamed-binary-text', 'renamed-bytes'],
            [['0', 0, '1,2', new Uint8Array([1, 2])]],
        );

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isColOrderRelevant: false,
            areColNamesRelevant: false,
        })).toBe(true);
    });

    it('matches tables when rows and columns are reordered simultaneously', () => {
        const first = table(['id', 'name'], [[1, 'hammer'], [2, 'key']]);
        const reordered = table(['name', 'id'], [['key', 2], ['hammer', 1]]);

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isRowOrderRelevant: false,
            isColOrderRelevant: false,
        })).toBe(true);
    });

    it('matches empty multi-column results when column names and order are ignored', () => {
        const first = table(['first', 'second'], []);
        const renamed = table(['renamed-second', 'renamed-first'], []);

        expect(areSqlTablesEquivalent(first, renamed, {
            ...exactOptions,
            isColOrderRelevant: false,
            areColNamesRelevant: false,
        })).toBe(true);
    });

    it('compares duplicate unordered rows as a multiset', () => {
        const first = table(['value'], [[1], [2], [1]]);
        const reordered = table(['value'], [[1], [1], [2]]);

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isRowOrderRelevant: false,
        })).toBe(true);
    });

    it('distinguishes different row multiplicities when rows are unordered', () => {
        const first = table(['value'], [[1], [1], [2]]);
        const differentMultiplicities = table(['value'], [[1], [2], [2]]);

        expect(areSqlTablesEquivalent(first, differentMultiplicities, {
            ...exactOptions,
            isRowOrderRelevant: false,
        })).toBe(false);
    });

    it('matches reordered zero and empty-string rows when row order is irrelevant', () => {
        const first = table(['value'], [[0], ['']]);
        const reordered = table(['value'], [[''], [0]]);

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isRowOrderRelevant: false,
        })).toBe(true);
    });

    it('distinguishes null and empty-string rows when row order is irrelevant', () => {
        const nullRow = table(['value'], [[null]]);
        const emptyStringRow = table(['value'], [['']]);

        expect(areSqlTablesEquivalent(nullRow, emptyStringRow, {
            ...exactOptions,
            isRowOrderRelevant: false,
        })).toBe(false);
    });

    it('matches reordered empty binary and escaped-text rows', () => {
        const escapedText = 'quote: ", backslash: \\, newline:\nsecond line';
        const first = table(['value'], [[new Uint8Array()], [''], [escapedText]]);
        const reordered = table(['value'], [[escapedText], [''], [new Uint8Array()]]);

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isRowOrderRelevant: false,
        })).toBe(true);
    });

    it('matches reordered NaN and infinity rows', () => {
        const first = table(['value'], [[NaN], [Infinity], [-Infinity]]);
        const reordered = table(['value'], [[-Infinity], [NaN], [Infinity]]);

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isRowOrderRelevant: false,
        })).toBe(true);
    });

    it('treats negative zero and zero as equivalent when row order is relevant', () => {
        const negativeZero = table(['value'], [[-0]]);
        const zero = table(['value'], [[0]]);

        expect(areSqlTablesEquivalent(negativeZero, zero, exactOptions)).toBe(true);
    });
});

describe('SQL table equivalence for rows with ambiguous string representations', () => {
    it('matches reordered null and empty-string rows when row order is irrelevant', () => {
        const first = table(['value'], [[null], ['']]);
        const reordered = table(['value'], [[''], [null]]);

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isRowOrderRelevant: false,
        })).toBe(true);
    });

    it('matches reordered string rows that have colliding default sort keys', () => {
        const first = table(['first', 'second'], [['a,b', 'c'], ['a', 'b,c']]);
        const reordered = table(['first', 'second'], [['a', 'b,c'], ['a,b', 'c']]);

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isRowOrderRelevant: false,
        })).toBe(true);
    });

    it('matches reordered number and numeric-string rows when row order is irrelevant', () => {
        const first = table(['value'], [[0], ['0']]);
        const reordered = table(['value'], [['0'], [0]]);

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isRowOrderRelevant: false,
        })).toBe(true);
    });

    it('matches reordered binary and text rows with colliding default sort keys', () => {
        const first = table(['value'], [[new Uint8Array([1, 2])], ['1,2']]);
        const reordered = table(['value'], [['1,2'], [new Uint8Array([1, 2])]]);

        expect(areSqlTablesEquivalent(first, reordered, {
            ...exactOptions,
            isRowOrderRelevant: false,
        })).toBe(true);
    });
});
