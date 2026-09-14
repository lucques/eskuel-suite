import 'bootstrap/dist/css/bootstrap.min.css';
import '../../../src/base.css';

import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { App } from '../../../src/apps/browser/App';
import type { LocalizedLink } from '../../../src/apps/component-options';
import { BrowserSession } from '../../../src/apps/browser/session';
import type { DatabaseCatalogEntry } from '../../../src/catalog';
import type { DbSource } from '../../../src/database/source';
import browserEnglish from '../../../src/i18n/locales/browser/en.json';
import browserGerman from '../../../src/i18n/locales/browser/de.json';
import commonEnglish from '../../../src/i18n/locales/common/en.json';
import commonGerman from '../../../src/i18n/locales/common/de.json';
import { SettingsProvider } from '../../../src/settings/settings';
import { createSettingsStore } from '../../../src/settings/store';
import type { Settings } from '../../../src/settings/store';
import minimalSqliteSql from '../fixtures/databases/minimal.sqlite.sql?raw';
import exampleDatabasePackageUrl from '../../../spec/database-package/v1/examples/initial-sql-script.eskueldb?url';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: commonEnglish,
            browser: browserEnglish,
        },
        de: {
            common: commonGerman,
            browser: browserGerman,
        },
    },
    ns: ['common', 'browser'],
    defaultNS: 'common',
    showSupportNotice: false,
});

const sessions: BrowserSession[] = [];

function createSession(name: string, source: DbSource): BrowserSession {
    const session = new BrowserSession(name, source);
    sessions.push(session);
    return session;
}

function renderBrowser(
    initialInstances: BrowserSession[],
    settings: Partial<Settings> = {},
    databaseCatalog: readonly DatabaseCatalogEntry[] = [],
    navigation: {
        linksCenterLeft?: readonly LocalizedLink[],
        linksRight?: readonly LocalizedLink[],
    } = {},
) {
    const settingsStore = createSettingsStore();
    settingsStore.update(settings);
    return render(
        <I18nextProvider i18n={i18n}>
            <SettingsProvider store={settingsStore}>
                <div style={{ width: '1200px', height: '800px' }}>
                    <App
                        initialInstances={initialInstances}
                        databaseCatalog={databaseCatalog}
                        linksCenterLeft={navigation.linksCenterLeft}
                        linksRight={navigation.linksRight}
                    />
                </div>
            </SettingsProvider>
        </I18nextProvider>,
    );
}

afterEach(async () => {
    await i18n.changeLanguage('en');
    for (const session of sessions) {
        session.dispose();
    }
    sessions.length = 0;
    document.documentElement.removeAttribute('data-bs-theme');
    vi.restoreAllMocks();
});

