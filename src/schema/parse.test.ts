import { describe, expect, it } from 'vitest';

import { extractTableInfo } from './parse';

function expectExtractionFailure(sql: string): void {
    expect(extractTableInfo(sql)).toMatchObject({
        ok: false,
        error: { kind: 'extraction' },
    });
}

describe('schema statement parsing', () => {
    it('extracts the complete schema of a basic table', () => {
        const result = extractTableInfo(`
            CREATE TABLE child (
                id INTEGER PRIMARY KEY,
                label TEXT NOT NULL
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'child',
                cols: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'label', type: 'TEXT' },
                ],
                primaryKey: ['id'],
                foreignKeys: {},
            },
        });
    });

    it('accepts optional CREATE TABLE syntax and trailing table options', () => {
        const result = extractTableInfo(`
            create table if not exists inventory (
                id INTEGER PRIMARY KEY,
                code TEXT
            ) WITHOUT ROWID, STRICT;
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'inventory',
                cols: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'code', type: 'TEXT' },
                ],
                primaryKey: ['id'],
                foreignKeys: {},
            },
        });
    });

    it('identifies the internal SQLite sequence table', () => {
        expect(extractTableInfo('CREATE TABLE sqlite_sequence(name,seq)')).toEqual({
            ok: false,
            error: { kind: 'internal-table' },
        });
    });

    it.each([
        ['', 'empty input'],
        ['SELECT * FROM example', 'an unrelated statement'],
        ['CREATE TABLE example', 'a missing table body'],
        ['CREATE TABLE example ()', 'an empty table body'],
        ['prefix CREATE TABLE example (id INTEGER)', 'content before CREATE TABLE'],
        ['CREATE TABLE example (id INTEGER) suffix', 'an unsupported suffix'],
        ['CREATE TABLE example (id INTEGER', 'unclosed parentheses'],
        ['CREATE TABLE example ("id INTEGER)', 'an unclosed quoted identifier'],
        ['CREATE TABLE [example] ([id INTEGER)', 'an unclosed bracket-quoted identifier'],
    ])('rejects %s (%s)', (sql) => {
        expectExtractionFailure(sql);
    });
});

