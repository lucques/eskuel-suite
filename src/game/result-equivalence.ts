import _ from 'lodash';
import stringHash from 'string-hash';

import { SqlTable, SqlValue } from '../database/api';
import { encodeToBase64 } from '../util';

export type SqlTableEquivalenceOptions = {
    isRowOrderRelevant: boolean;
    isColOrderRelevant: boolean;
    areColNamesRelevant: boolean;
};

export function areSqlTablesEquivalent(
    a: SqlTable,
    b: SqlTable,
    options: SqlTableEquivalenceOptions,
): boolean {
    const {
        isRowOrderRelevant,
        isColOrderRelevant,
        areColNamesRelevant,
    } = options;

    if (a.truncated === true || b.truncated === true) {
        return false;
    }

    // Number of rows must match; number of columns too.
    if (a.values.length != b.values.length || a.columns.length != b.columns.length) {
        return false;
    }

    // Potentially, col names must match
    if (areColNamesRelevant && !_.isEqual(_.sortBy(a.columns), _.sortBy(b.columns))) {
        return false;
    }

    // If col order is relevant, take identity permutation
    // Else: Columns still have an identity
    //   − if col names relevant,   column names define identity. Compute permutations on those
    //   − if col names irrelevant, column signatures define idenity. Compute permutations on those
    const permutations: number[][] =
        isColOrderRelevant
        ? [Array.from({length: a.columns.length}, (_, i) => i)] // Identity permutation
        : areColNamesRelevant
          ? computePermutations(a.columns, b.columns)
          : computePermutations(computeColumnSignatures(a.values), computeColumnSignatures(b.values));

    // It is only relevant whether *some* of the permutations yields row-wise equality.
    let existsCorrectPermutation = false;
    const bRowSortKeys = isRowOrderRelevant
        ? []
        : b.values.map(computeRowSortKey).sort();

    for (const permutation of permutations)
    {
        // If col names are relevant, permute them and check.
        if (areColNamesRelevant) {
            const aColumns = permute(a.columns, permutation);
            if (!_.isEqual(aColumns, b.columns)) {
                continue;
            }
        }

        const aValues = a.values.map(row => permute(row, permutation));

        const isCurrentPermutationCorrect = isRowOrderRelevant
            ? _.isEqual(aValues, b.values)
            : _.isEqual(
                aValues.map(computeRowSortKey).sort(),
                bRowSortKeys,
            );

        // Stop at the first matching column permutation.
        if (isCurrentPermutationCorrect) {
            existsCorrectPermutation = true;
            break;
        }
    }

    return existsCorrectPermutation;
}

/**
 * Example:
 *
 * source = ["a", "b", "b"]
 * target = ["b", "a", "b"]
 *
 * ->
 *
 * [
 *   [1, 0, 2],
 *   [2, 0, 1]
 * ]
 *
 * `source` and `target` contain the same elements, but in potentially different
 * order. There may be duplicates! That's when there are multiple permutations.
 *
 * If some elements are unreachable (e.g., source = ["a", "b"], target = ["a", "c"]),
 * return empty array.
 */
function computePermutations(source: string[], target: string[]): number[][] {
    if (!_.isEqual(_.sortBy(source), _.sortBy(target))) {
        return [];
    }

    function computePermutationsRec(source: [number, string][], target: [number, string][]): number[][] {
        // No need to clone here since TypeScript ensures immutability in this context
        if (target.length === 0) {
            return [[]];
        } else {
            const curElement = target[0][1]; // Adjusted to directly access the first element

            // Find `curElement` in the source array
            const candidates = source.filter(x => x[1] === curElement);

            let permutations: number[][] = [];

            for (const candidate of candidates) {
                const restSource = source.filter(x => x !== candidate);
                const restTarget = target.slice(1); // Use slice to get the tail
                const restPermutations = computePermutationsRec(restSource, restTarget);
                for (const restPermutation of restPermutations) {
                    restPermutation.unshift(candidate[0]);
                }

                permutations = [...permutations, ...restPermutations];
            }

            return permutations;
        }
    }

    // Convert string arrays to arrays of tuples with indices, and call the recursive function
    return computePermutationsRec(source.map((el, idx) => [idx, el]), target.map((el, idx) => [idx, el]));
}

function permute<A>(source: A[], permutation: number[]): A[] {
    const target: A[] = [];
    for (let i = 0; i < permutation.length; i++) {
        target.push(source[permutation[i]]);
    }
    return target;
}

function computeColumnSignatures(table: SqlValue[][]): string[] {
    const columnSignatures: string[] = [];
    const numColumns = table.length > 0 ? table[0].length : 0;

    for (let colIndex = 0; colIndex < numColumns; colIndex++) {
        const column: SqlValue[] = [];
        for (let rowIndex = 0; rowIndex < table.length; rowIndex++) {
            column.push(table[rowIndex][colIndex]);
        }
        const signature = computeColumnSignature(column);
        columnSignatures.push(signature);
    }

    return columnSignatures;
}

function computeRowSortKey(row: SqlValue[]): string {
    return JSON.stringify(row.map(computeSqlValueSortKey));
}

function computeSqlValueSortKey(value: SqlValue): string {
    if (value === null) {
        return JSON.stringify(['null']);
    }
    else if (typeof value === 'number') {
        return JSON.stringify(['number', String(value)]);
    }
    else if (typeof value === 'boolean') {
        return JSON.stringify(['boolean', String(value)]);
    }
    else if (typeof value === 'string') {
        return JSON.stringify(['string', value]);
    }
    else if (value instanceof Uint8Array) {
        return JSON.stringify(['bytes', encodeToBase64(value)]);
    }
    else { const _n: never = value; return _n; }
}

// Column signature means: Some kind of hash that identifies a column irrespective of its row order
// Achieved by first sorting accoridng to some arbitrary order.
function computeColumnSignature(column: SqlValue[]): string {
    const sortedColumn = column.map(computeSqlValueSortKey).sort();
    return stringHash(JSON.stringify(sortedColumn)).toString();
}
