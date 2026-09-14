import 'bootstrap/dist/css/bootstrap.min.css';
import '../../../src/base.css';

import { page, userEvent } from '@vitest/browser/context';
import { createInstance } from 'i18next';
import { Effect } from 'effect';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { App } from '../../../src/apps/game-console/App';
import type { LocalizedLink } from '../../../src/apps/component-options';
import { createGameCheckpointStore } from '../../../src/apps/game-console/checkpoint';
import type { GameCheckpoint } from '../../../src/apps/game-console/checkpoint';
import { createInitialSceneStatuses } from '../../../src/apps/game-console/game-progress';
import { GameConsoleView } from '../../../src/apps/game-console/GameConsoleView';
import type { GameConsoleSession } from '../../../src/apps/game-console/session';
import type { GameCatalogEntry } from '../../../src/catalog';
import { GAME_FINGERPRINT_VERSION, fingerprintGame } from '../../../src/game/fingerprint';
import { loadGame } from '../../../src/game/loader';
import type { GameSource } from '../../../src/game/loader';
import { Game } from '../../../src/game/model';
import { domXmlParser } from '../../../src/game/xml/dom-parser';
import commonEnglish from '../../../src/i18n/locales/common/en.json';
import gameConsoleEnglish from '../../../src/i18n/locales/game-console/en.json';
import { createWebBrowserGameSession } from '../../../src/platform/webbrowser/create-game-session';
import { SettingsProvider } from '../../../src/settings/settings';
import { createSettingsStore } from '../../../src/settings/store';
import noDatabaseXml from '../fixtures/games/valid/no-database.xml?raw';

// This suite tests game-console application and persistence behavior, not Monaco
// itself. A real Monaco instance starts asynchronous word-highlighting work and
// reports its normal cancellation as an unhandled rejection when Vitest unmounts
// the application between tests. That makes the full suite fail even though the
// tested behavior succeeds. Use a textarea here that preserves the imperative
// SqlEditor handle contract and user input flow without Monaco's background work.
// Production E2E tests continue to exercise the application with real Monaco.
vi.mock('../../../src/gui-helpers/code-editor/SqlEditor', async () => {
    const React = await import('react');
    type MockSqlEditorHandle = {
        getValue(): string;
        setValue(value: string): void;
        setValueIfUninitialized(value: string): void;
        jumpTo(): void;
    };
    type MockSqlEditorProps = {
        initialValue?: string;
        value?: string;
        onChange?: (value: string) => void;
        onInput?: () => void;
        readOnly?: boolean;
    };
    return {
        SqlEditor: React.forwardRef<MockSqlEditorHandle, MockSqlEditorProps>(function MockSqlEditor(props, ref) {
            const [value, setValue] = React.useState(props.value ?? props.initialValue ?? '');
            const valueRef = React.useRef(value);
            const initializedRef = React.useRef(value !== '');
            const updateValue = (nextValue: string): void => {
                valueRef.current = nextValue;
                initializedRef.current = true;
                setValue(nextValue);
                props.onChange?.(nextValue);
            };
            React.useImperativeHandle(ref, () => ({
                getValue: () => valueRef.current,
                setValue: updateValue,
                setValueIfUninitialized(nextValue) {
                    if (!initializedRef.current) {
                        updateValue(nextValue);
                    }
                },
                jumpTo() {
                    return undefined;
                },
            }));
            return React.createElement('textarea', {
                'aria-label': 'Editor content',
                readOnly: props.readOnly,
                value,
                onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
                    updateValue(event.currentTarget.value);
                    props.onInput?.();
                },
            });
        }),
    };
});

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: commonEnglish,
            'game-console': gameConsoleEnglish,
        },
    },
    ns: ['common', 'game-console'],
    defaultNS: 'common',
    showSupportNotice: false,
});

const sessions: GameConsoleSession[] = [];

afterEach(() => {
    for (const session of sessions) {
        session.dispose();
    }
    sessions.length = 0;
    document.documentElement.removeAttribute('data-bs-theme');
    vi.restoreAllMocks();
});

