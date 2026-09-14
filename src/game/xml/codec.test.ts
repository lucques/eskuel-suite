import { describe, expect, it } from 'vitest';

import { Game } from '../model';
import { encodeToBase64 } from '../../util';
import { gameToXML, xmlToGame } from './codec';
import type { XmlElement } from './model';

const IMAGE_FIXTURES = [
    { mediaType: 'image/png', base64string: 'iVBORw0KGgoAAAANSUhEUgAABAAAAAMA' },
    { mediaType: 'image/jpeg', base64string: '/9j/wAAHCAMABAA=' },
    { mediaType: 'image/webp', base64string: 'UklGRhYAAABXRUJQVlA4WAoAAAAAAAAA/wMA/wIA' },
    { mediaType: 'image/avif', base64string: 'AAAAEGZ0eXBhdmlmAAAAAAAAABRpc3BlAAAAAAAABAAAAAMA' },
    { mediaType: 'image/gif', base64string: 'R0lGODlhAAQAAw==' },
] as const;

type XmlElementOptions = {
    text?: string;
    attributes?: Readonly<Record<string, string>>;
    children?: readonly XmlElement[];
};

const element = (name: string, options: XmlElementOptions = {}): XmlElement => ({
    name,
    text: options.text ?? '',
    attributes: options.attributes ?? {},
    children: options.children ?? [],
});

const gameElement = (
    scenes: readonly XmlElement[],
    databaseElements: readonly XmlElement[] = [],
): XmlElement => element('game', {
    children: [
        element('head', {
            children: [
                element('title', { text: ' Inventory ' }),
                element('teaser', { text: ' Learn SQL ' }),
                element('copyright', { text: ' Test author ' }),
            ],
        }),
        element('scenes', { children: scenes }),
        ...databaseElements,
    ],
});

const versionedGameElement = (
    scenes: readonly XmlElement[],
    dbSystem: 'sqlite' | 'postgresql' = 'sqlite',
    databaseElements: readonly XmlElement[] = [],
): XmlElement => ({
    ...gameElement(scenes, databaseElements),
    attributes: {
        'format-version': '1',
        'db-system': dbSystem,
        'db-system-min-version': dbSystem === 'sqlite' ? '3.0.0' : '14.0.0',
    },
});

const version2GameElement = (
    scenes: readonly XmlElement[],
    dbSystem: 'sqlite' | 'postgresql' = 'sqlite',
    databaseElements: readonly XmlElement[] = [],
): XmlElement => ({
    ...gameElement(scenes, databaseElements),
    attributes: {
        'format-version': '2',
        'db-system': dbSystem,
        'db-system-min-version': dbSystem === 'sqlite' ? '3.0.0' : '14.0.0',
    },
});