describe('schema identifier parsing', () => {
    it('accepts digits, underscores, dollar signs, and Unicode in bare identifiers', () => {
        const result = extractTableInfo(`
            CREATE TABLE élève_2 (
                answer_1 TEXT,
                total$2 INTEGER
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'élève_2',
                cols: [
                    { name: 'answer_1', type: 'TEXT' },
                    { name: 'total$2', type: 'INTEGER' },
                ],
                primaryKey: [],
                foreignKeys: {},
            },
        });
    });

    it.each([
        ['"order items"', '"item id"'],
        ['`order items`', '`item id`'],
        ['\'order items\'', '\'item id\''],
        ['[order items]', '[item id]'],
    ])('accepts %s-style quoted identifiers', (tableName, colName) => {
        const result = extractTableInfo(`CREATE TABLE ${tableName} (${colName} INTEGER PRIMARY KEY)`);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'order items',
                cols: [{ name: 'item id', type: 'INTEGER' }],
                primaryKey: ['item id'],
                foreignKeys: {},
            },
        });
    });

    it('unescapes doubled delimiters in quoted identifiers', () => {
        const result = extractTableInfo('CREATE TABLE "say ""hello""" (`value``part` TEXT)');

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'say "hello"',
                cols: [{ name: 'value`part', type: 'TEXT' }],
                primaryKey: [],
                foreignKeys: {},
            },
        });
    });

    it('accepts the bracket-quoted identifiers in a Chinook table definition', () => {
        const result = extractTableInfo(`
            CREATE TABLE "albums" (
                [AlbumId] INTEGER NOT NULL,
                [Title] NVARCHAR(160) NOT NULL,
                [ArtistId] INTEGER NOT NULL,
                CONSTRAINT [PK_Album] PRIMARY KEY ([AlbumId]),
                FOREIGN KEY ([ArtistId]) REFERENCES "artists" ([ArtistId])
                    ON DELETE NO ACTION ON UPDATE NO ACTION
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'albums',
                cols: [
                    { name: 'AlbumId', type: 'INTEGER' },
                    { name: 'Title', type: 'NVARCHAR(160)' },
                    { name: 'ArtistId', type: 'INTEGER' },
                ],
                primaryKey: ['AlbumId'],
                foreignKeys: {
                    ArtistId: [{
                        kind: 'column',
                        foreignTable: 'artists',
                        foreignCol: 'ArtistId',
                    }],
                },
            },
        });
    });

    it('keeps commas and parentheses inside quoted identifiers', () => {
        const result = extractTableInfo('CREATE TABLE "measurements (old)" ("last, first" TEXT)');

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'measurements (old)',
                cols: [{ name: 'last, first', type: 'TEXT' }],
                primaryKey: [],
                foreignKeys: {},
            },
        });
    });
});

describe('schema column parsing', () => {
    it('accepts columns without a declared type and multi-word type names', () => {
        const result = extractTableInfo(`
            CREATE TABLE values_table (
                untyped,
                amount DECIMAL(10, 2),
                description CHARACTER VARYING(200)
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'values_table',
                cols: [
                    { name: 'untyped', type: '' },
                    { name: 'amount', type: 'DECIMAL(10, 2)' },
                    { name: 'description', type: 'CHARACTER VARYING(200)' },
                ],
                primaryKey: [],
                foreignKeys: {},
            },
        });
    });

    it('does not split columns at commas inside literals or nested expressions', () => {
        const result = extractTableInfo(`
            CREATE TABLE generated_values (
                label TEXT DEFAULT 'last, first',
                slug TEXT GENERATED ALWAYS AS (lower(label || ',' || printf('(%s)', label))) STORED
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'generated_values',
                cols: [
                    { name: 'label', type: 'TEXT' },
                    { name: 'slug', type: 'TEXT' },
                ],
                primaryKey: [],
                foreignKeys: {},
            },
        });
    });

    it('excludes ordinary column constraints from the declared type', () => {
        const result = extractTableInfo(`
            CREATE TABLE scores (
                name TEXT NOT NULL DEFAULT 'unknown' COLLATE NOCASE UNIQUE,
                score INTEGER CHECK (score >= 0)
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'scores',
                cols: [
                    { name: 'name', type: 'TEXT' },
                    { name: 'score', type: 'INTEGER' },
                ],
                primaryKey: [],
                foreignKeys: {},
            },
        });
    });

    it('ignores table-level UNIQUE and CHECK constraints instead of creating fake columns', () => {
        const result = extractTableInfo(`
            CREATE TABLE contacts (
                first_name TEXT,
                last_name TEXT,
                UNIQUE (first_name, last_name),
                CHECK (length(first_name) > 0 AND instr(last_name, ',') = 0)
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'contacts',
                cols: [
                    { name: 'first_name', type: 'TEXT' },
                    { name: 'last_name', type: 'TEXT' },
                ],
                primaryKey: [],
                foreignKeys: {},
            },
        });
    });
});

describe('schema primary-key parsing', () => {
    it('recognizes inline primary keys case-insensitively and removes the complete clause', () => {
        const result = extractTableInfo('CREATE TABLE items (id integer primary key autoincrement, label text)');

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'items',
                cols: [
                    { name: 'id', type: 'integer' },
                    { name: 'label', type: 'text' },
                ],
                primaryKey: ['id'],
                foreignKeys: {},
            },
        });
    });

    it('extracts an ordered composite table-level primary key', () => {
        const result = extractTableInfo(`
            CREATE TABLE translations (
                message_id INTEGER,
                language TEXT,
                content TEXT,
                PRIMARY KEY (message_id DESC, language COLLATE NOCASE ASC)
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'translations',
                cols: [
                    { name: 'message_id', type: 'INTEGER' },
                    { name: 'language', type: 'TEXT' },
                    { name: 'content', type: 'TEXT' },
                ],
                primaryKey: ['message_id', 'language'],
                foreignKeys: {},
            },
        });
    });

    it('extracts a table-level autoincrement primary key', () => {
        const result = extractTableInfo(`
            CREATE TABLE items (
                id INTEGER,
                label TEXT,
                PRIMARY KEY (id AUTOINCREMENT)
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'items',
                cols: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'label', type: 'TEXT' },
                ],
                primaryKey: ['id'],
                foreignKeys: {},
            },
        });
    });

    it('extracts a named primary-key constraint', () => {
        const result = extractTableInfo(`
            CREATE TABLE memberships (
                user_id INTEGER,
                group_id INTEGER,
                CONSTRAINT membership_pk PRIMARY KEY (user_id, group_id)
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'memberships',
                cols: [
                    { name: 'user_id', type: 'INTEGER' },
                    { name: 'group_id', type: 'INTEGER' },
                ],
                primaryKey: ['user_id', 'group_id'],
                foreignKeys: {},
            },
        });
    });
});

