import 'bootstrap/dist/css/bootstrap.min.css';
import '../../../src/base.css';

import { createInstance } from 'i18next';
import { Effect } from 'effect';
import { page, userEvent, type Locator } from '@vitest/browser/context';
import { StrictMode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { App } from '../../../src/apps/game-editor/App';
import type { LocalizedLink } from '../../../src/apps/component-options';
import { makeGameDocumentID } from '../../../src/apps/game-editor/document';
import type { GameDocumentDraftStore, RestoredGameDocumentDraft } from '../../../src/apps/game-editor/draft-store';
import { makeGameDocumentSceneID } from '../../../src/apps/game-editor/draft-store';
import { AppWithPersistence } from '../../../src/apps/game-editor/AppWithPersistence';
import type { GameSaveFilePicker } from '../../../src/apps/game-editor/game-file';
import type { GameDocumentLockManager } from '../../../src/apps/game-editor/document-lock';
import type { GameEditorSession } from '../../../src/apps/game-editor/session';
import type { GameCatalogEntry } from '../../../src/catalog';
import { fingerprintGame } from '../../../src/game/fingerprint';
import { Game } from '../../../src/game/model';
import commonEnglish from '../../../src/i18n/locales/common/en.json';
import gameEditorEnglish from '../../../src/i18n/locales/game-editor/en.json';
import { createWebBrowserGameEditorSession } from '../../../src/platform/webbrowser/create-game-editor-session';
import { SettingsProvider } from '../../../src/settings/settings';
import { createSettingsStore } from '../../../src/settings/store';
import type { Settings } from '../../../src/settings/store';
import noDatabaseXml from '../fixtures/games/valid/no-database.xml?raw';
import { createInventoryGame } from '../support/game-builder';
import { createGamePackageInfo } from '../support/package-info';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: commonEnglish,
            'game-editor': gameEditorEnglish,
        },
    },
    ns: ['common', 'game-editor'],
    defaultNS: 'common',
    showSupportNotice: false,
});

const sessions: GameEditorSession[] = [];

function renderGameEditorSession(
    session: GameEditorSession,
    saveFilePicker: GameSaveFilePicker | null = null,
    settings: Partial<Settings> = {},
) {
    sessions.push(session);
    const settingsStore = createSettingsStore();
    settingsStore.update(settings);
    return render(
        <I18nextProvider i18n={i18n}>
            <SettingsProvider store={settingsStore}>
                <div style={{ width: '1200px', height: '800px' }}>
                    <App initialSessions={[session]} saveFilePicker={saveFilePicker} />
                </div>
            </SettingsProvider>
        </I18nextProvider>,
    );
}

function renderGameEditor() {
    return renderGameEditorSession(createWebBrowserGameEditorSession('integration-game', {
        type: 'object',
        source: new Game(
            'Integration Game',
            'Integration teaser',
            'Integration copyright',
            {
                type: 'initial-sql-script',
                system: 'sqlite',
                systemMinVersion: '3.0.0',
                sql: 'CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL);',
            },
            [{ type: 'text', text: 'Introduction' }],
        ),
    }));
}

function renderGameEditorCatalog(
    gameCatalog: readonly GameCatalogEntry[],
    navigation: {
        linksCenterLeft?: readonly LocalizedLink[],
        linksRight?: readonly LocalizedLink[],
    } = {},
) {
    return render(
        <I18nextProvider i18n={i18n}>
            <SettingsProvider store={createSettingsStore()}>
                <div style={{ width: '1200px', height: '800px' }}>
                    <App
                        initialSessions={[]}
                        gameCatalog={gameCatalog}
                        linksCenterLeft={navigation.linksCenterLeft}
                        linksRight={navigation.linksRight}
                        saveFilePicker={null}
                    />
                </div>
            </SettingsProvider>
        </I18nextProvider>,
    );
}

function renderPersistentGameEditor(
    draftStore: GameDocumentDraftStore,
    initialSessions: GameEditorSession[] = [],
    documentLockManager?: GameDocumentLockManager,
) {
    sessions.push(...initialSessions);
    const settingsStore = createSettingsStore();
    return render(
        <StrictMode>
            <I18nextProvider i18n={i18n}>
                <SettingsProvider store={settingsStore}>
                    <div style={{ width: '1200px', height: '800px' }}>
                        <AppWithPersistence
                            initialSessions={initialSessions}
                            saveFilePicker={null}
                            draftStore={draftStore}
                            documentLockManager={documentLockManager}
                        />
                    </div>
                </SettingsProvider>
            </I18nextProvider>
        </StrictMode>,
    );
}

afterEach(() => {
    for (const session of sessions) {
        session.dispose();
    }
    sessions.length = 0;
    document.documentElement.removeAttribute('data-bs-theme');
    vi.restoreAllMocks();
});

function clickEditorTabCloseButton(tab: Locator): void {
    const closeButton = tab.element().querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    expect(closeButton).not.toBeNull();
    closeButton!.click();
}

