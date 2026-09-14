import { describe, expect, it } from 'vitest';

import { parseSqlScriptMetadata, sqlScriptWithSystemMetadata } from './system';

describe('Eskuel SQL metadata', () => {
    it('defaults an unannotated script to SQLite', () => {
        expect(parseSqlScriptMetadata('CREATE TABLE example (id INTEGER);')).toEqual({
            ok: true,
            data: {
                system: 'sqlite',
                systemMinVersion: '3.0.0',
                hasExplicitMetadata: false,
            },
        });
    });

    it('reads system metadata from the leading comment header', () => {
        expect(parseSqlScriptMetadata(`
            -- ordinary comment
            /* another header comment */
            -- eskuel:system=postgresql
            -- eskuel:systemMinVersion=14.0.0
            CREATE TABLE example (id INTEGER);
        `)).toEqual({
            ok: true,
            data: {
                system: 'postgresql',
                systemMinVersion: '14.0.0',
                hasExplicitMetadata: true,
            },
        });
    });

    it('does not interpret directives after the first SQL token', () => {
        expect(parseSqlScriptMetadata(`
            SELECT 1;
            -- eskuel:system=postgresql
        `)).toEqual({
            ok: true,
            data: {
                system: 'sqlite',
                systemMinVersion: '3.0.0',
                hasExplicitMetadata: false,
            },
        });
    });

    it.each([
        {
            sql: '-- eskuel:system=sqlite\n-- eskuel:systemMinVersion=3.0.0\n-- eskuel:system=sqlite\n-- eskuel:systemMinVersion=3.0.0\nSELECT 1;',
            details: 'Eskuel SQL metadata key "system" occurs more than once',
        },
        {
            sql: '-- eskuel:engine=sqlite\nSELECT 1;',
            details: 'Unknown Eskuel SQL metadata key: engine',
        },
        {
            sql: '-- eskuel:system = sqlite\nSELECT 1;',
            details: 'Malformed Eskuel SQL metadata directive: eskuel:system = sqlite',
        },
        {
            sql: '-- eskuel:system=mysql\nSELECT 1;',
            details: 'Eskuel SQL metadata requires the "systemMinVersion" key',
        },
        {
            sql: '-- eskuel:system=mysql\n-- eskuel:systemMinVersion=1.0.0\nSELECT 1;',
            details: 'Unknown database system: mysql',
        },
        {
            sql: '-- eskuel:system=sqlite\n-- eskuel:systemMinVersion=3.0\nSELECT 1;',
            details: 'Invalid database-system minimum version: 3.0',
        },
    ])('rejects invalid metadata in $sql', ({ sql, details }) => {
        expect(parseSqlScriptMetadata(sql)).toEqual({
            ok: false,
            error: {
                kind: 'parse-sql-metadata',
                details,
            },
        });
    });

    it('adds explicit system metadata to an unannotated standalone script', () => {
        expect(sqlScriptWithSystemMetadata('SELECT 1;', 'sqlite', '3.0.0')).toBe(
            '-- eskuel:system=sqlite\n-- eskuel:systemMinVersion=3.0.0\nSELECT 1;',
        );
    });

    it('preserves an existing matching directive and a UTF-8 BOM', () => {
        const annotated = '\uFEFF-- eskuel:system=postgresql\n-- eskuel:systemMinVersion=14.0.0\nSELECT 1;';
        expect(sqlScriptWithSystemMetadata(annotated, 'postgresql', '14.0.0')).toBe(annotated);
        expect(sqlScriptWithSystemMetadata('\uFEFFSELECT 1;', 'sqlite', '3.0.0')).toBe(
            '\uFEFF-- eskuel:system=sqlite\n-- eskuel:systemMinVersion=3.0.0\nSELECT 1;',
        );
    });
});