describe('browser application session integration', () => {
    it('updates generic localized navigation links when the language changes', async () => {
        const screen = renderBrowser([], {}, [], {
            linksCenterLeft: [{
                en: { title: 'Database shelf', url: '/en/databases/' },
                de: { title: 'Datenbankregal', url: '/de/datenbanken/' },
            }],
            linksRight: [{
                en: { title: 'Course overview', url: '/en/' },
                de: { title: 'Kursübersicht', url: '/de/' },
            }],
        });

        await screen.getByRole('button', { name: 'Menu' }).click();
        await expect.element(screen.getByRole('link', { name: 'Course overview' })).toHaveAttribute('href', '/en/');
        await expect.element(screen.getByRole('link', { name: 'Database shelf' })).toHaveAttribute('href', '/en/databases/');

        await i18n.changeLanguage('de');

        await expect.element(screen.getByRole('link', { name: 'Kursübersicht' })).toHaveAttribute('href', '/de/');
        await expect.element(screen.getByRole('link', { name: 'Datenbankregal' })).toHaveAttribute('href', '/de/datenbanken/');
    });

    it('opens a catalog file and fetches it through the complete application flow', async () => {
        const catalogUrl = '/catalog/minimal.sqlite.sql';
        const fetchSpy = mockCatalogFetch(catalogUrl, minimalSqliteSql);
        const screen = renderBrowser([], {}, makeFetchedDatabaseCatalog(catalogUrl));

        await screen.getByRole('button', { name: 'Menu' }).click();
        await screen.getByRole('button', { name: 'Open database', exact: true }).click();
        await screen.getByRole('radio', { name: 'Fetched Catalog Database', exact: true }).click();
        await screen.getByRole('button', { name: 'Open', exact: true }).click();

        await expect.element(
            screen.getByTestId('browser-session-tab').filter({ hasText: 'minimal.sqlite.sql' }),
        ).toBeVisible();
        await expect.element(screen.getByText('marker', { exact: true }).first()).toBeVisible();
        expect(fetchSpy.mock.calls.some(([input]) => fetchInputUrl(input) === catalogUrl)).toBe(true);
    });

    it('opens an Eskuel database package through the browser database engine', async () => {
        const screen = renderBrowser([createSession('example-school.eskueldb', {
            type: 'eskuel-database-package',
            source: { type: 'fetch', url: exampleDatabasePackageUrl },
        })]);

        await expect.element(
            screen.getByTestId('browser-session-tab').filter({ hasText: 'example-school.eskueldb' }),
        ).toBeVisible();
        await expect.element(screen.getByText('students', { exact: true }).first()).toBeVisible();
    });

    it.each([
        {
            name: 'invalid-initialization.sql',
            source: {
                type: 'initial-sql-script',
                source: { type: 'inline', content: 'THIS IS NOT VALID SQL;' },
            } satisfies DbSource,
            errorTitle: 'Database initialization failed',
        },
        {
            name: 'corrupt.db',
            source: {
                type: 'sqlite-db',
                source: { type: 'inline', content: new TextEncoder().encode('This is not a SQLite database.') },
            } satisfies DbSource,
            errorTitle: 'Database could not be opened',
        },
        {
            name: 'corrupt.eskueldb',
            source: {
                type: 'eskuel-database-package',
                source: { type: 'inline', content: new TextEncoder().encode('This is not a ZIP archive.') },
            } satisfies DbSource,
            errorTitle: 'Database package is invalid',
        },
    ])('reports a failed $name session in its tab and workbench', async ({ name, source, errorTitle }) => {
        const screen = renderBrowser([createSession(name, source)]);
        const tab = screen.getByTestId('browser-session-tab').filter({ hasText: name });

        await expect.element(tab).toBeVisible();
        await expect.element(tab.getByRole('status')).toHaveTextContent('Error');
        await expect.element(screen.getByTestId('nonready-view').getByRole('heading')).toHaveTextContent(errorTitle);
    });

    it('disables opening another database at the configured session limit', async () => {
        const databaseSource: DbSource = {
            type: 'initial-sql-script',
            source: { type: 'inline', content: 'SELECT TRUE;' },
        };
        const screen = renderBrowser([
            createSession('first', databaseSource),
            createSession('second', databaseSource),
        ], { maxOpenDatabases: 2 });

        await screen.getByRole('button', { name: 'Menu' }).click();
        await expect.element(screen.getByRole('button', { name: 'Open database' })).toBeDisabled();
    });
});

function makeFetchedDatabaseCatalog(url: string): readonly DatabaseCatalogEntry[] {
    return [{
        id: 'fetched-database',
        localizations: {
            en: {
                title: 'Fetched Catalog Database',
                files: [{ url, filename: 'minimal.sqlite.sql' }],
            },
        },
    }];
}

function mockCatalogFetch(url: string, content: string) {
    const originalFetch = globalThis.fetch.bind(globalThis);
    return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        if (fetchInputUrl(input) === url) {
            return Promise.resolve(new Response(content, {
                headers: { 'content-type': 'text/plain' },
            }));
        }
        else {
            return originalFetch(input, init);
        }
    });
}

function fetchInputUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') {
        return input;
    }
    else if (input instanceof URL) {
        return input.href;
    }
    else {
        return input.url;
    }
}
