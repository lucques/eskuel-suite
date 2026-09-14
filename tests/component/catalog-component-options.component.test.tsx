import { afterEach, describe, expect, it } from 'vitest';

import {
    BrowserApp,
    GameConsoleApp,
    GameEditorApp,
} from '../../src';
import type { BrowserSession } from '../../src/apps/browser/session';
import type { GameEditorSession } from '../../src/apps/game-editor/session';

const sessions: Array<{ dispose(): void }> = [];

afterEach(() => {
    for (const session of sessions) {
        session.dispose();
    }
    sessions.length = 0;
});

describe('initial app sources', () => {
    it('creates the initial GameConsoleApp source from initialGameUrl', () => {
        const component = new GameConsoleApp('unused', {
            initialGameUrl: '/games/direct.xml?language=en',
        });

        expect(Reflect.get(component, 'initialFileSource')).toEqual({
            filename: 'direct.xml',
            type: 'xml',
            source: { type: 'fetch', url: '/games/direct.xml?language=en' },
        });
    });

    it('creates GameEditorApp sessions from initialGameUrls', () => {
        const component = new GameEditorApp('unused', {
            initialGameUrls: ['/games/first.xml', '/games/second.xml?version=2'],
        });
        const editorSessions = Reflect.get(component, 'sessions') as GameEditorSession[];
        sessions.push(...editorSessions);

        expect(editorSessions.map(session => session.getFilename())).toEqual(['first.xml', 'second.xml']);
        expect(editorSessions.map(session => session.getDocumentSourceKey())).toEqual([
            `url:${new URL('/games/first.xml', window.location.href).href}`,
            `url:${new URL('/games/second.xml?version=2', window.location.href).href}`,
        ]);
    });

    it('creates BrowserApp sessions from SQL, SQLite, and Eskuel package initialDatabaseUrls', () => {
        const component = new BrowserApp('unused', {
            initialDatabaseUrls: [
                '/databases/schema.sql',
                '/databases/content.SQLITE?download=1',
                '/databases/content.eskueldb',
            ],
        });
        const browserSessions = Reflect.get(component, 'instances') as BrowserSession[];
        sessions.push(...browserSessions);

        expect(browserSessions.map(session => ({
            filename: session.getFilename(),
            source: Reflect.get(session, 'source'),
        }))).toEqual([
            {
                filename: 'schema.sql',
                source: {
                    filename: 'schema.sql',
                    type: 'initial-sql-script',
                    source: { type: 'fetch', url: '/databases/schema.sql' },
                },
            },
            {
                filename: 'content.SQLITE',
                source: {
                    filename: 'content.SQLITE',
                    type: 'sqlite-db',
                    source: { type: 'fetch', url: '/databases/content.SQLITE?download=1' },
                },
            },
            {
                filename: 'content.eskueldb',
                source: {
                    filename: 'content.eskueldb',
                    type: 'eskuel-database-package',
                    source: { type: 'fetch', url: '/databases/content.eskueldb' },
                },
            },
        ]);
    });

    it('rejects an unsupported initial database URL extension', () => {
        expect(() => new BrowserApp('unused', {
            initialDatabaseUrls: ['/databases/content.csv'],
        })).toThrowError(/Unsupported database filename extension/);
    });
});
