import { describe, expect, it } from 'vitest';

import { compareThreePartVersions } from './system-version';

describe('database system version comparison', () => {
    it.each([
        ['3.49.1', '3.37.0', 1],
        ['3.37.0', '3.37.0', 0],
        ['3.36.99', '3.37.0', -1],
        ['4.0.0', '3.99.99', 1],
    ] as const)('compares %s with %s', (left, right, expected) => {
        expect(compareThreePartVersions(left, right)).toBe(expected);
    });

    it('rejects versions outside the required three-part form', () => {
        expect(() => compareThreePartVersions('3.49', '3.37.0')).toThrowError('Invalid three-part version');
    });
});