describe('schema foreign-key parsing', () => {
    it('extracts a table-level foreign-key constraint', () => {
        const result = extractTableInfo(`
            CREATE TABLE child (
                id INTEGER PRIMARY KEY,
                parent_id INTEGER,
                FOREIGN KEY (parent_id) REFERENCES parent (id)
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'child',
                cols: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'parent_id', type: 'INTEGER' },
                ],
                primaryKey: ['id'],
                foreignKeys: {
                    parent_id: [{
                        kind: 'column',
                        foreignTable: 'parent',
                        foreignCol: 'id',
                    }],
                },
            },
        });
    });

    it('extracts an inline foreign-key reference case-insensitively', () => {
        const result = extractTableInfo(`
            CREATE TABLE child (
                id INTEGER PRIMARY KEY,
                parent_id INTEGER references parent (id)
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'child',
                cols: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'parent_id', type: 'INTEGER' },
                ],
                primaryKey: ['id'],
                foreignKeys: {
                    parent_id: [{
                        kind: 'column',
                        foreignTable: 'parent',
                        foreignCol: 'id',
                    }],
                },
            },
        });
    });

    it('pairs the columns of a composite foreign key', () => {
        const result = extractTableInfo(`
            CREATE TABLE translation_values (
                message_id INTEGER,
                language TEXT,
                FOREIGN KEY (message_id, language) REFERENCES translations (id, language)
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'translation_values',
                cols: [
                    { name: 'message_id', type: 'INTEGER' },
                    { name: 'language', type: 'TEXT' },
                ],
                primaryKey: [],
                foreignKeys: {
                    message_id: [{
                        kind: 'column',
                        foreignTable: 'translations',
                        foreignCol: 'id',
                    }],
                    language: [{
                        kind: 'column',
                        foreignTable: 'translations',
                        foreignCol: 'language',
                    }],
                },
            },
        });
    });

    it('extracts named foreign keys and ignores action clauses', () => {
        const result = extractTableInfo(`
            CREATE TABLE child (
                parent_id INTEGER,
                CONSTRAINT child_parent_fk FOREIGN KEY (parent_id)
                    REFERENCES parent (id)
                    ON UPDATE CASCADE ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'child',
                cols: [{ name: 'parent_id', type: 'INTEGER' }],
                primaryKey: [],
                foreignKeys: {
                    parent_id: [{
                        kind: 'column',
                        foreignTable: 'parent',
                        foreignCol: 'id',
                    }],
                },
            },
        });
    });

    it('excludes an inline foreign-key clause and other constraints from the declared type', () => {
        const result = extractTableInfo(`
            CREATE TABLE child (
                parent_id INTEGER REFERENCES parent (id) ON DELETE CASCADE NOT NULL
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'child',
                cols: [{ name: 'parent_id', type: 'INTEGER' }],
                primaryKey: [],
                foreignKeys: {
                    parent_id: [{
                        kind: 'column',
                        foreignTable: 'parent',
                        foreignCol: 'id',
                    }],
                },
            },
        });
    });

    it('accumulates multiple references for the same local column', () => {
        const result = extractTableInfo(`
            CREATE TABLE child (
                owner_id INTEGER,
                FOREIGN KEY (owner_id) REFERENCES users (id),
                FOREIGN KEY (owner_id) REFERENCES archived_users (id)
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'child',
                cols: [{ name: 'owner_id', type: 'INTEGER' }],
                primaryKey: [],
                foreignKeys: {
                    owner_id: [
                        { kind: 'column', foreignTable: 'users', foreignCol: 'id' },
                        { kind: 'column', foreignTable: 'archived_users', foreignCol: 'id' },
                    ],
                },
            },
        });
    });

    it('targets the parent primary key when inline referenced columns are omitted', () => {
        const result = extractTableInfo('CREATE TABLE child (parent_id INTEGER REFERENCES parent)');

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'child',
                cols: [{ name: 'parent_id', type: 'INTEGER' }],
                primaryKey: [],
                foreignKeys: {
                    parent_id: [{
                        kind: 'primary-key',
                        foreignTable: 'parent',
                    }],
                },
            },
        });
    });

    it('targets the parent primary key for every column of an implicit composite foreign key', () => {
        const result = extractTableInfo(`
            CREATE TABLE child (
                parent_a INTEGER,
                parent_b INTEGER,
                FOREIGN KEY (parent_a, parent_b) REFERENCES parent
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'child',
                cols: [
                    { name: 'parent_a', type: 'INTEGER' },
                    { name: 'parent_b', type: 'INTEGER' },
                ],
                primaryKey: [],
                foreignKeys: {
                    parent_a: [{
                        kind: 'primary-key',
                        foreignTable: 'parent',
                    }],
                    parent_b: [{
                        kind: 'primary-key',
                        foreignTable: 'parent',
                    }],
                },
            },
        });
    });

    it('rejects composite foreign keys with unequal column counts', () => {
        expectExtractionFailure(`
            CREATE TABLE child (
                a INTEGER,
                b INTEGER,
                FOREIGN KEY (a, b) REFERENCES parent (id)
            )
        `);
    });
});

describe('schema comment parsing', () => {
    it('removes line and block comments outside quoted values', () => {
        const result = extractTableInfo(`
            -- table comment
            CREATE TABLE notes (
                id INTEGER, -- identifier comment
                /* before the body */ body TEXT
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'notes',
                cols: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'body', type: 'TEXT' },
                ],
                primaryKey: [],
                foreignKeys: {},
            },
        });
    });

    it('preserves comment markers inside quoted values', () => {
        const result = extractTableInfo(`
            CREATE TABLE notes (
                line_comment TEXT DEFAULT '-- not a comment',
                block_comment TEXT DEFAULT '/* also not a comment */'
            )
        `);

        expect(result).toEqual({
            ok: true,
            data: {
                name: 'notes',
                cols: [
                    { name: 'line_comment', type: 'TEXT' },
                    { name: 'block_comment', type: 'TEXT' },
                ],
                primaryKey: [],
                foreignKeys: {},
            },
        });
    });
});