describe('game editor application controls', () => {
    it('offers generic localized links in both navigation regions', async () => {
        const screen = renderGameEditorCatalog([], {
            linksCenterLeft: [{
                en: { title: 'Game shelf', url: '/en/games/' },
                de: { title: 'Spieleregal', url: '/de/spiele/' },
            }],
            linksRight: [{
                en: { title: 'Course overview', url: '/en/' },
                de: { title: 'Kursübersicht', url: '/de/' },
            }],
        });

        await screen.getByRole('button', { name: 'Menu' }).click();
        await expect.element(screen.getByRole('link', { name: 'Course overview' })).toHaveAttribute('href', '/en/');
        await expect.element(screen.getByRole('link', { name: 'Game shelf' })).toHaveAttribute('href', '/en/games/');
    });

    it('opens a catalog file and fetches it through the complete application flow', async () => {
        const catalogUrl = '/catalog/editor-no-database.xml';
        const fetchSpy = mockCatalogFetch(catalogUrl, noDatabaseXml);
        const screen = renderGameEditorCatalog(makeFetchedGameCatalog(catalogUrl));

        await screen.getByRole('button', { name: 'Menu' }).click();
        await screen.getByRole('button', { name: 'Open game', exact: true }).click();
        await screen.getByRole('radio', { name: 'Fetched Editor Game', exact: true }).click();
        await screen.getByRole('button', { name: 'Open', exact: true }).click();

        await expect.element(screen.getByLabelText('Name:')).toHaveValue('No database');
        expect(fetchSpy.mock.calls.some(([input]) => fetchInputUrl(input) === catalogUrl)).toBe(true);
    });

    it('restores and discards drafts through the persistence wrapper', async () => {
        const documentId = makeGameDocumentID('restored-document');
        const deleteDocument = vi.fn(async () => undefined);
        const replace = vi.fn(async () => undefined);
        const draftStore: GameDocumentDraftStore = {
            loadAll: async () => [{
                document: {
                    id: documentId,
                    filename: 'restored_game.xml',
                    revision: 4,
                    sourceKey: null,
                    savedGameFingerprint: null,
                    game: new Game(
                        'Restored Game',
                        'Restored teaser',
                        'Restored copyright',
                        null,
                        [{ type: 'text', text: 'Restored scene' }],
                    ),
                },
                sceneIds: [makeGameDocumentSceneID('restored-scene')],
                updatedAt: 1,
            }],
            replace,
            update: async () => undefined,
            deleteDocument,
        };
        const screen = renderPersistentGameEditor(draftStore);

        const tab = screen.getByTestId('game-editor-session-tab').filter({ hasText: 'restored_game.xml' });
        await expect.element(tab).toBeVisible();
        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Restored Game');
        expect(replace).not.toHaveBeenCalled();

        clickEditorTabCloseButton(tab);
        await screen.getByRole('dialog').getByRole('button', { name: 'Close without exporting' }).click();

        await vi.waitFor(() => expect(deleteDocument).toHaveBeenCalledWith(documentId, 4));
        await expect.element(tab).not.toBeInTheDocument();
    });

    it('restores package information and shows the package-import notice again', async () => {
        const restoredDraft = createRestoredDraft(
            'restored-package-document',
            'restored-package.xml',
            'Restored package game',
            3,
        );
        const packageInfo = createGamePackageInfo();
        const draftStore: GameDocumentDraftStore = {
            loadAll: async () => [{ ...restoredDraft, packageInfo }],
            replace: async () => undefined,
            update: async () => undefined,
            deleteDocument: async () => undefined,
        };
        const screen = renderPersistentGameEditor(draftStore);

        await expect.element(screen.getByText(
            'This .eskuelgame package was imported as editable XML. Saving or exporting the XML does not preserve the package metadata or bundled licensing files.',
            { exact: true },
        )).toBeVisible();

        await screen.getByRole('button', { name: 'Licenses', exact: true }).click();
        await expect.element(screen.getByRole('dialog', { name: 'About Example game' })).toBeVisible();
        await screen.getByText('Game License', { exact: true }).click();
        await screen.getByText('Database License', { exact: true }).click();
        await expect.element(screen.getByText('Game license text', { exact: true })).toBeVisible();
        await expect.element(screen.getByText('Database license text', { exact: true })).toBeVisible();
    });

    it('persists package information when initializing a draft', async () => {
        const packageInfo = createGamePackageInfo();
        const initialSession = createWebBrowserGameEditorSession(
            'imported-package.xml',
            {
                type: 'object',
                source: new Game('Imported package game', '', '', null, [{ type: 'text', text: 'Scene' }]),
            },
            { packageInfo },
        );
        const replace: GameDocumentDraftStore['replace'] = vi.fn(async () => undefined);
        const draftStore: GameDocumentDraftStore = {
            loadAll: async () => [],
            replace,
            update: async () => undefined,
            deleteDocument: async () => undefined,
        };
        renderPersistentGameEditor(draftStore, [initialSession]);

        const replaceMock = vi.mocked(replace);
        await vi.waitFor(() => expect(replaceMock).toHaveBeenCalledOnce());
        expect(replaceMock.mock.calls[0]?.[0].packageInfo).toEqual(packageInfo);
    });

    it('permanently discards package information when closing its notice', async () => {
        const noticeText = 'This .eskuelgame package was imported as editable XML. Saving or exporting the XML does not preserve the package metadata or bundled licensing files.';
        let storedDraft: RestoredGameDocumentDraft = {
            ...createRestoredDraft(
                'dismissed-package-document',
                'dismissed-package.xml',
                'Dismissed package game',
                2,
            ),
            packageInfo: createGamePackageInfo(),
        };
        const replace: GameDocumentDraftStore['replace'] = vi.fn(async draft => {
            storedDraft = draft;
        });
        const draftStore: GameDocumentDraftStore = {
            loadAll: async () => [storedDraft],
            replace,
            update: async () => undefined,
            deleteDocument: async () => undefined,
        };
        const screen = renderPersistentGameEditor(draftStore);
        const notice = screen.getByRole('alert').filter({ hasText: noticeText });
        await expect.element(notice).toHaveTextContent(noticeText);

        await notice.getByRole('button', { name: 'Close', exact: true }).click();

        await expect.element(screen.getByText(noticeText, { exact: true })).not.toBeInTheDocument();
        await expect.element(screen.getByRole('button', { name: 'Licenses', exact: true })).not.toBeInTheDocument();
        const replaceMock = vi.mocked(replace);
        await vi.waitFor(() => expect(replaceMock).toHaveBeenCalledOnce());
        expect(storedDraft.packageInfo).toBeUndefined();

        screen.unmount();
        const reloadedScreen = renderPersistentGameEditor(draftStore);
        await expect.element(
            reloadedScreen.getByTestId('game-editor-session-tab').filter({ hasText: 'dismissed-package.xml' }),
        ).toBeVisible();
        await expect.element(reloadedScreen.getByText(noticeText, { exact: true })).not.toBeInTheDocument();
        await expect.element(
            reloadedScreen.getByRole('button', { name: 'Licenses', exact: true }),
        ).not.toBeInTheDocument();
    });

    it('closes a restored draft immediately when it has a clean file checkpoint', async () => {
        const restoredDraft = createRestoredDraft(
            'clean-restored-document',
            'clean-restored.xml',
            'Clean restored game',
            7,
        );
        const cleanDraft: RestoredGameDocumentDraft = {
            ...restoredDraft,
            document: {
                ...restoredDraft.document,
                savedGameFingerprint: await fingerprintGame(restoredDraft.document.game),
            },
        };
        const deleteDocument = vi.fn(async () => undefined);
        const draftStore: GameDocumentDraftStore = {
            loadAll: async () => [cleanDraft],
            replace: async () => undefined,
            update: async () => undefined,
            deleteDocument,
        };
        const screen = renderPersistentGameEditor(draftStore);
        const tab = screen.getByTestId('game-editor-session-tab').filter({ hasText: 'clean-restored.xml' });
        await expect.element(tab).toBeVisible();

        clickEditorTabCloseButton(tab);

        await expect.element(tab).not.toBeInTheDocument();
        await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
        await vi.waitFor(() => expect(deleteDocument).toHaveBeenCalledWith(cleanDraft.document.id, 7));
    });

    it('opens the initial workspace without persistence when loading drafts fails', async () => {
        const loadFailure = new Error('IndexedDB is unavailable');
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const replace = vi.fn(async () => undefined);
        const initialSession = createWebBrowserGameEditorSession('startup-game.xml', {
            type: 'object',
            source: new Game(
                'Startup Game',
                'Startup teaser',
                'Startup copyright',
                null,
                [{ type: 'text', text: 'Startup scene' }],
            ),
        });
        const draftStore: GameDocumentDraftStore = {
            loadAll: async () => {
                throw loadFailure;
            },
            replace,
            update: async () => undefined,
            deleteDocument: async () => undefined,
        };
        const screen = renderPersistentGameEditor(draftStore, [initialSession]);

        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Startup Game');
        await expect.element(
            screen.getByTestId('game-editor-session-tab').filter({ hasText: 'startup-game.xml' }),
        ).toBeVisible();
        expect(replace).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalledWith('Failed to restore game-editor drafts:', loadFailure);
    });

    it('warns the user when the initial draft cannot be written', async () => {
        const writeFailure = new Error('Writing the initial draft failed');
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const initialSession = createSimpleEditorSession();
        const draftStore: GameDocumentDraftStore = {
            loadAll: async () => [],
            replace: async () => {
                throw writeFailure;
            },
            update: async () => undefined,
            deleteDocument: async () => undefined,
        };
        const screen = renderPersistentGameEditor(draftStore, [initialSession]);

        await expect.element(
            screen.getByText(
                'The local draft could not be saved. Save or export the game file to avoid losing changes.',
                { exact: true },
            ),
        ).toBeVisible();
        expect(consoleError).toHaveBeenCalledWith('Failed to persist a game-editor draft:', writeFailure);
    });

    it('replaces an initial session with its restored draft and activates it when their source keys match', async () => {
        const sourceKey = 'url:https://example.test/game.xml';
        const initialSession = createWebBrowserGameEditorSession(
            'game.xml',
            {
                type: 'object',
                source: new Game(
                    'Server version',
                    'Server teaser',
                    'Server copyright',
                    null,
                    [{ type: 'text', text: 'Server scene' }],
                ),
            },
            { sourceKey },
        );
        const disposeInitialSession = vi.spyOn(initialSession, 'dispose');
        const draftStore: GameDocumentDraftStore = {
            loadAll: async () => [
                createRestoredDraft('other-document', 'other.xml', 'Other draft', 8),
                createRestoredDraft(
                    'restored-source-document',
                    'game.xml',
                    'Locally edited version',
                    5,
                    sourceKey,
                ),
            ],
            replace: async () => undefined,
            update: async () => undefined,
            deleteDocument: async () => undefined,
        };
        const screen = renderPersistentGameEditor(draftStore, [initialSession]);

        await vi.waitFor(() => expect(document.querySelectorAll('[data-testid="game-editor-session-tab"]')).toHaveLength(2));
        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Locally edited version');
        expect(disposeInitialSession).toHaveBeenCalledOnce();
    });

    it('activates an initial session alongside unrelated restored drafts', async () => {
        const initialSession = createSimpleEditorSession();
        const draftStore: GameDocumentDraftStore = {
            loadAll: async () => [createRestoredDraft('other-document', 'other.xml', 'Other draft', 8)],
            replace: async () => undefined,
            update: async () => undefined,
            deleteDocument: async () => undefined,
        };
        const screen = renderPersistentGameEditor(draftStore, [initialSession]);

        await vi.waitFor(() => expect(document.querySelectorAll('[data-testid="game-editor-session-tab"]')).toHaveLength(2));
        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Integration Game');
    });

    it.each([false, true])('restores multiple drafts and preserves their panels across tab switches (database: %s)', async withDatabase => {
        const dbData = withDatabase ? createInventoryGame().dbData : null;
        const draftStore: GameDocumentDraftStore = {
            loadAll: async () => [
                createRestoredDraft('newest-document', 'newest.xml', 'Newest draft', 8, null, dbData),
                createRestoredDraft('older-document', 'older.xml', 'Older draft', 3, null, dbData),
            ],
            replace: async () => undefined,
            update: async () => undefined,
            deleteDocument: async () => undefined,
        };
        const screen = renderPersistentGameEditor(draftStore);
        const newestTab = screen.getByTestId('game-editor-session-tab').filter({ hasText: 'newest.xml' });
        const olderTab = screen.getByTestId('game-editor-session-tab').filter({ hasText: 'older.xml' });

        await vi.waitFor(() => expect(document.querySelectorAll('[data-testid="game-editor-session-tab"]')).toHaveLength(2));
        await expect.element(newestTab).toBeVisible();
        await expect.element(olderTab).toBeVisible();
        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Newest draft');

        await screen.getByText('Additional information', { exact: true }).click();
        const newestMetadata = screen.getByTestId('game-editor-metadata-panel').element();
        await screen.getByLabelText('Teaser', { exact: true }).fill('Edited newest teaser');

        for (let switchCount = 0; switchCount < 2; switchCount++) {
            await olderTab.click();
            await expect.element(screen.getByLabelText('Name:')).toHaveValue('Older draft');
            await expect.element(screen.getByText('Older draft scene', { exact: true })).toBeVisible();
            await expect.element(screen.getByTestId('game-editor-database-panel')).toBeVisible();
            if (withDatabase) {
                await expect.element(screen.getByTestId('game-editor-sql-panel')).toBeVisible();
                await expect.element(screen.getByTestId('game-editor-schema-panel').getByText('items', { exact: true })).toBeVisible();
            }

            await newestTab.click();
            await expect.element(screen.getByLabelText('Name:')).toHaveValue('Newest draft');
            await expect.element(screen.getByLabelText('Teaser', { exact: true })).toHaveValue('Edited newest teaser');
            expect(screen.getByTestId('game-editor-metadata-panel').element()).toBe(newestMetadata);
            await expect.element(screen.getByTestId('game-editor-database-panel')).toBeVisible();
        }
    });

    it.each(['game', 'scenes'] as const)('reorders scenes after updating a hidden %s panel without drag-and-drop warnings', async hiddenPanel => {
        const consoleWarn = vi.spyOn(console, 'warn');
        const consoleError = vi.spyOn(console, 'error');
        const session = createWebBrowserGameEditorSession('first-game.xml', {
            type: 'object',
            source: new Game('First game', '', '', null, [
                { type: 'text', text: 'First scene' },
                { type: 'text', text: 'Second scene' },
            ]),
        });
        const otherSession = createSimpleEditorSession();
        const draftStore: GameDocumentDraftStore = {
            loadAll: async () => [],
            replace: async () => undefined,
            update: async () => undefined,
            deleteDocument: async () => undefined,
        };
        const screen = renderPersistentGameEditor(draftStore, [session, otherSession]);
        await expect.element(screen.getByText('First scene', { exact: true })).toBeVisible();

        if (hiddenPanel === 'game') {
            await screen.getByTestId('game-editor-session-tab').filter({ hasText: 'integration-game' }).click();
            await expect.element(screen.getByLabelText('Name:')).toHaveValue('Integration Game');
        }
        else if (hiddenPanel === 'scenes') {
            await screen.getByText('Additional information', { exact: true }).click();
            await expect.element(screen.getByLabelText('Teaser', { exact: true })).toBeVisible();
        }
        else { const _n: never = hiddenPanel; }

        await Effect.runPromise(session.dispatch({
            type: 'update-scene',
            index: 0,
            scene: { type: 'text', text: 'Edited first scene' },
        }));

        if (hiddenPanel === 'game') {
            await screen.getByTestId('game-editor-session-tab').filter({ hasText: 'first-game.xml' }).click();
        }
        else if (hiddenPanel === 'scenes') {
            await screen.getByText('Scenes', { exact: true }).click();
        }
        else { const _n: never = hiddenPanel; }

        await expect.element(screen.getByText('Edited first scene', { exact: true })).toBeVisible();
        const handle = screen.getByTestId('game-editor-scenes-panel').getByRole('button', { name: 'Reorder scene' }).nth(1);
        (handle.element() as HTMLElement).focus();
        await userEvent.keyboard(' ');
        await userEvent.keyboard('{ArrowUp}');
        await userEvent.keyboard(' ');

        await vi.waitFor(() => expect(session.getSnapshot()).toMatchObject({
            kind: 'ready',
            document: {
                game: {
                    scenes: [
                        { type: 'text', text: 'Second scene' },
                        { type: 'text', text: 'Edited first scene' },
                    ],
                },
            },
        }));
        const dragWarnings = [...consoleWarn.mock.calls, ...consoleError.mock.calls].filter(args => (
            args.some(arg => typeof arg === 'string' && arg.includes('@hello-pangea/dnd'))
        ));
        expect(dragWarnings).toEqual([]);
    });

    it('lists drafts that cannot be restored because another browser tab owns them', async () => {
        const draftStore: GameDocumentDraftStore = {
            loadAll: async () => [
                createRestoredDraft('first-locked-document', 'first-locked.xml', 'First locked draft', 2),
                createRestoredDraft('second-locked-document', 'second-locked.xml', 'Second locked draft', 1),
            ],
            replace: async () => undefined,
            update: async () => undefined,
            deleteDocument: async () => undefined,
        };
        const documentLockManager: GameDocumentLockManager = {
            tryAcquire: async () => null,
        };
        const screen = renderPersistentGameEditor(draftStore, [], documentLockManager);

        await expect.element(
            screen.getByText(
                'These games are already open for editing in another browser tab:',
                { exact: true },
            ),
        ).toBeVisible();
        await expect.element(screen.getByText('first-locked.xml', { exact: true })).toBeVisible();
        await expect.element(screen.getByText('second-locked.xml', { exact: true })).toBeVisible();
        expect(document.querySelectorAll('[data-testid="game-editor-session-tab"]')).toHaveLength(0);
    });

    it('ignores draft restoration that finishes after the wrapper is unmounted', async () => {
        let finishLoading: ((drafts: RestoredGameDocumentDraft[]) => void) | undefined;
        const loadAll = vi.fn(() => new Promise<RestoredGameDocumentDraft[]>(resolve => {
            finishLoading = resolve;
        }));
        const sourceKey = 'url:https://example.test/pending-game.xml';
        const initialSession = createWebBrowserGameEditorSession(
            'pending-game.xml',
            { type: 'object', source: new Game('Initial game', '', '', null, [{ type: 'text', text: 'Initial' }]) },
            { sourceKey },
        );
        const disposeInitialSession = vi.spyOn(initialSession, 'dispose');
        const draftStore: GameDocumentDraftStore = {
            loadAll,
            replace: async () => undefined,
            update: async () => undefined,
            deleteDocument: async () => undefined,
        };
        const screen = renderPersistentGameEditor(draftStore, [initialSession]);
        await vi.waitFor(() => expect(loadAll).toHaveBeenCalled());

        screen.unmount();
        finishLoading?.([createRestoredDraft(
            'late-document',
            'pending-game.xml',
            'Late restored game',
            2,
            sourceKey,
        )]);
        await Promise.resolve();

        expect(disposeInitialSession).not.toHaveBeenCalled();
        await expect.element(page.getByText('Late restored game', { exact: true })).not.toBeInTheDocument();
    });

    it('reports a game-loading failure in its tab and workbench', async () => {
        const screen = renderGameEditorSession(createWebBrowserGameEditorSession('invalid-game', {
            type: 'xml',
            source: { type: 'inline', content: '<game></game>' },
        }));
        const initializationView = screen.getByTestId('nonready-view');

        await expect.element(initializationView.getByRole('heading')).toHaveTextContent('Game file is invalid');
        await expect.element(initializationView).toHaveTextContent('The selected file does not contain a valid game.');
        await expect.element(
            screen.getByTestId('game-editor-session-tab').filter({ hasText: 'invalid-game' }).getByRole('status'),
        ).toHaveTextContent('Error');
    });

    it('switches between the scenes and metadata panels', async () => {
        const screen = renderGameEditor();
        const scenesPanel = screen.getByTestId('game-editor-scenes-panel');
        const metadataPanel = screen.getByTestId('game-editor-metadata-panel');
        const databasePanel = screen.getByTestId('game-editor-database-panel');

        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Integration Game');
        await expect.element(scenesPanel).toBeVisible();
        await expect.element(metadataPanel).not.toBeInTheDocument();
        await expect.element(databasePanel).toBeVisible();

        await screen.getByText('Additional information', { exact: true }).click();

        await expect.element(scenesPanel).not.toBeInTheDocument();
        await expect.element(metadataPanel).toBeVisible();
        await expect.element(metadataPanel.getByLabelText('Copyright')).toHaveValue('Integration copyright');
        await expect.element(metadataPanel.getByLabelText('Teaser')).toHaveValue('Integration teaser');

        await screen.getByText('Scenes', { exact: true }).click();

        await expect.element(scenesPanel).toBeVisible();
        await expect.element(metadataPanel).not.toBeInTheDocument();
        await expect.element(databasePanel).toBeVisible();
    });

    it('hides scene testing controls when no database is loaded', async () => {
        const screen = renderGameEditorSession(createWebBrowserGameEditorSession('no-database-game', {
            type: 'object',
            source: new Game('No Database Game', '', '', null, [{
                type: 'select',
                text: 'Task without a database',
                sqlSol: 'SELECT 1',
                sqlPlaceholder: '',
                ordinaryHints: [],
                hasSolHint: false,
                isRowOrderRelevant: false,
                isColOrderRelevant: false,
                areColNamesRelevant: false,
            }]),
        }));
        const scenesPanel = screen.getByTestId('game-editor-scenes-panel');

        await expect.element(scenesPanel.getByText('Task without a database', { exact: true })).toBeVisible();
        await expect.element(scenesPanel.getByTestId('scene-testing-controls')).not.toBeInTheDocument();
    });

    it('applies mobile and desktop layouts', async () => {
        const screen = renderGameEditor();
        const scenesPanel = screen.getByTestId('game-editor-scenes-panel');
        const metadataPanel = screen.getByTestId('game-editor-metadata-panel');
        const databasePanel = screen.getByTestId('game-editor-database-panel');
        const layoutSwitcher = screen.getByLabelText('Layout');

        await expect.element(scenesPanel).toBeVisible();
        await screen.getByRole('button', { name: 'Menu' }).click();
        await layoutSwitcher.click();
        await screen.getByText('Mobile', { exact: true }).click();

        await expect.element(scenesPanel).toBeVisible();
        await expect.element(metadataPanel).not.toBeInTheDocument();
        await expect.element(databasePanel).toBeVisible();

        await screen.getByText('Additional information', { exact: true }).click();
        await expect.element(scenesPanel).not.toBeInTheDocument();
        await expect.element(metadataPanel).toBeVisible();

        await layoutSwitcher.click();
        await screen.getByText('Desktop', { exact: true }).click();
        await screen.getByText('Scenes', { exact: true }).click();

        await expect.element(scenesPanel).toBeVisible();
        await expect.element(metadataPanel).not.toBeInTheDocument();
        await expect.element(databasePanel).toBeVisible();
    });

    it('follows the system theme until the user selects an explicit theme', async () => {
        const nativeMatchMedia = window.matchMedia.bind(window);
        const systemThemeListeners = new Set<EventListenerOrEventListenerObject>();
        let systemDarkMode = true;
        const systemThemeQuery = {
            get matches() {
                return systemDarkMode;
            },
            media: '(prefers-color-scheme: dark)',
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
                systemThemeListeners.add(listener);
            }),
            removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
                systemThemeListeners.delete(listener);
            }),
            dispatchEvent(event: Event) {
                for (const listener of systemThemeListeners) {
                    if (typeof listener === 'function') {
                        listener(event);
                    }
                    else {
                        listener.handleEvent(event);
                    }
                }
                return true;
            },
        } as MediaQueryList;
        vi.spyOn(window, 'matchMedia').mockImplementation(query => (
            query === systemThemeQuery.media ? systemThemeQuery : nativeMatchMedia(query)
        ));
        const screen = renderGameEditor();

        await screen.getByRole('button', { name: 'Menu' }).click();
        await expect.element(screen.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
        expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');

        systemDarkMode = false;
        systemThemeQuery.dispatchEvent(new Event('change'));

        await expect.element(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
        expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');

        await screen.getByRole('button', { name: 'Switch to dark mode' }).click();

        await expect.element(screen.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
        expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');

        systemDarkMode = true;
        systemThemeQuery.dispatchEvent(new Event('change'));
        systemDarkMode = false;
        systemThemeQuery.dispatchEvent(new Event('change'));

        await expect.element(screen.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
        expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');

        await screen.getByRole('button', { name: 'Switch to light mode' }).click();

        await expect.element(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
        expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
    });

    it('undoes and redoes scene edits from the scenes widget', async () => {
        const screen = renderGameEditor();
        const scenesPanel = screen.getByTestId('game-editor-scenes-panel');
        const undoButton = scenesPanel.getByRole('button', { name: 'Undo' });
        const redoButton = scenesPanel.getByRole('button', { name: 'Redo' });
        const addedScene = scenesPanel.getByText('Enter text here', { exact: true });
        const oneTextScene = scenesPanel.getByText('1 x Text', { exact: true });
        const twoTextScenes = scenesPanel.getByText('2 x Text', { exact: true });
        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Integration Game');
        await expect.element(undoButton).toBeDisabled();
        await expect.element(redoButton).toBeDisabled();
        await expect.element(addedScene).not.toBeInTheDocument();
        await expect.element(oneTextScene).toBeVisible();
        await expect.element(twoTextScenes).not.toBeInTheDocument();

        const pointerEvents: unknown[] = [];
        const capturePointerEvent = (event: Event) => {
            const snapshot = sessions[sessions.length - 1].getSnapshot();
            pointerEvents.push({
                event: event.type,
                target: (event.target as HTMLElement).outerHTML.slice(0, 300),
                database: snapshot.kind === 'ready' ? snapshot.databaseStatus.kind : snapshot.kind,
            });
        };
        for (const type of ['mousedown', 'mouseup', 'click']) {
            document.addEventListener(type, capturePointerEvent, true);
        }
        await scenesPanel.getByRole('button', { name: 'Insert scene at end' }).click();
        for (const type of ['mousedown', 'mouseup', 'click']) {
            document.removeEventListener(type, capturePointerEvent, true);
        }
        console.log('Scene insertion diagnostic:', JSON.stringify(pointerEvents));
        const addSceneDialog = screen.getByRole('dialog');
        await addSceneDialog.getByRole('button', { name: 'Add', exact: true }).click();
        await expect.element(addSceneDialog).not.toBeInTheDocument();
        await expect.element(addedScene).toBeVisible();
        await expect.element(oneTextScene).not.toBeInTheDocument();
        await expect.element(twoTextScenes).toBeVisible();
        await expect.element(undoButton).toBeEnabled();
        await expect.element(redoButton).toBeDisabled();

        await undoButton.click();
        await expect.element(addedScene).not.toBeInTheDocument();
        await expect.element(oneTextScene).toBeVisible();
        await expect.element(twoTextScenes).not.toBeInTheDocument();
        await expect.element(undoButton).toBeDisabled();
        await expect.element(redoButton).toBeEnabled();

        await redoButton.click();
        await expect.element(addedScene).toBeVisible();
        await expect.element(oneTextScene).not.toBeInTheDocument();
        await expect.element(twoTextScenes).toBeVisible();
        await expect.element(undoButton).toBeEnabled();
        await expect.element(redoButton).toBeDisabled();
    });

    it('shows the game-file size warning above 75 percent and updates it after database replacement', async () => {
        const session = createSimpleEditorSession();
        const screen = renderGameEditorSession(session, null, { maxGameFileBytes: 10_000 });
        const estimate = screen.getByTestId('game-file-size-estimate');
        await expect.element(estimate).not.toBeInTheDocument();

        await Effect.runPromise(session.dispatch({
            type: 'update-scene',
            index: 0,
            scene: {
                type: 'image',
                mediaType: 'image/png',
                base64string: 'A'.repeat(8_000),
            },
        }));
        await expect.element(estimate).toBeVisible();
        expect(estimate.element().textContent).toMatch(/^Estimated game file size: .+ \/ 9\.8 KiB$/u);
        const imageEstimate = estimate.element().textContent;

        await Effect.runPromise(session.dispatch({
            type: 'set-database-source',
            source: {
                type: 'initial-sql-script',
                source: {
                    type: 'inline',
                    content: `-- eskuel:system=sqlite\n-- eskuel:systemMinVersion=3.0.0\n-- ${'x'.repeat(2_000)}\nCREATE TABLE example (id INTEGER);`,
                },
            },
        }));
        await vi.waitFor(() => expect(estimate.element().textContent).not.toBe(imageEstimate));
    });

    it('refuses to save a game exceeding the configured complete-file limit', async () => {
        const saveFilePicker = vi.fn<GameSaveFilePicker>();
        const screen = renderGameEditorSession(
            createSimpleEditorSession(),
            saveFilePicker,
            { maxGameFileBytes: 1 },
        );

        await screen.getByRole('button', { name: 'Menu' }).click();
        await screen.getByRole('button', { name: 'Save game' }).click();

        await expect.element(screen.getByText(
            /^The game file is .+; maximum 1 B\. Reduce images or database content before saving or exporting\.$/u,
        )).toBeVisible();
        expect(saveFilePicker).not.toHaveBeenCalled();
    });

    it('edits task ordinary hints and exposes their read-only scene summary', async () => {
        const session = createWebBrowserGameEditorSession('hint-game', {
            type: 'object',
            source: new Game('Ordinary Hint Game', '', '', null, [{
                type: 'select',
                text: 'Task with ordinary hints',
                sqlSol: 'SELECT 1',
                sqlPlaceholder: '',
                ordinaryHints: [
                    { type: 'text', text: 'Initial clue' },
                    { type: 'expected-result' },
                ],
                hasSolHint: true,
                isRowOrderRelevant: false,
                isColOrderRelevant: false,
                areColNamesRelevant: false,
            }]),
        });
        const screen = renderGameEditorSession(session);
        const scenesPanel = screen.getByTestId('game-editor-scenes-panel');
        const taskSceneText = scenesPanel.getByText('Task with ordinary hints', { exact: true });
        await expect.element(taskSceneText).toBeVisible();
        const taskSceneElement = taskSceneText
            .element()
            .closest('[data-rfd-draggable-id]');
        expect(taskSceneElement).not.toBeNull();
        const taskScene = page.elementLocator(taskSceneElement!);
        const solutionHintSummary = taskScene.getByText('Apply sample solution', { exact: true });

        await expect.element(taskScene.getByText('Initial clue', { exact: true })).toBeVisible();
        await expect.element(taskScene.getByText('Show expected result', { exact: true })).toBeVisible();
        await expect.element(solutionHintSummary).toBeVisible();
        await expect.element(taskScene.getByRole('checkbox', { name: 'Apply sample solution' })).not.toBeInTheDocument();

        await taskScene.getByRole('button', { name: 'Edit scene', exact: true }).click();
        const dialog = screen.getByRole('dialog');
        const ordinaryTextHints = dialog.getByRole('textbox', { name: 'Text hint' });
        await expect.element(ordinaryTextHints.first()).toHaveValue('Initial clue');
        await expect.element(dialog.getByRole('button', { name: 'Expected result' })).not.toBeInTheDocument();
        await expect.element(dialog.getByRole('button', { name: 'Sample solution' })).not.toBeInTheDocument();
        await expect.element(dialog.getByLabelText('Reorder hint').nth(1)).toBeVisible();
        await expect.element(dialog.getByLabelText('Reorder hint').nth(2)).not.toBeInTheDocument();

        await ordinaryTextHints.first().fill('Edited clue');
        await dialog.getByRole('button', { name: 'Delete hint' }).nth(1).click();
        const addExpectedResultOrdinaryHint = dialog.getByRole('button', { name: 'Expected result' });
        await expect.element(addExpectedResultOrdinaryHint).toBeVisible();
        await addExpectedResultOrdinaryHint.click();
        await expect.element(addExpectedResultOrdinaryHint).not.toBeInTheDocument();
        await dialog.getByRole('button', { name: 'Text' }).click();
        await dialog.getByRole('textbox', { name: 'Text hint' }).nth(1).fill('Second clue');
        await dialog.getByRole('button', { name: 'Delete hint' }).nth(3).click();
        const addSolutionHint = dialog.getByRole('button', { name: 'Sample solution' });
        await expect.element(addSolutionHint).toBeVisible();
        await addSolutionHint.click();
        await expect.element(addSolutionHint).not.toBeInTheDocument();
        await dialog.getByRole('button', { name: 'Delete hint' }).nth(3).click();
        await expect.element(addSolutionHint).toBeVisible();
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();

        await expect.element(dialog).not.toBeInTheDocument();
        await expect.element(taskScene.getByText('Edited clue', { exact: true })).toBeVisible();
        await expect.element(taskScene.getByText('Second clue', { exact: true })).toBeVisible();
        await expect.element(taskScene.getByText('Show expected result', { exact: true })).toBeVisible();
        await expect.element(solutionHintSummary).not.toBeInTheDocument();

        await scenesPanel.getByRole('button', { name: 'Undo' }).click();
        await expect.element(taskScene.getByText('Initial clue', { exact: true })).toBeVisible();
        await expect.element(taskScene.getByText('Edited clue', { exact: true })).not.toBeInTheDocument();
        await expect.element(solutionHintSummary).toBeVisible();
    });

    it('hides the read-only hints section when a task has no hints', async () => {
        const session = createWebBrowserGameEditorSession('hintless-game', {
            type: 'object',
            source: new Game('Hintless Game', '', '', null, [{
                type: 'select',
                text: 'Task without hints',
                sqlSol: 'SELECT 1',
                sqlPlaceholder: '',
                ordinaryHints: [],
                hasSolHint: false,
                isRowOrderRelevant: false,
                isColOrderRelevant: false,
                areColNamesRelevant: false,
            }]),
        });
        const screen = renderGameEditorSession(session);
        const scenesPanel = screen.getByTestId('game-editor-scenes-panel');
        const taskSceneText = scenesPanel.getByText('Task without hints', { exact: true });
        await expect.element(taskSceneText).toBeVisible();
        const taskSceneElement = taskSceneText
            .element()
            .closest('[data-rfd-draggable-id]');
        expect(taskSceneElement).not.toBeNull();
        const taskScene = page.elementLocator(taskSceneElement!);

        await expect.element(taskScene.getByText('Hints', { exact: true })).not.toBeInTheDocument();
    });

    it('generates a document filename from a new game title', async () => {
        const screen = renderGameEditor();

        await screen.getByRole('button', { name: 'Menu' }).click();
        await screen.getByRole('button', { name: 'New game' }).click();
        const dialog = screen.getByRole('dialog');
        await dialog.getByLabelText('Game title:').fill('Mein Spiel');
        await dialog.getByRole('button', { name: 'Create' }).click();

        await expect.element(
            screen.getByTestId('game-editor-session-tab').filter({ hasText: 'mein_spiel.xml' }),
        ).toBeVisible();
        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Mein Spiel');
    });

    it('closes an unchanged editor tab without confirmation', async () => {
        const screen = renderGameEditor();
        const tab = screen.getByTestId('game-editor-session-tab').filter({ hasText: 'integration-game' });
        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Integration Game');

        clickEditorTabCloseButton(tab);

        await expect.element(tab).not.toBeInTheDocument();
        await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
    });

    it('confirms before discarding a changed editor tab', async () => {
        const session = createSimpleEditorSession();
        const screen = renderGameEditorSession(session);
        const tab = screen.getByTestId('game-editor-session-tab').filter({ hasText: 'integration-game' });
        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Integration Game');
        await changeGameTitle(session, 'Changed Integration Game');

        clickEditorTabCloseButton(tab);

        const dialog = screen.getByRole('dialog');
        await expect.element(
            dialog.getByText('Do you want to export the changes made to integration-game?', { exact: true }),
        ).toBeVisible();
        await expect.element(dialog).toHaveTextContent(
            'Your changes will be lost if you close the game without exporting it.',
        );
        await expect.element(dialog.getByRole('button', { name: 'Close without exporting' })).toBeVisible();
        await expect.element(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
        await expect.element(dialog.getByRole('button', { name: 'Export', exact: true })).toBeVisible();

        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect.element(tab).toBeInTheDocument();
        await expect.element(dialog).not.toBeInTheDocument();

        clickEditorTabCloseButton(tab);
        await screen.getByRole('dialog').getByRole('button', { name: 'Close without exporting' }).click();

        await expect.element(tab).not.toBeInTheDocument();
    });

    it('keeps the dirty tab indicator through undo and clears it after export', async () => {
        const linkClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        const session = createSimpleEditorSession();
        const screen = renderGameEditorSession(session);
        const tab = screen.getByTestId('game-editor-session-tab').filter({ hasText: 'integration-game' });
        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Integration Game');

        await Effect.runPromise(session.dispatch({
            type: 'update-scene',
            index: 0,
            scene: { type: 'text', text: 'Changed introduction' },
        }));
        await expect.element(tab.getByText('Unsaved changes', { exact: true })).toBeInTheDocument();

        await Effect.runPromise(session.undoSceneCommand());
        await expect.element(tab.getByText('Unsaved changes', { exact: true })).toBeInTheDocument();

        clickEditorTabCloseButton(tab);
        await expect.element(screen.getByRole('dialog')).toBeVisible();
        await screen.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

        await screen.getByRole('button', { name: 'Menu' }).click();
        await screen.getByRole('button', { name: 'Export game file' }).click();

        await vi.waitFor(() => expect(linkClick).toHaveBeenCalledOnce());
        await expect.element(tab.getByText('Unsaved changes', { exact: true })).not.toBeInTheDocument();
    });

    it('exports an editor tab before closing it when direct saving is unavailable', async () => {
        const linkClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        const session = createSimpleEditorSession();
        const screen = renderGameEditorSession(session);
        const tab = screen.getByTestId('game-editor-session-tab').filter({ hasText: 'integration-game' });
        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Integration Game');
        await changeGameTitle(session, 'Changed Integration Game');

        clickEditorTabCloseButton(tab);
        await screen.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click();

        expect(linkClick).toHaveBeenCalledOnce();
        await expect.element(tab).not.toBeInTheDocument();
    });

    it('changes the export filename without changing the game title', async () => {
        const exportedFilenames: string[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            exportedFilenames.push(this.download);
        });
        const screen = renderGameEditor();

        await screen.getByRole('button', { name: 'Menu' }).click();
        await screen.getByRole('button', { name: 'Export options' }).click();
        await screen.getByText('Change filename…', { exact: true }).click();
        const dialog = screen.getByRole('dialog');
        const filenameInput = dialog.getByLabelText('Filename');
        const changeButton = dialog.getByRole('button', { name: 'Change', exact: true });
        await expect.element(filenameInput).toHaveValue('integration-game');
        await expect.element(changeButton).toBeDisabled();
        await expect.element(dialog.getByText('The filename must end in .xml.', { exact: true })).toBeVisible();
        await filenameInput.fill('renamed_game');
        await expect.element(changeButton).toBeDisabled();
        await filenameInput.fill('.xml');
        await expect.element(changeButton).toBeDisabled();
        await filenameInput.fill('cancelled_name.XML');
        await expect.element(changeButton).toBeEnabled();
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect.element(
            screen.getByTestId('game-editor-session-tab').filter({ hasText: 'integration-game' }),
        ).toBeVisible();

        await screen.getByRole('button', { name: 'Export options' }).click();
        await screen.getByText('Change filename…', { exact: true }).click();
        const reopenedDialog = screen.getByRole('dialog');
        const reopenedFilenameInput = reopenedDialog.getByLabelText('Filename');
        const reopenedChangeButton = reopenedDialog.getByRole('button', { name: 'Change', exact: true });
        await expect.element(reopenedFilenameInput).toHaveValue('integration-game');
        await reopenedFilenameInput.fill('renamed_game.XML');
        await expect.element(reopenedChangeButton).toBeEnabled();
        await reopenedChangeButton.click();

        await expect.element(reopenedDialog).not.toBeInTheDocument();
        await expect.element(
            screen.getByTestId('game-editor-session-tab').filter({ hasText: 'renamed_game.XML' }),
        ).toBeVisible();
        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Integration Game');

        await screen.getByRole('button', { name: 'Export game file' }).click();
        expect(exportedFilenames).toEqual(['renamed_game.XML']);
    });

    it('preserves an extensionless filename and retains the selected file handle for direct saves', async () => {
        const write = vi.fn(async () => undefined);
        const close = vi.fn(async () => undefined);
        const saveFilePicker = vi.fn<GameSaveFilePicker>(async () => ({
            name: 'chosen-name.xml',
            createWritable: async () => ({ write, close }),
        }));
        const session = createWebBrowserGameEditorSession('integration-game', {
            type: 'object',
            source: new Game(
                'Integration Game',
                'Integration teaser',
                'Integration copyright',
                null,
                [{ type: 'text', text: 'Introduction' }],
            ),
        });
        const screen = renderGameEditorSession(session, saveFilePicker);
        const saveButton = screen.getByRole('button', { name: 'Save game' });

        await screen.getByRole('button', { name: 'Menu' }).click();
        await saveButton.click();
        await vi.waitFor(() => {
            expect(write).toHaveBeenCalledTimes(1);
            expect(close).toHaveBeenCalledTimes(1);
        });
        expect(saveFilePicker).toHaveBeenCalledWith(expect.objectContaining({
            suggestedName: 'integration-game',
        }));
        await expect.element(
            screen.getByTestId('game-editor-session-tab').filter({ hasText: 'chosen-name.xml' }),
        ).toBeVisible();
        await expect.element(screen.getByText('Saved as chosen-name.xml.')).toBeVisible();

        await saveButton.click();
        await vi.waitFor(() => {
            expect(write).toHaveBeenCalledTimes(2);
            expect(close).toHaveBeenCalledTimes(2);
        });
        expect(saveFilePicker).toHaveBeenCalledTimes(1);
        await expect.element(screen.getByText('Saved chosen-name.xml.')).toBeVisible();
    });

    it('selects a new file with Save as and uses it for subsequent saves', async () => {
        const firstWrite = vi.fn(async () => undefined);
        const firstClose = vi.fn(async () => undefined);
        const secondWrite = vi.fn(async () => undefined);
        const secondClose = vi.fn(async () => undefined);
        const saveFilePicker = vi.fn<GameSaveFilePicker>()
            .mockResolvedValueOnce({
                name: 'first-name.xml',
                createWritable: async () => ({ write: firstWrite, close: firstClose }),
            })
            .mockResolvedValueOnce({
                name: 'second-name.xml',
                createWritable: async () => ({ write: secondWrite, close: secondClose }),
            });
        const session = createWebBrowserGameEditorSession('integration-game', {
            type: 'object',
            source: new Game(
                'Integration Game',
                'Integration teaser',
                'Integration copyright',
                null,
                [{ type: 'text', text: 'Introduction' }],
            ),
        });
        const screen = renderGameEditorSession(session, saveFilePicker);
        const saveButton = screen.getByRole('button', { name: 'Save game' });

        await screen.getByRole('button', { name: 'Menu' }).click();
        await saveButton.click();
        await vi.waitFor(() => expect(firstWrite).toHaveBeenCalledOnce());

        await screen.getByRole('button', { name: 'Save options' }).click();
        await screen.getByText('Save as…', { exact: true }).click();
        await vi.waitFor(() => expect(secondWrite).toHaveBeenCalledOnce());
        expect(saveFilePicker).toHaveBeenCalledTimes(2);
        await expect.element(
            screen.getByTestId('game-editor-session-tab').filter({ hasText: 'second-name.xml' }),
        ).toBeVisible();
        await expect.element(screen.getByText('Saved as second-name.xml.')).toBeVisible();

        await saveButton.click();
        await vi.waitFor(() => {
            expect(secondWrite).toHaveBeenCalledTimes(2);
            expect(secondClose).toHaveBeenCalledTimes(2);
        });
        expect(firstWrite).toHaveBeenCalledOnce();
        expect(firstClose).toHaveBeenCalledOnce();
        expect(saveFilePicker).toHaveBeenCalledTimes(2);
        await expect.element(screen.getByText('Saved second-name.xml.')).toBeVisible();
    });

    it('silently keeps the original filename when the first native save picker is cancelled', async () => {
        const cancellation = new DOMException('The user cancelled the picker', 'AbortError');
        const saveFilePicker = vi.fn<GameSaveFilePicker>(async () => {
            throw cancellation;
        });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const screen = renderGameEditorSession(createSimpleEditorSession(), saveFilePicker);

        await screen.getByRole('button', { name: 'Menu' }).click();
        await screen.getByRole('button', { name: 'Save game' }).click();
        await vi.waitFor(() => expect(saveFilePicker).toHaveBeenCalledOnce());

        await expect.element(
            screen.getByTestId('game-editor-session-tab').filter({ hasText: 'integration-game' }),
        ).toBeVisible();
        await expect.element(
            screen.getByText('The game file could not be saved. The local draft is still available.', { exact: true }),
        ).not.toBeInTheDocument();
        expect(consoleError).not.toHaveBeenCalled();
    });

    it('keeps the existing handle when Save as is cancelled', async () => {
        const firstWrite = vi.fn(async () => undefined);
        const firstClose = vi.fn(async () => undefined);
        const saveFilePicker = vi.fn<GameSaveFilePicker>()
            .mockResolvedValueOnce({
                name: 'working-name.xml',
                createWritable: async () => ({ write: firstWrite, close: firstClose }),
            })
            .mockRejectedValueOnce(new DOMException('The user cancelled the picker', 'AbortError'));
        const screen = renderGameEditorSession(createSimpleEditorSession(), saveFilePicker);
        const saveButton = screen.getByRole('button', { name: 'Save game' });

        await screen.getByRole('button', { name: 'Menu' }).click();
        await saveButton.click();
        await vi.waitFor(() => expect(firstWrite).toHaveBeenCalledOnce());

        await screen.getByRole('button', { name: 'Save options' }).click();
        await screen.getByText('Save as…', { exact: true }).click();
        await vi.waitFor(() => expect(saveFilePicker).toHaveBeenCalledTimes(2));
        await expect.element(
            screen.getByTestId('game-editor-session-tab').filter({ hasText: 'working-name.xml' }),
        ).toBeVisible();
        await expect.element(
            screen.getByText('The game file could not be saved. The local draft is still available.', { exact: true }),
        ).not.toBeInTheDocument();

        await expect.element(saveButton).toBeEnabled();
        await saveButton.click();
        await vi.waitFor(() => expect(firstWrite).toHaveBeenCalledTimes(2));
        expect(firstClose).toHaveBeenCalledTimes(2);
        expect(saveFilePicker).toHaveBeenCalledTimes(2);
    });

    it.each(['createWritable', 'write', 'close'] as const)(
        'reports a Save as %s failure and retains the existing handle',
        async failureStage => {
            const saveFailure = new Error(`${failureStage} failed`);
            const firstWrite = vi.fn(async () => undefined);
            const firstClose = vi.fn(async () => undefined);
            const failedWrite = vi.fn(async () => {
                if (failureStage === 'write') {
                    throw saveFailure;
                }
            });
            const failedClose = vi.fn(async () => {
                if (failureStage === 'close') {
                    throw saveFailure;
                }
            });
            const failedCreateWritable = vi.fn(async () => {
                if (failureStage === 'createWritable') {
                    throw saveFailure;
                }
                else {
                    return { write: failedWrite, close: failedClose };
                }
            });
            const saveFilePicker = vi.fn<GameSaveFilePicker>()
                .mockResolvedValueOnce({
                    name: 'working-name.xml',
                    createWritable: async () => ({ write: firstWrite, close: firstClose }),
                })
                .mockResolvedValueOnce({
                    name: 'failed-name.xml',
                    createWritable: failedCreateWritable,
                });
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const screen = renderGameEditorSession(createSimpleEditorSession(), saveFilePicker);
            const saveButton = screen.getByRole('button', { name: 'Save game' });

            await screen.getByRole('button', { name: 'Menu' }).click();
            await saveButton.click();
            await vi.waitFor(() => expect(firstWrite).toHaveBeenCalledOnce());

            await screen.getByRole('button', { name: 'Save options' }).click();
            await screen.getByText('Save as…', { exact: true }).click();
            await expect.element(
                screen.getByText('The game file could not be saved. The local draft is still available.', { exact: true }),
            ).toBeVisible();
            await expect.element(
                screen.getByTestId('game-editor-session-tab').filter({ hasText: 'working-name.xml' }),
            ).toBeVisible();

            await expect.element(saveButton).toBeEnabled();
            await saveButton.click();
            await vi.waitFor(() => expect(firstWrite).toHaveBeenCalledTimes(2));
            expect(firstClose).toHaveBeenCalledTimes(2);
            expect(saveFilePicker).toHaveBeenCalledTimes(2);
        },
    );

    it('saves a game successfully before closing its tab', async () => {
        const write = vi.fn(async () => undefined);
        const close = vi.fn(async () => undefined);
        const saveFilePicker = vi.fn<GameSaveFilePicker>(async () => ({
            name: 'closed-after-save.xml',
            createWritable: async () => ({ write, close }),
        }));
        const session = createSimpleEditorSession();
        const screen = renderGameEditorSession(session, saveFilePicker);
        const tab = screen.getByTestId('game-editor-session-tab').filter({ hasText: 'integration-game' });
        await expect.element(screen.getByLabelText('Name:')).toHaveValue('Integration Game');
        await changeGameTitle(session, 'Changed Integration Game');

        clickEditorTabCloseButton(tab);
        const dialog = screen.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();

        await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
        expect(close).toHaveBeenCalledOnce();
        await expect.element(dialog).not.toBeInTheDocument();
        await expect.element(tab).not.toBeInTheDocument();
    });

    it('keeps the close dialog and tab open when its native save picker is cancelled', async () => {
        const saveFilePicker = vi.fn<GameSaveFilePicker>(async () => {
            throw new DOMException('The user cancelled the picker', 'AbortError');
        });
        const session = createSimpleEditorSession();
        const screen = renderGameEditorSession(session, saveFilePicker);
        const tab = screen.getByTestId('game-editor-session-tab').filter({ hasText: 'integration-game' });
        await changeGameTitle(session, 'Changed Integration Game');

        clickEditorTabCloseButton(tab);
        const dialog = screen.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();
        await vi.waitFor(() => expect(saveFilePicker).toHaveBeenCalledOnce());

        await expect.element(dialog).toBeVisible();
        await expect.element(tab).toBeInTheDocument();
        await expect.element(
            screen.getByText('The game file could not be saved. The local draft is still available.', { exact: true }),
        ).not.toBeInTheDocument();
    });

    it('keeps the close dialog and tab open when writing the game file fails', async () => {
        const saveFailure = new Error('Writing failed');
        const saveFilePicker = vi.fn<GameSaveFilePicker>(async () => ({
            name: 'failed-close-save.xml',
            createWritable: async () => ({
                write: async () => {
                    throw saveFailure;
                },
                close: async () => undefined,
            }),
        }));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const session = createSimpleEditorSession();
        const screen = renderGameEditorSession(session, saveFilePicker);
        const tab = screen.getByTestId('game-editor-session-tab').filter({ hasText: 'integration-game' });
        await changeGameTitle(session, 'Changed Integration Game');

        clickEditorTabCloseButton(tab);
        const dialog = screen.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();

        await expect.element(
            screen.getByText('The game file could not be saved. The local draft is still available.', { exact: true }),
        ).toBeVisible();
        await expect.element(dialog).toBeVisible();
        await expect.element(tab).toBeInTheDocument();
    });

    it('tests a scene, exposes its result, and runs a SQL experiment', async () => {
        const screen = renderGameEditorSession(createWebBrowserGameEditorSession('testing-game', {
            type: 'object',
            source: createInventoryGame(),
        }));
        const scenesPanel = screen.getByTestId('game-editor-scenes-panel');
        const selectSceneText = scenesPanel.getByText('List every item', { exact: true });
        await expect.element(selectSceneText).toBeVisible();
        const selectSceneElement = selectSceneText
            .element()
            .closest('[data-rfd-draggable-id]');
        expect(selectSceneElement).not.toBeNull();
        const selectScene = page.elementLocator(selectSceneElement!);
        const status = selectScene.getByTestId('scene-test-status');

        await expect.element(status).toHaveAccessibleName('Test');
        await status.click();
        await expect.element(status).toHaveAccessibleName('Test status: Query returns a result');

        const resultsPanel = screen.getByTestId('game-editor-results-panel');
        const closeButtons = resultsPanel.getByRole('button', { name: 'Close' });
        await expect.element(resultsPanel).toBeVisible();
        await expect.element(closeButtons.first()).toBeVisible();
        await expect.element(closeButtons.nth(1)).not.toBeInTheDocument();

        await screen.getByText('Database/SQL console', { exact: true }).click();
        const sqlPanel = screen.getByTestId('game-editor-sql-panel');
        const sqlEditor = sqlPanel.getByRole('textbox', { name: 'Editor content' });
        await expect.element(sqlPanel).toBeVisible();
        await expect.element(sqlEditor).toHaveValue('SELECT name FROM items ORDER BY id');

        await screen.getByText('Scenes', { exact: true }).click();
        await status.click();
        await expect.element(resultsPanel).toBeVisible();
        await expect.element(closeButtons.nth(1)).toBeVisible();

        await selectScene.getByRole('button', { name: 'Test options' }).click();
        await selectScene.getByText('Test', { exact: true }).click();
        await expect.element(closeButtons.nth(2)).toBeVisible();

        await selectScene.getByRole('button', { name: 'Test options' }).click();
        await selectScene.getByText('Test up to here', { exact: true }).click();
        await expect.element(closeButtons.nth(3)).toBeVisible();

        await screen.getByText('Database/SQL console', { exact: true }).click();
        (sqlEditor.element() as HTMLTextAreaElement).focus();
        await userEvent.keyboard('{Control>}a{/Control}');
        await userEvent.type(sqlEditor, 'SELECT 1 AS experiment_value', { skipClick: true });
        await expect.element(sqlEditor).toHaveValue('SELECT 1 AS experiment_value');
        await sqlPanel.getByRole('button', { name: 'Execute' }).click();

        await expect.element(resultsPanel.getByRole('cell', { name: 'experiment_value' })).toBeVisible();
        await expect.element(closeButtons.nth(4)).toBeVisible();
        await expect.element(status).toHaveAccessibleName('Test status: Query returns a result');
    });
});

function makeFetchedGameCatalog(url: string): readonly GameCatalogEntry[] {
    return [{
        id: 'fetched-editor-game',
        localizations: {
            en: {
                title: 'Fetched Editor Game',
                files: [{ url, filename: 'editor-no-database.xml' }],
            },
        },
    }];
}

function mockCatalogFetch(url: string, content: string) {
    const originalFetch = globalThis.fetch.bind(globalThis);
    return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        if (fetchInputUrl(input) === url) {
            return Promise.resolve(new Response(content, {
                headers: { 'content-type': 'application/xml' },
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

function createRestoredDraft(
    id: string,
    filename: string,
    title: string,
    revision: number,
    sourceKey: string | null = null,
    dbData: Game['dbData'] = null,
): RestoredGameDocumentDraft {
    return {
        document: {
            id: makeGameDocumentID(id),
            filename,
            revision,
            sourceKey,
            savedGameFingerprint: null,
            game: new Game(title, '', '', dbData, [{ type: 'text', text: `${title} scene` }]),
        },
        sceneIds: [makeGameDocumentSceneID(`${id}-scene`)],
        updatedAt: revision,
    };
}

function createSimpleEditorSession(): GameEditorSession {
    return createWebBrowserGameEditorSession('integration-game', {
        type: 'object',
        source: new Game(
            'Integration Game',
            'Integration teaser',
            'Integration copyright',
            null,
            [{ type: 'text', text: 'Introduction' }],
        ),
    });
}

async function changeGameTitle(session: GameEditorSession, title: string): Promise<void> {
    const snapshot = session.getSnapshot();
    if (snapshot.kind !== 'ready') {
        await Effect.runPromise(session.resolve());
    }
    const readySnapshot = session.getSnapshot();
    if (readySnapshot.kind !== 'ready') {
        throw new Error('The game-editor session did not become ready');
    }
    await Effect.runPromise(session.dispatch({
        type: 'update-metadata',
        title,
        teaser: readySnapshot.document.game.teaser,
        copyright: readySnapshot.document.game.copyright,
    }));
}