describe('XML-to-game conversion', () => {
    it('treats an unversioned game as legacy input using SQLite', () => {
        const result = xmlToGame(gameElement([
            element('text-scene', {
                children: [element('text', { text: 'Introduction' })],
            }),
        ]));

        expect(result).toMatchObject({
            ok: true,
            data: { dbSystem: 'sqlite' },
        });
    });

    it('parses a version 1 PostgreSQL game without executing it', () => {
        const result = xmlToGame(versionedGameElement([
            element('select-scene', {
                children: [
                    element('text', { text: 'Select a value' }),
                    element('sql-solution', { text: 'SELECT TRUE' }),
                ],
            }),
        ], 'postgresql', [
            element('initial-sql-script', { text: 'CREATE TABLE example (value BOOLEAN);' }),
        ]));

        expect(result).toMatchObject({
            ok: true,
            data: {
                dbSystem: 'postgresql',
                dbData: {
                    type: 'initial-sql-script',
                    system: 'postgresql',
                },
                scenes: [{
                    type: 'select',
                    ordinaryHints: [{ type: 'expected-result' }],
                    hasSolHint: false,
                }],
            },
        });
    });

    it('parses ordered ordinary hints and a solution hint from a version 2 game', () => {
        const result = xmlToGame(version2GameElement([
            element('select-scene', {
                attributes: { 'has-sol-hint': 'true' },
                children: [
                    element('text', { text: 'Select a value' }),
                    element('sql-solution', { text: 'SELECT 1' }),
                    element('hints', {
                        children: [
                            element('text-hint', { text: ' First hint ' }),
                            element('expected-result-hint'),
                            element('text-hint', { text: '   ' }),
                        ],
                    }),
                ],
            }),
            element('manipulate-scene', {
                children: [
                    element('text', { text: 'Change a value' }),
                    element('sql-solution', { text: 'UPDATE example SET value = 1' }),
                    element('sql-check', { text: 'SELECT value FROM example' }),
                    element('hints'),
                ],
            }),
        ]));

        expect(result).toMatchObject({
            ok: true,
            data: {
                scenes: [
                    {
                        type: 'select',
                        ordinaryHints: [
                            { type: 'text', text: 'First hint' },
                            { type: 'expected-result' },
                            { type: 'text', text: '' },
                        ],
                        hasSolHint: true,
                    },
                    {
                        type: 'manipulate',
                        ordinaryHints: [],
                        hasSolHint: false,
                    },
                ],
            },
        });
    });

    it.each([
        {
            xml: element('lesson'),
            details: 'Expected <game> as the XML root element, found <lesson>',
        },
        {
            xml: element('game', { attributes: { 'format-version': '3', 'db-system': 'sqlite' } }),
            details: 'Unsupported game format version: 3',
        },
        {
            xml: element('game', { attributes: { 'format-version': '1' } }),
            details: 'Game format version 1 requires the db-system attribute',
        },
        {
            xml: element('game', { attributes: { 'format-version': '1', 'db-system': 'mysql' } }),
            details: 'Unknown game database system: mysql',
        },
        {
            xml: element('game', { attributes: { 'db-system': 'sqlite' } }),
            details: 'A game with database-system metadata must also declare format-version',
        },
        {
            xml: element('game', { attributes: { 'format-version': '2', 'db-system': 'sqlite' } }),
            details: 'Game format version 2 requires the db-system-min-version attribute',
        },
    ])('rejects an invalid format declaration', ({ xml, details }) => {
        expect(xmlToGame(xml)).toEqual({
            ok: false,
            error: { kind: 'parse-xml', details },
        });
    });

    it('rejects SQL metadata that conflicts with the game database system', () => {
        const result = xmlToGame(versionedGameElement([
            element('text-scene', {
                children: [element('text', { text: 'Introduction' })],
            }),
        ], 'postgresql', [
            element('initial-sql-script', {
                text: '-- eskuel:system=sqlite\n-- eskuel:systemMinVersion=3.0.0\nCREATE TABLE example (id INTEGER);',
            }),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'Game declares database system postgresql, but its initial SQL script declares sqlite',
            },
        });
    });

    it('rejects unknown structure in versioned games', () => {
        const xml = versionedGameElement([
            element('text-scene', {
                attributes: { unexpected: 'value' },
                children: [element('text', { text: 'Introduction' })],
            }),
        ]);

        expect(xmlToGame(xml)).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'Invalid game format version 1 structure: Unknown attribute unexpected on <text-scene>',
            },
        });
    });

    it('rejects an embedded SQLite database in a PostgreSQL game', () => {
        const result = xmlToGame(versionedGameElement([
            element('text-scene', {
                children: [element('text', { text: 'Introduction' })],
            }),
        ], 'postgresql', [
            element('sqlite-db', { text: 'AQID' }),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'An embedded <sqlite-db> requires db-system="sqlite"',
            },
        });
    });

    it('rejects non-canonical boolean values in versioned games', () => {
        const result = xmlToGame(versionedGameElement([
            element('select-scene', {
                attributes: { 'is-row-order-relevant': '1' },
                children: [
                    element('text', { text: 'Select a value' }),
                    element('sql-solution', { text: 'SELECT 1' }),
                ],
            }),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'Invalid game format version 1 structure: Attribute is-row-order-relevant on <select-scene> must be true or false',
            },
        });
    });

    it('rejects a non-canonical solution-hint Boolean in a version 2 game', () => {
        const result = xmlToGame(version2GameElement([
            element('manipulate-scene', {
                attributes: { 'has-sol-hint': 'yes' },
                children: [
                    element('text', { text: 'Change a value' }),
                    element('sql-solution', { text: 'UPDATE example SET value = 1' }),
                    element('sql-check', { text: 'SELECT value FROM example' }),
                ],
            }),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'Invalid game format version 2 structure: Attribute has-sol-hint on <manipulate-scene> must be true or false',
            },
        });
    });

    it('rejects a non-final hints element in a version 2 task scene', () => {
        const result = xmlToGame(version2GameElement([
            element('select-scene', {
                children: [
                    element('text', { text: 'Select a value' }),
                    element('sql-solution', { text: 'SELECT 1' }),
                    element('hints'),
                    element('sql-placeholder', { text: 'SELECT' }),
                ],
            }),
        ]));

        expect(result).toMatchObject({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: expect.stringContaining('Invalid game format version 2 structure'),
            },
        });
    });

    it('rejects multiple ordinary expected-result hints in a version 2 task scene', () => {
        const result = xmlToGame(version2GameElement([
            element('manipulate-scene', {
                children: [
                    element('text', { text: 'Change a value' }),
                    element('sql-solution', { text: 'UPDATE example SET value = 1' }),
                    element('sql-check', { text: 'SELECT value FROM example' }),
                    element('hints', {
                        children: [
                            element('expected-result-hint'),
                            element('expected-result-hint'),
                        ],
                    }),
                ],
            }),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'Invalid game format version 2 structure: <hints> must not contain more than one <expected-result-hint>',
            },
        });
    });

    it('rejects content in a version 2 ordinary expected-result hint', () => {
        const result = xmlToGame(version2GameElement([
            element('select-scene', {
                children: [
                    element('text', { text: 'Select a value' }),
                    element('sql-solution', { text: 'SELECT 1' }),
                    element('hints', {
                        children: [element('expected-result-hint', { text: 'unexpected' })],
                    }),
                ],
            }),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'Invalid game format version 2 structure: <expected-result-hint> must not contain text',
            },
        });
    });

    it.each(IMAGE_FIXTURES)(
        'detects $mediaType image data in an unannotated legacy game',
        ({ mediaType, base64string }) => {
            const result = xmlToGame(gameElement([
                element('image-scene', { text: base64string }),
            ]));

            expect(result).toMatchObject({
                ok: true,
                data: {
                    scenes: [{
                        type: 'image',
                        base64string,
                        mediaType,
                    }],
                },
            });
        },
    );

    it.each(IMAGE_FIXTURES)(
        'parses an annotated $mediaType image in a version 1 game',
        ({ mediaType, base64string }) => {
            const result = xmlToGame(versionedGameElement([
                element('image-scene', {
                    text: base64string,
                    attributes: { 'media-type': mediaType },
                }),
            ]));

            expect(result).toMatchObject({
                ok: true,
                data: {
                    scenes: [{
                        type: 'image',
                        base64string,
                        mediaType,
                    }],
                },
            });
        },
    );

    it('rejects a version 1 image without a media type', () => {
        const result = xmlToGame(versionedGameElement([
            element('image-scene', { text: IMAGE_FIXTURES[0].base64string }),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'Invalid game format version 1 structure: <image-scene> requires the media-type attribute',
            },
        });
    });

    it('rejects a version 1 image media type outside the allowlist', () => {
        const result = xmlToGame(versionedGameElement([
            element('image-scene', {
                text: IMAGE_FIXTURES[0].base64string,
                attributes: { 'media-type': 'image/svg+xml' },
            }),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'Invalid game format version 1 structure: Unsupported image media type: image/svg+xml',
            },
        });
    });

    it('rejects a version 1 image whose annotation disagrees with its data', () => {
        const result = xmlToGame(versionedGameElement([
            element('image-scene', {
                text: IMAGE_FIXTURES[0].base64string,
                attributes: { 'media-type': 'image/jpeg' },
            }),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'At least one scene failed to parse: Image declares image/jpeg, but its data is image/png',
            },
        });
    });

    it('rejects data-URL image syntax in a version 1 game', () => {
        const result = xmlToGame(versionedGameElement([
            element('image-scene', {
                text: `data:image/png;base64,${IMAGE_FIXTURES[0].base64string}`,
                attributes: { 'media-type': 'image/png' },
            }),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'At least one scene failed to parse: Game format version 1 image data must not use a data-URL prefix',
            },
        });
    });

    it('rejects an image whose compressed data exceeds the configured limit', () => {
        const result = xmlToGame(versionedGameElement([
            element('image-scene', {
                text: IMAGE_FIXTURES[0].base64string,
                attributes: { 'media-type': 'image/png' },
            }),
        ]), {
            maxImageFileBytes: 8,
            maxImageWidth: 2400,
            maxImageHeight: 1200,
        });

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'image-resource-limit',
                resource: 'file-bytes',
                limit: 8,
                sceneNumber: 1,
            },
        });
    });

    it('reports the scene number for an image whose dimensions exceed the configured width limit', () => {
        const result = xmlToGame(versionedGameElement([
            element('text-scene', {
                children: [element('text', { text: 'Introduction' })],
            }),
            element('image-scene', {
                text: IMAGE_FIXTURES[0].base64string,
                attributes: { 'media-type': 'image/png' },
            }),
        ]), {
            maxImageFileBytes: 1024,
            maxImageWidth: 100,
            maxImageHeight: 1200,
        });

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'image-resource-limit',
                resource: 'width',
                limit: 100,
                sceneNumber: 2,
            },
        });
    });

    it.each([
        {
            widthBytes: [0, 0, 9, 97],
            heightBytes: [0, 0, 4, 176],
            resource: 'width',
            limit: 2400,
        },
        {
            widthBytes: [0, 0, 9, 96],
            heightBytes: [0, 0, 4, 177],
            resource: 'height',
            limit: 1200,
        },
    ] as const)('applies the default embedded-image $resource limit when reading a game', ({
        widthBytes,
        heightBytes,
        resource,
        limit,
    }) => {
        const oversizedPng = new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            0, 0, 0, 13,
            0x49, 0x48, 0x44, 0x52,
            ...widthBytes,
            ...heightBytes,
        ]);
        const result = xmlToGame(versionedGameElement([
            element('image-scene', {
                text: encodeToBase64(oversizedPng),
                attributes: { 'media-type': 'image/png' },
            }),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'image-resource-limit',
                resource,
                limit,
                sceneNumber: 1,
            },
        });
    });

    it('parses metadata, SQL initialization, and every scene type', () => {
        const result = xmlToGame(gameElement([
            element('text-scene', {
                children: [element('text', { text: ' Introduction ' })],
            }),
            element('image-scene', { text: ` data:image/png;base64,${IMAGE_FIXTURES[0].base64string} ` }),
            element('select-scene', {
                attributes: {
                    'is-row-order-relevant': 'true',
                    'is-col-order-relevant': 'true',
                    'are-col-names-relevant': 'false',
                },
                children: [
                    element('text', { text: ' Select the items ' }),
                    element('sql-solution', { text: ' SELECT * FROM items ' }),
                    element('sql-placeholder', { text: ' SELECT ' }),
                ],
            }),
            element('manipulate-scene', {
                children: [
                    element('text', { text: ' Add an item ' }),
                    element('sql-solution', { text: ' INSERT INTO items VALUES (1) ' }),
                    element('sql-check', { text: ' SELECT * FROM items ' }),
                    element('sql-placeholder', { text: ' INSERT ' }),
                ],
            }),
        ], [
            element('initial-sql-script', { text: ' CREATE TABLE items (id INTEGER); ' }),
        ]));

        expect(result).toEqual({
            ok: true,
            data: new Game(
                'Inventory',
                'Learn SQL',
                'Test author',
                {
                    type: 'initial-sql-script',
                    system: 'sqlite',
                    systemMinVersion: '3.0.0',
                    sql: 'CREATE TABLE items (id INTEGER);',
                },
                [
                    { type: 'text', text: 'Introduction' },
                    {
                        type: 'image',
                        base64string: IMAGE_FIXTURES[0].base64string,
                        mediaType: 'image/png',
                    },
                    {
                        type: 'select',
                        text: 'Select the items',
                        sqlSol: 'SELECT * FROM items',
                        sqlPlaceholder: 'SELECT',
                        ordinaryHints: [{ type: 'expected-result' }],
                        hasSolHint: false,
                        isRowOrderRelevant: true,
                        isColOrderRelevant: true,
                        areColNamesRelevant: false,
                    },
                    {
                        type: 'manipulate',
                        text: 'Add an item',
                        sqlSol: 'INSERT INTO items VALUES (1)',
                        sqlCheck: 'SELECT * FROM items',
                        sqlPlaceholder: 'INSERT',
                        ordinaryHints: [{ type: 'expected-result' }],
                        hasSolHint: false,
                    },
                ],
            ),
        });
    });

    it('uses empty placeholders and false relevance flags when they are omitted', () => {
        const result = xmlToGame(gameElement([
            element('select-scene', {
                children: [
                    element('text', { text: 'Select something' }),
                    element('sql-solution', { text: 'SELECT 1' }),
                ],
            }),
            element('manipulate-scene', {
                children: [
                    element('text', { text: 'Change something' }),
                    element('sql-solution', { text: 'UPDATE items SET value = 1' }),
                    element('sql-check', { text: 'SELECT value FROM items' }),
                ],
            }),
        ]));

        expect(result).toMatchObject({
            ok: true,
            data: {
                scenes: [{
                    type: 'select',
                    sqlPlaceholder: '',
                    ordinaryHints: [{ type: 'expected-result' }],
                    hasSolHint: false,
                    isRowOrderRelevant: false,
                    isColOrderRelevant: false,
                    areColNamesRelevant: false,
                }, {
                    type: 'manipulate',
                    sqlPlaceholder: '',
                    ordinaryHints: [{ type: 'expected-result' }],
                    hasSolHint: false,
                }],
            },
        });
    });

    it('decodes an embedded SQLite database', () => {
        const result = xmlToGame(gameElement([
            element('text-scene', {
                children: [element('text', { text: 'Introduction' })],
            }),
        ], [
            element('sqlite-db', { text: 'AQID' }),
        ]));

        expect(result).toMatchObject({
            ok: true,
            data: {
                dbData: { type: 'sqlite-db', data: new Uint8Array([1, 2, 3]) },
            },
        });
    });

    it.each([
        {
            description: 'title',
            xml: element('game', {
                children: [
                    element('head', {
                        children: [
                            element('teaser', { text: 'Learn SQL' }),
                            element('copyright', { text: 'Test author' }),
                        ],
                    }),
                    element('scenes', {
                        children: [element('text-scene', {
                            children: [element('text', { text: 'Introduction' })],
                        })],
                    }),
                ],
            }),
            details: '<title>...</title> is missing',
        },
        {
            description: 'teaser',
            xml: element('game', {
                children: [
                    element('head', {
                        children: [
                            element('title', { text: 'Inventory' }),
                            element('copyright', { text: 'Test author' }),
                        ],
                    }),
                    element('scenes', {
                        children: [element('text-scene', {
                            children: [element('text', { text: 'Introduction' })],
                        })],
                    }),
                ],
            }),
            details: '<teaser>...</teaser> is missing',
        },
        {
            description: 'copyright',
            xml: element('game', {
                children: [
                    element('head', {
                        children: [
                            element('title', { text: 'Inventory' }),
                            element('teaser', { text: 'Learn SQL' }),
                        ],
                    }),
                    element('scenes', {
                        children: [element('text-scene', {
                            children: [element('text', { text: 'Introduction' })],
                        })],
                    }),
                ],
            }),
            details: '<copyright>...</copyright> is missing',
        },
        {
            description: 'scenes container',
            xml: element('game', {
                children: [element('head', {
                    children: [
                        element('title', { text: 'Inventory' }),
                        element('teaser', { text: 'Learn SQL' }),
                        element('copyright', { text: 'Test author' }),
                    ],
                })],
            }),
            details: '<scenes>...</scenes> are missing',
        },
        {
            description: 'scene',
            xml: gameElement([]),
            details: '<scenes>...</scenes> must contain at least one scene',
        },
    ])('returns a typed failure when the required $description is missing', ({ xml, details }) => {
        expect(xmlToGame(xml)).toEqual({
            ok: false,
            error: { kind: 'parse-xml', details },
        });
    });

    it.each([
        {
            description: 'text in a text scene',
            scene: element('text-scene'),
            details: '<text>...</text> is missing',
        },
        {
            description: 'text in a select scene',
            scene: element('select-scene', {
                children: [element('sql-solution', { text: 'SELECT 1' })],
            }),
            details: '<text>...</text> is missing',
        },
        {
            description: 'SQL solution in a select scene',
            scene: element('select-scene', {
                children: [element('text', { text: 'Select something' })],
            }),
            details: '<sql-solution>...</sql-solution> is missing',
        },
        {
            description: 'text in a manipulate scene',
            scene: element('manipulate-scene', {
                children: [
                    element('sql-solution', { text: 'UPDATE items SET value = 1' }),
                    element('sql-check', { text: 'SELECT value FROM items' }),
                ],
            }),
            details: '<text>...</text> is missing',
        },
        {
            description: 'SQL solution in a manipulate scene',
            scene: element('manipulate-scene', {
                children: [
                    element('text', { text: 'Change something' }),
                    element('sql-check', { text: 'SELECT value FROM items' }),
                ],
            }),
            details: '<sql-solution>...</sql-solution> is missing',
        },
        {
            description: 'SQL check in a manipulate scene',
            scene: element('manipulate-scene', {
                children: [
                    element('text', { text: 'Change something' }),
                    element('sql-solution', { text: 'UPDATE items SET value = 1' }),
                ],
            }),
            details: '<sql-check>...</sql-check> is missing',
        },
    ])('returns a typed failure when $description is missing', ({ scene, details }) => {
        expect(xmlToGame(gameElement([scene]))).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: `At least one scene failed to parse: ${details}`,
            },
        });
    });

    it('returns a typed failure for an unknown scene type', () => {
        const result = xmlToGame(gameElement([
            element('video-scene'),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'At least one scene failed to parse: Unknown scene type: video-scene',
            },
        });
    });

    it('reports every invalid scene in a single typed failure', () => {
        const result = xmlToGame(gameElement([
            element('text-scene'),
            element('video-scene'),
            element('manipulate-scene', {
                children: [
                    element('text', { text: 'Change something' }),
                    element('sql-solution', { text: 'UPDATE items SET value = 1' }),
                ],
            }),
        ]));

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'At least one scene failed to parse: <text>...</text> is missing. Unknown scene type: video-scene. <sql-check>...</sql-check> is missing',
            },
        });
    });
});

