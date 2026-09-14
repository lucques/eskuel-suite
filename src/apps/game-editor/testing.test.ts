import { describe, expect, it } from 'vitest';

import type { SqlResult } from '../../database/api';
import type { Scene } from '../../game/model';
import {
    areSqlResultsExactlyEqual,
    createSceneTestStatuses,
    invalidateTaskStatusesFrom,
} from './testing';
import type { SceneTestStatus } from './testing';

const scenes: Scene[] = [
    { type: 'text', text: 'Intro' },
    {
        type: 'select',
        text: 'Select',
        sqlSol: 'SELECT value FROM example',
        sqlPlaceholder: '',
        ordinaryHints: [],
        hasSolHint: false,
        isRowOrderRelevant: false,
        isColOrderRelevant: false,
        areColNamesRelevant: false,
    },
    {
        type: 'manipulate',
        text: 'Manipulate',
        sqlSol: 'UPDATE example SET value = 2',
        sqlCheck: 'SELECT value FROM example',
        sqlPlaceholder: '',
        ordinaryHints: [],
        hasSolHint: false,
    },
    {
        type: 'select',
        text: 'Select again',
        sqlSol: 'SELECT value FROM example',
        sqlPlaceholder: '',
        ordinaryHints: [],
        hasSolHint: false,
        isRowOrderRelevant: false,
        isColOrderRelevant: false,
        areColNamesRelevant: false,
    },
];

describe('game editor scene testing helpers', () => {
    it('creates type-compatible initial statuses', () => {
        expect(createSceneTestStatuses(scenes)).toEqual([
            { kind: 'none' },
            { kind: 'unknown' },
            { kind: 'unknown' },
            { kind: 'unknown' },
        ]);
    });

    it('invalidates task statuses without changing non-task statuses', () => {
        const statuses: SceneTestStatus[] = [
            { kind: 'none' },
            {
                kind: 'select-result',
                result: { type: 'succ', sql: 'SELECT 1', result: [] },
            },
            {
                kind: 'manipulate-result',
                outcome: 'success',
                result: { type: 'succ', sql: 'SELECT 2', result: [] },
            },
            {
                kind: 'select-result',
                result: { type: 'error', sql: 'SELECT bad', message: 'bad' },
            },
        ];

        expect(invalidateTaskStatusesFrom(scenes, statuses, 2)).toEqual([
            { kind: 'none' },
            statuses[1],
            { kind: 'unknown' },
            { kind: 'unknown' },
        ]);
    });

    it('compares complete SQL result payloads exactly while ignoring their SQL text', () => {
        const a: SqlResult = {
            type: 'succ',
            sql: 'SELECT first',
            result: [{ columns: ['value'], values: [[1]], truncated: true }],
        };
        const samePayload: SqlResult = {
            type: 'succ',
            sql: 'SELECT second',
            result: [{ columns: ['value'], values: [[1]], truncated: true }],
        };
        const changedPayload: SqlResult = {
            type: 'succ',
            sql: 'SELECT first',
            result: [{ columns: ['value'], values: [[2]], truncated: true }],
        };

        expect(areSqlResultsExactlyEqual(a, samePayload)).toBe(true);
        expect(areSqlResultsExactlyEqual(a, changedPayload)).toBe(false);
        expect(areSqlResultsExactlyEqual(
            { type: 'error', sql: 'SELECT first', message: 'same' },
            { type: 'error', sql: 'SELECT second', message: 'same' },
        )).toBe(true);
        expect(areSqlResultsExactlyEqual(
            { type: 'error', sql: 'SELECT first', message: 'before' },
            { type: 'error', sql: 'SELECT first', message: 'after' },
        )).toBe(false);
        expect(areSqlResultsExactlyEqual(
            { type: 'error', sql: 'SELECT first', message: 'before' },
            a,
        )).toBe(false);
    });
});
