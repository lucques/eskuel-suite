import type { SqlResult, SqlResultError, SqlResultSucc } from './api';

export function truncateSqlResultRowsPerTable(
    result: SqlResultError,
    maximumRowsPerTable: number,
): SqlResultError;
export function truncateSqlResultRowsPerTable(
    result: SqlResultSucc,
    maximumRowsPerTable: number,
): SqlResultSucc;
export function truncateSqlResultRowsPerTable(
    result: SqlResult,
    maximumRowsPerTable: number,
): SqlResult;
export function truncateSqlResultRowsPerTable(
    result: SqlResult,
    maximumRowsPerTable: number,
): SqlResult {
    if (result.type === 'error') {
        return result;
    }
    else if (result.type === 'succ') {
        return {
            ...result,
            result: result.result.map(table => {
                const truncated = table.truncated === true || table.values.length > maximumRowsPerTable;
                return {
                    ...table,
                    values: table.values.slice(0, maximumRowsPerTable),
                    ...(truncated ? { truncated: true } : {}),
                };
            }),
        };
    }
    else { const _n: never = result; return _n; }
}