describe('game console application session integration', () => {
    it('offers generic localized links in both navigation regions', async () => {
        const screen = renderGameConsoleApp(
            undefined,
            createGameCheckpointStore(createMemoryStorage()),
            false,
            [],
            {
                linksCenterLeft: [{
                    en: { title: 'Game shelf', url: '/en/games/' },
                    de: { title: 'Spieleregal', url: '/de/spiele/' },
                }],
                linksRight: [{
                    en: { title: 'Course overview', url: '/en/' },
                    de: { title: 'Kursübersicht', url: '/de/' },
                }],
            },
        );

        await screen.getByRole('button', { name: 'Menu' }).click();
        await expect.element(screen.getByRole('link', { name: 'Course overview' })).toHaveAttribute('href', '/en/');
        await expect.element(screen.getByRole('link', { name: 'Game shelf' })).toHaveAttribute('href', '/en/games/');
    });

    it('opens a catalog file and fetches it through the complete application flow', async () => {
        const catalogUrl = '/catalog/no-database.xml';
        const fetchSpy = mockCatalogFetch(catalogUrl, noDatabaseXml);
        const screen = renderGameConsoleApp(
            undefined,
            createGameCheckpointStore(createMemoryStorage()),
            false,
            makeFetchedGameCatalog(catalogUrl),
        );

        await screen.getByRole('button', { name: 'Menu' }).click();
        await screen.getByRole('button', { name: 'Open game', exact: true }).click();
        await screen.getByRole('radio', { name: 'Fetched Catalog Game', exact: true }).click();
        await screen.getByRole('button', { name: 'Open', exact: true }).click();

        await expect.element(screen.getByText('Select true', { exact: true })).toBeVisible();
        expect(fetchSpy.mock.calls.some(([input]) => fetchInputUrl(input) === catalogUrl)).toBe(true);
    });

    it('replaces the workbench with the game-loading failure', async () => {
        const session = createWebBrowserGameSession({
            type: 'xml',
            source: { type: 'inline', content: '<game></game>' },
        });
        sessions.push(session);
        const screen = render(
            <I18nextProvider i18n={i18n}>
                <SettingsProvider store={createSettingsStore()}>
                    <div style={{ width: '1200px', height: '800px' }}>
                        <GameConsoleView session={session} />
                    </div>
                </SettingsProvider>
            </I18nextProvider>,
        );

        const initializationView = screen.getByTestId('nonready-view');
        await expect.element(initializationView.getByRole('heading')).toHaveTextContent('Game file is invalid');
        await expect.element(initializationView).toHaveTextContent('The selected file does not contain a valid game.');
    });

    it('offers a matching object-game checkpoint after the game is opened', async () => {
        const game = createCheckpointGame();
        const gameFingerprint = await fingerprintGame(game);
        const checkpointStore = createGameCheckpointStore(createMemoryStorage());
        checkpointStore.save(checkpoint(game, gameFingerprint, { kind: 'object' }));
        const screen = renderGameConsoleApp(
            { type: 'object', source: game },
            checkpointStore,
        );

        await expect.element(page.getByText('Resume game?', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Resume' }).click();

        await expect.element(screen.getByText('Solve the task', { exact: true })).toBeVisible();
        await page.getByText('SQL', { exact: true }).click();
        await expect.element(page.getByRole('textbox', { name: 'Editor content' })).toBeVisible();
    });

    it('runs without checkpoint restoration when progress persistence is disabled', async () => {
        const game = createCheckpointGame();
        const gameFingerprint = await fingerprintGame(game);
        const storage = createMemoryStorage();
        const setItem = vi.spyOn(storage, 'setItem');
        const checkpointStore = createGameCheckpointStore(storage);
        checkpointStore.save(checkpoint(game, gameFingerprint, { kind: 'object' }));
        setItem.mockClear();
        const screen = renderGameConsoleApp(
            { type: 'object', source: game },
            checkpointStore,
            false,
        );

        await expect.element(screen.getByText('Introduction', { exact: true })).toBeVisible();
        await expect.element(page.getByText('Resume game?', { exact: true })).not.toBeInTheDocument();
        expect(checkpointStore.findByFingerprint(gameFingerprint)).not.toBeNull();

        await page.getByRole('button', { name: 'Next' }).first().click();
        await expect.element(screen.getByText('Solve the task', { exact: true })).toBeVisible();
        await Promise.resolve();
        expect(setItem).not.toHaveBeenCalled();
    });

    it('shows a sample solution through the complete game-console UI', async () => {
        const checkpointStore = createGameCheckpointStore(createMemoryStorage());
        const screen = renderGameConsoleApp(
            { type: 'object', source: createCheckpointGame() },
            checkpointStore,
        );

        await expect.element(screen.getByText('Introduction', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Next' }).first().click();
        await expect.element(screen.getByText('Solve the task', { exact: true })).toBeVisible();
        await page.getByText('SQL', { exact: true }).click();
        const editor = page.getByRole('textbox', { name: 'Editor content' });
        (editor.element() as HTMLTextAreaElement).focus();
        await userEvent.keyboard('{Control>}a{/Control}');
        await userEvent.type(editor, 'SELECT 1', { skipClick: true });
        await page.getByRole('button', { name: 'Execute' }).click();
        await expect.element(page.getByText('Solved!', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Previous' }).click();
        await page.getByText('Scene', { exact: true }).click();
        const sampleSolutionButton = page.getByRole('button', { name: 'Sample solution' });
        await expect.element(sampleSolutionButton).toBeVisible();
        await sampleSolutionButton.click();

        await page.getByText('Results', { exact: true }).click();
        await expect.element(page.getByText('Sample solution', { exact: true }).last()).toBeVisible();
    });

    it('reveals ordered ordinary hints, resets their sequence, and hides hints after finishing', async () => {
        const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
        const screen = renderGameConsoleApp(
            { type: 'object', source: createHintGame() },
            createGameCheckpointStore(createMemoryStorage()),
        );

        await expect.element(screen.getByText('Ordinary hint task', { exact: true })).toBeVisible();
        const firstOrdinaryHintButton = page.getByRole('button', { name: 'Hint (1/2)', exact: true });
        await expect.element(firstOrdinaryHintButton).toBeEnabled();
        await expect.element(page.getByRole('button', { name: 'Show solution' })).not.toBeInTheDocument();
        await expect.element(page.getByRole('button', { name: 'Reset hints' })).not.toBeInTheDocument();

        scrollIntoView.mockClear();
        await firstOrdinaryHintButton.click();
        await expect.element(screen.getByText('Read the answer column first.', { exact: true })).toBeVisible();
        await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }));
        await expect.element(page.getByRole('button', { name: 'Reset hints' })).toBeVisible();
        const secondOrdinaryHintButton = page.getByRole('button', { name: 'Hint (2/2)', exact: true });
        await expect.element(secondOrdinaryHintButton).toBeEnabled();

        await page.getByRole('button', { name: 'Reset hints' }).click();
        await expect.element(screen.getByText('Read the answer column first.', { exact: true })).not.toBeInTheDocument();
        await expect.element(firstOrdinaryHintButton).toBeEnabled();

        await firstOrdinaryHintButton.click();
        await expect.element(screen.getByText('Read the answer column first.', { exact: true })).toBeVisible();
        await secondOrdinaryHintButton.click();
        await expect.element(page.getByText('Hint: Expected result', { exact: true })).toBeVisible();
        await page.getByText('Scene', { exact: true }).click();
        await expect.element(page.getByRole('button', { name: 'Hint (2/2)', exact: true })).not.toBeInTheDocument();
        const showSolutionButton = page.getByRole('button', { name: 'Show solution' });
        await expect.element(showSolutionButton).toBeEnabled();

        await showSolutionButton.click();
        await expect.element(page.getByText('Solution hint', { exact: true })).toBeVisible();
        await expect.element(page.getByText('SELECT 42 AS answer', { exact: true })).toBeVisible();
        await page.getByText('Scene', { exact: true }).click();
        await expect.element(screen.getByText('Congratulations, you solved all 1 tasks.', { exact: true })).toBeVisible();
        await expect.element(screen.getByText('Read the answer column first.', { exact: true })).not.toBeInTheDocument();
        await expect.element(page.getByRole('button', { name: 'Show solution' })).not.toBeInTheDocument();
        await expect.element(page.getByRole('button', { name: 'Reset hints' })).not.toBeInTheDocument();

        await page.getByText('Results', { exact: true }).click();
        await expect.element(page.getByText('Hint: Expected result', { exact: true })).toBeVisible();
        await expect.element(page.getByText('Solution hint', { exact: true })).toBeVisible();
    });

    it('hides revealed hints and hint controls after skipping the final scene', async () => {
        const screen = renderGameConsoleApp(
            { type: 'object', source: createHintGame() },
            createGameCheckpointStore(createMemoryStorage()),
        );

        await page.getByRole('button', { name: 'Hint (1/2)', exact: true }).click();
        await expect.element(screen.getByText('Read the answer column first.', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Skip', exact: true }).click();

        await expect.element(screen.getByText('Game finished! You solved 0 of 1 tasks.', { exact: true })).toBeVisible();
        await expect.element(screen.getByText('Read the answer column first.', { exact: true })).not.toBeInTheDocument();
        await expect.element(page.getByRole('button', { name: 'Hint (2/2)', exact: true })).not.toBeInTheDocument();
        await expect.element(page.getByRole('button', { name: 'Show solution' })).not.toBeInTheDocument();
        await expect.element(page.getByRole('button', { name: 'Reset hints' })).not.toBeInTheDocument();
    });

    it('keeps a lone expected-result hint repeatable without offering reset', async () => {
        const screen = renderGameConsoleApp(
            { type: 'object', source: createRepeatableExpectedResultHintGame() },
            createGameCheckpointStore(createMemoryStorage()),
        );
        const hintButton = page.getByRole('button', { name: 'Hint', exact: true });

        await expect.element(hintButton).toBeEnabled();
        await expect.element(page.getByRole('button', { name: 'Reset hint' })).not.toBeInTheDocument();

        await hintButton.click();
        await expect.element(screen.getByText('Hint: Expected result', { exact: true })).toBeVisible();
        await page.getByText('Scene', { exact: true }).click();
        await expect.element(hintButton).toBeEnabled();
        await expect.element(page.getByRole('button', { name: 'Reset hint' })).not.toBeInTheDocument();

        await hintButton.click();
        await vi.waitFor(() => {
            expect(page.getByText('Hint: Expected result', { exact: true }).elements()).toHaveLength(2);
        });
        await page.getByText('Scene', { exact: true }).click();
        await expect.element(hintButton).toBeEnabled();
        await expect.element(page.getByRole('button', { name: 'Reset hint' })).not.toBeInTheDocument();
    });

    it('starts over from the checkpoint prompt and removes the saved progress', async () => {
        const game = createCheckpointGame();
        const gameFingerprint = await fingerprintGame(game);
        const checkpointStore = createGameCheckpointStore(createMemoryStorage());
        checkpointStore.save(checkpoint(game, gameFingerprint, { kind: 'object' }));
        const screen = renderGameConsoleApp(
            { type: 'object', source: game },
            checkpointStore,
        );

        await expect.element(page.getByText('Resume game?', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Start over' }).click();

        await expect.element(page.getByText('Resume game?', { exact: true })).not.toBeInTheDocument();
        await expect.element(screen.getByText('Introduction', { exact: true })).toBeVisible();
        expect(checkpointStore.findByFingerprint(gameFingerprint)).toBeNull();
    });

    it('removes a matching checkpoint whose progress is incompatible with the game', async () => {
        const game = createCheckpointGame();
        const gameFingerprint = await fingerprintGame(game);
        const checkpointStore = createGameCheckpointStore(createMemoryStorage());
        const incompatibleCheckpoint = checkpoint(game, gameFingerprint, { kind: 'object' });
        incompatibleCheckpoint.progress.sceneStatuses[0] = 'task-unsolved';
        checkpointStore.save(incompatibleCheckpoint);
        const screen = renderGameConsoleApp(
            { type: 'object', source: game },
            checkpointStore,
        );

        await expect.element(screen.getByText('Introduction', { exact: true })).toBeVisible();
        await expect.element(page.getByText('Resume game?', { exact: true })).not.toBeInTheDocument();
        await expect.poll(() => checkpointStore.findByFingerprint(gameFingerprint)).toBeNull();
    });

    it('does not offer the latest URL-backed checkpoint when no game is opened', async () => {
        const gameUrl = new URL('/tests/integration/fixtures/games/valid/minimal-select.xml', window.location.href).href;
        const source: GameSource = { type: 'xml', source: { type: 'fetch', url: gameUrl } };
        const game = await Effect.runPromise(loadGame(source, domXmlParser));
        const gameFingerprint = await fingerprintGame(game);
        const checkpointStore = createGameCheckpointStore(createMemoryStorage());
        checkpointStore.save(checkpoint(game, gameFingerprint, { kind: 'url', url: gameUrl }));
        renderGameConsoleApp(undefined, checkpointStore);

        await expect.element(page.getByText('No game is currently open.', { exact: true })).toBeVisible();
        await expect.element(page.getByText('Resume game?', { exact: true })).not.toBeInTheDocument();
    });

    it('persists progress changes and removes the checkpoint on restart', async () => {
        const checkpointStore = createGameCheckpointStore(createMemoryStorage());
        const screen = renderGameConsoleApp(
            { type: 'object', source: createCheckpointGame() },
            checkpointStore,
        );

        await expect.element(screen.getByText('Introduction', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Next' }).first().click();
        await expect.poll(() => checkpointStore.getLastCheckpoint()?.progress.curSceneIndex).toBe(1);

        await page.getByRole('button', { name: 'Restart' }).click();
        await expect.poll(() => checkpointStore.getLastCheckpoint()).toBeNull();
    });

});

function renderGameConsoleApp(
    source: GameSource | undefined,
    checkpointStore: ReturnType<typeof createGameCheckpointStore>,
    persistGameProgress: boolean = true,
    gameCatalog: readonly GameCatalogEntry[] = [],
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
                        gameCatalog={gameCatalog}
                        initialFileSource={source === undefined ? undefined : { ...source, filename: 'game' }}
                        linksCenterLeft={navigation.linksCenterLeft}
                        linksRight={navigation.linksRight}
                        checkpointStore={checkpointStore}
                        persistGameProgress={persistGameProgress}
                    />
                </div>
            </SettingsProvider>
        </I18nextProvider>,
    );
}

function makeFetchedGameCatalog(url: string): readonly GameCatalogEntry[] {
    return [{
        id: 'fetched-game',
        localizations: {
            en: {
                title: 'Fetched Catalog Game',
                files: [{ url, filename: 'no-database.xml' }],
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

function createCheckpointGame(): Game {
    return new Game('Checkpoint Game', '', '', null, [
        { type: 'text', text: 'Introduction' },
        {
            type: 'select',
            text: 'Solve the task',
            sqlSol: 'SELECT 1',
            sqlPlaceholder: 'SELECT',
            ordinaryHints: [],
            hasSolHint: false,
            isRowOrderRelevant: true,
            isColOrderRelevant: true,
            areColNamesRelevant: true,
        },
        { type: 'text', text: 'Finished' },
    ]);
}

function createHintGame(): Game {
    return new Game('Ordinary Hint Game', '', '', null, [{
        type: 'select',
        text: 'Ordinary hint task',
        sqlSol: 'SELECT 42 AS answer',
        sqlPlaceholder: 'SELECT',
        ordinaryHints: [
            { type: 'text', text: 'Read the answer column first.' },
            { type: 'expected-result' },
        ],
        hasSolHint: true,
        isRowOrderRelevant: true,
        isColOrderRelevant: true,
        areColNamesRelevant: true,
    }]);
}

function createRepeatableExpectedResultHintGame(): Game {
    return new Game('Repeatable Expected Result Hint Game', '', '', null, [{
        type: 'select',
        text: 'Repeatable expected-result hint task',
        sqlSol: 'SELECT 42 AS answer',
        sqlPlaceholder: 'SELECT',
        ordinaryHints: [{ type: 'expected-result' }],
        hasSolHint: false,
        isRowOrderRelevant: true,
        isColOrderRelevant: true,
        areColNamesRelevant: true,
    }]);
}

function checkpoint(
    game: Game,
    gameFingerprint: string,
    gameLocator: GameCheckpoint['gameLocator'],
): GameCheckpoint {
    const sceneStatuses = createInitialSceneStatuses(game);
    sceneStatuses[0] = 'nontask-seen';
    return {
        checkpointVersion: 1,
        fingerprintVersion: GAME_FINGERPRINT_VERSION,
        gameFingerprint,
        gameLocator,
        gameTitle: game.title,
        progress: {
            curSceneIndex: 1,
            sceneStatuses,
        },
        updatedAt: Date.now(),
    };
}

function createMemoryStorage() {
    const values = new Map<string, string>();
    return {
        getItem(key: string) {
            return values.get(key) ?? null;
        },
        setItem(key: string, value: string) {
            values.set(key, value);
        },
    };
}
