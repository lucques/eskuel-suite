import type { Fail, Success } from '../util';

export const DATABASE_SYSTEMS = ['sqlite', 'postgresql'] as const;

export type DatabaseSystem = typeof DATABASE_SYSTEMS[number];

export const DEFAULT_DATABASE_SYSTEM: DatabaseSystem = 'sqlite';
export const DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS = {
    sqlite: '3.0.0',
    postgresql: '14.0.0',
} as const satisfies Record<DatabaseSystem, string>;

export type ParseSqlMetadataFail = {
    kind: 'parse-sql-metadata';
    details: string;
};

export type SqlScriptMetadata = {
    system: DatabaseSystem;
    systemMinVersion: string;
    hasExplicitMetadata: boolean;
};

export function parseSqlScriptMetadata(
    sql: string,
): Success<SqlScriptMetadata> | Fail<ParseSqlMetadataFail> {
    const directives = readHeaderDirectives(sql);
    if (!directives.ok) {
        return directives;
    }
    else {
        const systemValues = directives.data.filter(directive => directive.key === 'system');
        const systemMinVersionValues = directives.data.filter(directive => directive.key === 'systemMinVersion');
        const unknownDirective = directives.data.find(
            directive => directive.key !== 'system' && directive.key !== 'systemMinVersion',
        );
        if (unknownDirective !== undefined) {
            return fail(`Unknown Eskuel SQL metadata key: ${unknownDirective.key}`);
        }
        else if (systemValues.length > 1) {
            return fail('Eskuel SQL metadata key "system" occurs more than once');
        }
        else if (systemMinVersionValues.length > 1) {
            return fail('Eskuel SQL metadata key "systemMinVersion" occurs more than once');
        }
        else if (systemValues.length === 0 && systemMinVersionValues.length === 0) {
            return {
                ok: true,
                data: {
                    system: DEFAULT_DATABASE_SYSTEM,
                    systemMinVersion: DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS[DEFAULT_DATABASE_SYSTEM],
                    hasExplicitMetadata: false,
                },
            };
        }
        else if (systemValues.length === 0) {
            return fail('Eskuel SQL metadata requires the "system" key');
        }
        else if (systemMinVersionValues.length === 0) {
            return fail('Eskuel SQL metadata requires the "systemMinVersion" key');
        }
        else {
            const system = systemValues[0].value;
            const systemMinVersion = systemMinVersionValues[0].value;
            if (!isDatabaseSystem(system)) {
                return fail(`Unknown database system: ${system}`);
            }
            else if (!isDatabaseSystemVersion(systemMinVersion)) {
                return fail(`Invalid database-system minimum version: ${systemMinVersion}`);
            }
            else {
                return {
                    ok: true,
                    data: {
                        system,
                        systemMinVersion,
                        hasExplicitMetadata: true,
                    },
                };
            }
        }
    }
}

export function sqlScriptWithSystemMetadata(
    sql: string,
    system: DatabaseSystem,
    systemMinVersion: string,
): string {
    if (!isDatabaseSystemVersion(systemMinVersion)) {
        throw new Error(`Invalid database-system minimum version: ${systemMinVersion}`);
    }
    const metadata = parseSqlScriptMetadata(sql);
    if (!metadata.ok) {
        throw new Error(metadata.error.details);
    }
    else if (metadata.data.hasExplicitMetadata) {
        if (metadata.data.system === system && metadata.data.systemMinVersion === systemMinVersion) {
            return sql;
        }
        else {
            throw new Error(
                `SQL script declares ${metadata.data.system} >= ${metadata.data.systemMinVersion}, `
                + `but ${system} >= ${systemMinVersion} was requested`,
            );
        }
    }
    else {
        const bom = sql.startsWith('\uFEFF') ? '\uFEFF' : '';
        const content = bom === '' ? sql : sql.slice(bom.length);
        return `${bom}-- eskuel:system=${system}\n`
            + `-- eskuel:systemMinVersion=${systemMinVersion}\n${content}`;
    }
}

export function isDatabaseSystem(value: string): value is DatabaseSystem {
    return DATABASE_SYSTEMS.some(system => system === value);
}

export function isDatabaseSystemVersion(value: string): boolean {
    return /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value);
}

type SqlMetadataDirective = {
    key: string;
    value: string;
};

function readHeaderDirectives(
    sql: string,
): Success<SqlMetadataDirective[]> | Fail<ParseSqlMetadataFail> {
    const directives: SqlMetadataDirective[] = [];
    let index = sql.startsWith('\uFEFF') ? 1 : 0;

    while (index < sql.length) {
        index = skipWhitespace(sql, index);
        if (sql.startsWith('--', index)) {
            const end = findLineEnd(sql, index + 2);
            const comment = sql.slice(index + 2, end).trim();
            // Only Eskuel metadata comments are parsed as directives.
            if (comment.startsWith('eskuel:')) {
                const directive = parseDirective(comment);
                if (!directive.ok) {
                    return directive;
                }
                else {
                    directives.push(directive.data);
                }
            }
            index = end;
        }
        else if (sql.startsWith('/*', index)) {
            const end = sql.indexOf('*/', index + 2);
            if (end === -1) {
                return fail('Unterminated block comment in SQL metadata header');
            }
            else {
                index = end + 2;
            }
        }
        else {
            break;
        }
    }

    return { ok: true, data: directives };
}

function parseDirective(
    comment: string,
): Success<SqlMetadataDirective> | Fail<ParseSqlMetadataFail> {
    const match = /^eskuel:([A-Za-z][A-Za-z0-9]*)=([^\s=]+)$/.exec(comment);
    if (match === null) {
        return fail(`Malformed Eskuel SQL metadata directive: ${comment}`);
    }
    else {
        return {
            ok: true,
            data: {
                key: match[1],
                value: match[2],
            },
        };
    }
}

function skipWhitespace(value: string, start: number): number {
    let index = start;
    while (index < value.length && /\s/u.test(value[index])) {
        index++;
    }
    return index;
}

function findLineEnd(value: string, start: number): number {
    const end = value.indexOf('\n', start);
    return end === -1 ? value.length : end + 1;
}

function fail(details: string): Fail<ParseSqlMetadataFail> {
    return { ok: false, error: { kind: 'parse-sql-metadata', details } };
}