describe('game-to-XML conversion', () => {
    it('serializes metadata, SQL initialization, and every scene type', () => {
        const xml = gameToXML(new Game(
            'Inventory & tools',
            'Learn SQL',
            'Test author',
            {
                type: 'initial-sql-script',
                system: 'sqlite',
                systemMinVersion: '3.0.0',
                sql: 'CREATE TABLE items (name TEXT);',
            },
            [
                { type: 'text', text: 'Use <queries>' },
                {
                    type: 'image',
                    base64string: IMAGE_FIXTURES[0].base64string,
                    mediaType: 'image/png',
                },
                {
                    type: 'select',
                    text: 'Select items',
                    sqlSol: 'SELECT * FROM items',
                    sqlPlaceholder: 'SELECT',
                    ordinaryHints: [
                        { type: 'text', text: 'Inspect the items' },
                        { type: 'expected-result' },
                    ],
                    hasSolHint: true,
                    isRowOrderRelevant: true,
                    isColOrderRelevant: false,
                    areColNamesRelevant: true,
                },
                {
                    type: 'manipulate',
                    text: 'Add an item',
                    sqlSol: 'INSERT INTO items VALUES (\'hammer\')',
                    sqlCheck: 'SELECT * FROM items',
                    sqlPlaceholder: 'INSERT',
                    ordinaryHints: [],
                    hasSolHint: false,
                },
            ],
        ));

        expect(xml).toContain('<title>Inventory &#x26; tools</title>');
        expect(xml).toContain('<game format-version="2" db-system="sqlite" db-system-min-version="3.0.0">');
        expect(xml).toContain('<text>Use &#x3C;queries&#x3E;</text>');
        expect(xml).toContain(`<image-scene media-type="image/png">${IMAGE_FIXTURES[0].base64string}</image-scene>`);
        expect(xml).toContain('<select-scene is-row-order-relevant="true" is-col-order-relevant="false" are-col-names-relevant="true" has-sol-hint="true">');
        expect(xml).toContain('<text-hint>Inspect the items</text-hint>');
        expect(xml).toContain('<expected-result-hint />');
        expect(xml).toContain('<manipulate-scene has-sol-hint="false">');
        expect(xml).toContain('<sql-check>SELECT * FROM items</sql-check>');
        expect(xml).toContain('<initial-sql-script>CREATE TABLE items (name TEXT);</initial-sql-script>');
    });

    it('encodes an embedded SQLite database as base64', () => {
        const xml = gameToXML(new Game(
            'Binary game',
            '',
            '',
            {
                type: 'sqlite-db',
                system: 'sqlite',
                systemMinVersion: '3.0.0',
                data: new Uint8Array([1, 2, 3]),
            },
            [{ type: 'text', text: 'Introduction' }],
        ));

        expect(xml).toContain('<sqlite-db>AQID</sqlite-db>');
    });

    it('escapes XML special characters in metadata, SQL, and placeholders', () => {
        const xml = gameToXML(new Game(
            'Inventory & tools',
            'Learn <SQL>',
            'Author > editor',
            {
                type: 'initial-sql-script',
                system: 'sqlite',
                systemMinVersion: '3.0.0',
                sql: 'SELECT a < b & c > d',
            },
            [
                { type: 'text', text: 'Use <queries> & expressions' },
                {
                    type: 'select',
                    text: 'Select a < value',
                    sqlSol: 'SELECT a < b',
                    sqlPlaceholder: 'SELECT & filter',
                    ordinaryHints: [{ type: 'text', text: 'Compare < and &' }],
                    hasSolHint: false,
                    isRowOrderRelevant: false,
                    isColOrderRelevant: false,
                    areColNamesRelevant: false,
                },
                {
                    type: 'manipulate',
                    text: 'Change a > value',
                    sqlSol: 'UPDATE items SET value = a < b',
                    sqlCheck: 'SELECT a > b',
                    sqlPlaceholder: 'UPDATE & filter',
                    ordinaryHints: [],
                    hasSolHint: false,
                },
            ],
        ));

        expect(xml).toContain('<title>Inventory &#x26; tools</title>');
        expect(xml).toContain('<teaser>Learn &#x3C;SQL&#x3E;</teaser>');
        expect(xml).toContain('<copyright>Author &#x3E; editor</copyright>');
        expect(xml).toContain('<initial-sql-script>SELECT a &#x3C; b &#x26; c &#x3E; d</initial-sql-script>');
        expect(xml).toContain('<text>Use &#x3C;queries&#x3E; &#x26; expressions</text>');
        expect(xml).toContain('<text>Select a &#x3C; value</text>');
        expect(xml).toContain('<sql-solution>SELECT a &#x3C; b</sql-solution>');
        expect(xml).toContain('<sql-placeholder>SELECT &#x26; filter</sql-placeholder>');
        expect(xml).toContain('<text-hint>Compare &#x3C; and &#x26;</text-hint>');
        expect(xml).toContain('<text>Change a &#x3E; value</text>');
        expect(xml).toContain('<sql-solution>UPDATE items SET value = a &#x3C; b</sql-solution>');
        expect(xml).toContain('<sql-check>SELECT a &#x3E; b</sql-check>');
        expect(xml).toContain('<sql-placeholder>UPDATE &#x26; filter</sql-placeholder>');
    });
});
