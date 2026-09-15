import { createInstance } from 'i18next';
import { createRef } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import type { DatabaseCatalogEntry, GameCatalogEntry } from '../../src/catalog';
import { AppThemeScope } from '../../src/gui-helpers/app-theme/AppTheme';
import { OpenDbSourceModal, type OpenDbSourceHandle } from '../../src/gui-helpers/open-modal/OpenDbSourceModal';
import { OpenGameGameSourceModal, type OpenGameSourceHandle } from '../../src/gui-helpers/open-modal/OpenGameGameSourceModal';
import { SettingsContext } from '../../src/settings/context';
import { defaultSettings } from '../../src/settings/store';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: {
                common: {
                    close: 'Close',
                    error: 'Error',
                    file_read_error: 'The file could not be read. Please select it again.',
                    file_too_large: 'The file exceeds the {{limit}} MB limit.',
                    load: 'Load',
                    more_information: 'More information',
                    open: 'Open',
                    open_file: 'Open file',
                },
                button: {
                    open_database: 'Open database',
                },
                game_source: {
                    open_file_title: 'Open game file',
                    open_title: 'Open game',
                },
                catalog_source: {
                    load_database: 'Load database from catalog',
                    load_game: 'Load game from catalog',
                    select_file: 'Select file for {{title}}',
                },
            },
        },
        de: {
            common: {
                common: {
                    close: 'Schließen',
                    error: 'Fehler',
                    file_too_large: 'Die Datei überschreitet das Limit von {{limit}} MB.',
                    load: 'Laden',
                    more_information: 'Mehr Informationen',
                    open: 'Öffnen',
                    open_file: 'Datei öffnen',
                },
                button: {
                    open_database: 'Datenbank öffnen',
                },
                game_source: {
                    open_file_title: 'Spieldatei öffnen',
                    open_title: 'Spiel öffnen',
                },
                catalog_source: {
                    load_database: 'Datenbank aus Katalog laden',
                    load_game: 'Spiel aus Katalog laden',
                    select_file: 'Datei für {{title}} auswählen',
                },
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

afterEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage('en');
});

function renderGameSourceChooser(
    maxGameFileBytes = defaultSettings.maxGameFileBytes,
    gameCatalog: readonly GameCatalogEntry[] = [],
    maxGamePackageBytes = maxGameFileBytes,
) {
    const ref = createRef<OpenGameSourceHandle>();
    const onOpenFile = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SettingsContext.Provider value={{
                settings: {
                    ...defaultSettings,
                    maxGameFileBytes,
                    maxGamePackageBytes,
                },
                darkMode: false,
                updateSettings: vi.fn(),
            }}>
                <AppThemeScope theme='game-console'>
                    <button onClick={() => ref.current?.open()}>Open chooser</button>
                    <OpenGameGameSourceModal
                        ref={ref}
                        gameCatalog={gameCatalog}
                        onOpenFile={onOpenFile}
                    />
                </AppThemeScope>
            </SettingsContext.Provider>
        </I18nextProvider>,
    );
    return { onOpenFile, screen };
}

function renderDatabaseSourceChooser(databaseCatalog: readonly DatabaseCatalogEntry[]) {
    const ref = createRef<OpenDbSourceHandle>();
    const onOpenFile = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SettingsContext.Provider value={{
                settings: defaultSettings,
                darkMode: false,
                updateSettings: vi.fn(),
            }}>
                <AppThemeScope theme='browser'>
                    <button onClick={() => ref.current?.open()}>Open chooser</button>
                    <OpenDbSourceModal
                        ref={ref}
                        databaseCatalog={databaseCatalog}
                        onOpenFile={onOpenFile}
                    />
                </AppThemeScope>
            </SettingsContext.Provider>
        </I18nextProvider>,
    );
    return { onOpenFile, screen };
}

it('opens the native file input directly when no games are provided', async () => {
    const { screen } = renderGameSourceChooser();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const inputClick = vi.spyOn(input!, 'click').mockImplementation(() => undefined);

    await screen.getByRole('button', { name: 'Open chooser' }).click();

    expect(inputClick).toHaveBeenCalledOnce();
    await expect.element(screen.getByText('Open game', { exact: true })).not.toBeInTheDocument();
});

it('uses the complete local filename when opening a game', async () => {
    const { onOpenFile } = renderGameSourceChooser();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(['<game />'], 'local-game.xml', { type: 'application/xml' });
    Object.defineProperty(input!, 'files', { configurable: true, value: [file] });

    input!.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
        expect(onOpenFile).toHaveBeenCalledWith(expect.objectContaining({ filename: 'local-game.xml' }));
    });
});

it('reads a local Eskuel game package as binary data', async () => {
    const { onOpenFile } = renderGameSourceChooser();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'local-game.eskuelgame', {
        type: 'application/zip',
    });
    Object.defineProperty(input!, 'files', { configurable: true, value: [file] });

    input!.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
        expect(onOpenFile).toHaveBeenCalledWith({
            filename: 'local-game.eskuelgame',
            type: 'auto',
            source: {
                type: 'inline',
                content: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
            },
        });
    });
});

it('opens the source selection modal when games are provided', async () => {
    const { screen } = renderGameSourceChooser(
        defaultSettings.maxGameFileBytes,
        makeGameCatalog(),
    );

    await screen.getByRole('button', { name: 'Open chooser' }).click();

    await expect.element(screen.getByText('Open game', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('Catalog Game', { exact: true })).toBeVisible();
});

it('shows only the current-language catalog files and opens the first file', async () => {
    const { onOpenFile, screen } = renderGameSourceChooser(
        defaultSettings.maxGameFileBytes,
        makeGameCatalog(),
    );

    await screen.getByRole('button', { name: 'Open chooser' }).click();

    await expect.element(screen.getByText('Catalog Game', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('English catalog description.', { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText('Ada, Grace · v1 · 2024', { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByRole('link', { name: 'More information' })).toHaveAttribute(
        'href',
        '/en/games/catalog-game/',
    );
    await expect.element(screen.getByText('Katalogspiel', { exact: true })).not.toBeInTheDocument();

    await screen.getByRole('radio', { name: 'Catalog Game', exact: true }).click();
    await screen.getByRole('button', { name: 'Open', exact: true }).click();
    expect(onOpenFile).toHaveBeenCalledWith({
        filename: 'catalog-game.xml',
        type: 'auto',
        source: { type: 'fetch', url: '/catalog-game.xml' },
    });
});

it('presents two source types and reselects catalog opening when the catalog choice is selected', async () => {
    const { screen } = renderGameSourceChooser(
        defaultSettings.maxGameFileBytes,
        makeGameCatalog(),
    );

    await screen.getByRole('button', { name: 'Open chooser' }).click();
    const dialog = screen.getByRole('dialog').element();
    const catalogChoice = screen.getByRole('radio', { name: 'Catalog Game', exact: true });
    const fileSelect = screen.getByRole('combobox', { name: 'Select file for Catalog Game' });
    const openButton = screen.getByRole('button', { name: 'Open', exact: true });

    expect(dialog.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    await expect.element(catalogChoice).not.toBeChecked();
    await expect.element(screen.getByRole('radio', { name: 'Open game file' })).not.toBeChecked();
    await expect.element(fileSelect).toBeEnabled();
    await expect.element(openButton).toBeDisabled();

    await catalogChoice.click();

    await expect.element(catalogChoice).toBeChecked();
    await expect.element(openButton).toBeEnabled();

    await screen.getByRole('radio', { name: 'Open game file' }).click();

    await expect.element(catalogChoice).not.toBeChecked();
    await expect.element(screen.getByRole('radio', { name: 'Open game file' })).toBeChecked();
    await expect.element(fileSelect).toBeEnabled();
    await expect.element(openButton).toBeDisabled();

    await catalogChoice.click();

    await expect.element(catalogChoice).toBeChecked();
    await expect.element(screen.getByRole('radio', { name: 'Open game file' })).not.toBeChecked();
    await expect.element(openButton).toBeEnabled();
});

it('offers every current-language filename and opens the selected file', async () => {
    const { onOpenFile, screen } = renderGameSourceChooser(
        defaultSettings.maxGameFileBytes,
        makeGameCatalog(),
    );

    await screen.getByRole('button', { name: 'Open chooser' }).click();
    const fileSelect = screen.getByRole('combobox', { name: 'Select file for Catalog Game' }).element();

    expect(Array.from((fileSelect as HTMLSelectElement).options).map(option => option.text)).toEqual([
        'catalog-game.xml',
        'catalog-game-compact.xml',
    ]);
    (fileSelect as HTMLSelectElement).value = 'catalog-game/en/catalog-game-compact.xml';
    fileSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await screen.getByRole('button', { name: 'Open', exact: true }).click();

    expect(onOpenFile).toHaveBeenCalledWith({
        filename: 'catalog-game-compact.xml',
        type: 'auto',
        source: { type: 'fetch', url: '/catalog-game-compact.xml' },
    });
});

it('updates the offered game files when the application language changes', async () => {
    const { screen } = renderGameSourceChooser(
        defaultSettings.maxGameFileBytes,
        makeGameCatalog(),
    );

    await screen.getByRole('button', { name: 'Open chooser' }).click();
    await expect.element(screen.getByText('Catalog Game', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('Katalogspiel', { exact: true })).not.toBeInTheDocument();

    await i18n.changeLanguage('de');

    await expect.element(screen.getByText('Katalogspiel', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('Deutsche Katalogbeschreibung.', { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByRole('link', { name: 'Mehr Informationen' })).toHaveAttribute(
        'href',
        '/de/spiele/catalog-game/',
    );
    await expect.element(screen.getByText('Catalog Game', { exact: true })).not.toBeInTheDocument();
});

it('shows a database catalog entry and opens its file', async () => {
    const { onOpenFile, screen } = renderDatabaseSourceChooser(makeDatabaseCatalog());

    await screen.getByRole('button', { name: 'Open chooser' }).click();

    await expect.element(screen.getByText('Catalog Database', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('English database description.', { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText('Ada · v2 · 2025 · Corrected data', { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByRole('link', { name: 'More information' })).not.toBeInTheDocument();
    await expect.element(screen.getByText('Katalogdatenbank', { exact: true })).not.toBeInTheDocument();

    await screen.getByRole('radio', { name: 'Catalog Database', exact: true }).click();
    await screen.getByRole('button', { name: 'Open', exact: true }).click();
    expect(onOpenFile).toHaveBeenCalledWith({
        filename: 'catalog-database.sql',
        type: 'auto',
        source: { type: 'fetch', url: '/catalog-database.sql' },
    });
});

it('reads a local Eskuel database package as binary data', async () => {
    const { onOpenFile, screen } = renderDatabaseSourceChooser(makeDatabaseCatalog());
    await screen.getByRole('button', { name: 'Open chooser' }).click();
    await screen.getByRole('radio', { name: 'Open file' }).click();
    const fileInput = screen.getByRole('dialog').element().querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'database.eskueldb', {
        type: 'application/zip',
    });
    Object.defineProperty(fileInput!, 'files', { configurable: true, value: [file] });

    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));

    const openButton = screen.getByRole('button', { name: 'Open', exact: true });
    await expect.element(openButton).toBeEnabled();
    await openButton.click();
    expect(onOpenFile).toHaveBeenCalledWith({
        filename: 'database.eskueldb',
        type: 'auto',
        source: {
            type: 'inline',
            content: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        },
    });
});

it('rejects an oversized local file before converting its source', async () => {
    const maxGameFileBytes = 1024 * 1024;
    const { onOpenFile, screen } = renderGameSourceChooser(maxGameFileBytes, makeGameCatalog());

    await screen.getByRole('button', { name: 'Open chooser' }).click();
    const fileInput = screen.getByRole('dialog').element().querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const oversizedFile = new File(
        [new Uint8Array(maxGameFileBytes + 1)],
        'too-large.xml',
        { type: 'application/xml' },
    );
    Object.defineProperty(fileInput!, 'files', { configurable: true, value: [oversizedFile] });
    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));

    await expect.element(screen.getByText('The file exceeds the 1 MB limit.', { exact: true })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Open', exact: true })).toBeDisabled();
    expect(onOpenFile).not.toHaveBeenCalled();
});

it.each([
    { filename: 'game.eskuelgame', prefix: '<game />', packaged: false },
    { filename: 'game.xml', prefix: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), packaged: true },
])('checks the detected size limit before fully reading $filename', async ({ filename, prefix, packaged }) => {
    const megabyte = 1024 * 1024;
    const { onOpenFile, screen } = renderGameSourceChooser(
        packaged ? 2 * megabyte : megabyte,
        [],
        packaged ? megabyte : 2 * megabyte,
    );
    const file = new File([prefix, new Uint8Array(megabyte)], filename);
    const fullRead = vi.spyOn(file, 'arrayBuffer');

    selectLocalFile(file);

    await expect.element(screen.getByText('The file exceeds the 1 MB limit.', { exact: true })).toBeVisible();
    expect(fullRead).not.toHaveBeenCalled();
    expect(onOpenFile).not.toHaveBeenCalled();
});

for (const withCatalog of [false, true]) {
    const flow = withCatalog ? 'catalog dialog' : 'direct file picker';

    it.each(['game', 'game.txt'])(`opens %s for content detection through the ${flow}`, async filename => {
        const { onOpenFile, screen } = renderGameSourceChooser(
            defaultSettings.maxGameFileBytes,
            withCatalog ? makeGameCatalog() : [],
        );
        if (withCatalog) {
            await screen.getByRole('button', { name: 'Open chooser' }).click();
        }

        selectLocalFile(new File(['<game />'], filename, { type: 'application/octet-stream' }));
        if (withCatalog) {
            await screen.getByRole('button', { name: 'Open', exact: true }).click();
        }

        await vi.waitFor(() => {
            expect(onOpenFile).toHaveBeenCalledExactlyOnceWith({
                filename,
                type: 'auto',
                source: { type: 'inline', content: new TextEncoder().encode('<game />') },
            });
        });
    });

    it(`opens a database with an arbitrary filename through the ${flow}`, async () => {
        const { onOpenFile, screen } = renderDatabaseSourceChooser(withCatalog ? makeDatabaseCatalog() : []);
        if (withCatalog) {
            await screen.getByRole('button', { name: 'Open chooser' }).click();
        }

        selectLocalFile(new File(['SELECT 1;'], 'database.txt', { type: 'application/octet-stream' }));
        if (withCatalog) {
            await screen.getByRole('button', { name: 'Open', exact: true }).click();
        }

        await vi.waitFor(() => {
            expect(onOpenFile).toHaveBeenCalledExactlyOnceWith({
                filename: 'database.txt',
                type: 'auto',
                source: { type: 'inline', content: new TextEncoder().encode('SELECT 1;') },
            });
        });
    });

    it.each([
        { filename: 'game.xml', game: true },
        { filename: 'game.eskuelgame', game: true },
        { filename: 'database.sql', game: false },
        { filename: 'database.sqlite', game: false },
        { filename: 'database.eskueldb', game: false },
    ])(`reports read failures for $filename and allows retrying through the ${flow}`, async ({ filename, game }) => {
        const { onOpenFile, screen } = game
            ? renderGameSourceChooser(defaultSettings.maxGameFileBytes, withCatalog ? makeGameCatalog() : [])
            : renderDatabaseSourceChooser(withCatalog ? makeDatabaseCatalog() : []);
        if (withCatalog) {
            await screen.getByRole('button', { name: 'Open chooser' }).click();
        }
        const file = new File(['contents'], filename);
        vi.spyOn(file, 'arrayBuffer')
            .mockRejectedValueOnce(new DOMException('File is no longer accessible', 'NotReadableError'));

        selectLocalFile(file);

        const message = 'The file could not be read. Please select it again.';
        await expect.element(screen.getByText(message, { exact: true })).toBeVisible();
        expect(onOpenFile).not.toHaveBeenCalled();
        if (withCatalog) {
            await expect.element(screen.getByRole('button', { name: 'Open', exact: true })).toBeDisabled();
        }
        else {
            await screen.getByText('Close', { exact: true }).click();
        }

        selectLocalFile(file);
        if (withCatalog) {
            await screen.getByRole('button', { name: 'Open', exact: true }).click();
        }

        await vi.waitFor(() => {
            expect(onOpenFile).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ filename }));
        });
        await expect.element(screen.getByText(message, { exact: true })).not.toBeInTheDocument();
    });

    it(`ignores an earlier file read failure after selecting a new game through the ${flow}`, async () => {
        const { onOpenFile, screen } = renderGameSourceChooser(
            defaultSettings.maxGameFileBytes,
            withCatalog ? makeGameCatalog() : [],
        );
        if (withCatalog) {
            await screen.getByRole('button', { name: 'Open chooser' }).click();
        }
        const firstFile = new File(['<game />'], 'first.xml');
        let rejectRead!: (reason: unknown) => void;
        const pendingRead = new Promise<ArrayBuffer>((_resolve, reject) => {
            rejectRead = reject;
        });
        vi.spyOn(firstFile, 'arrayBuffer').mockReturnValue(pendingRead);

        selectLocalFile(firstFile);
        await vi.waitFor(() => expect(firstFile.arrayBuffer).toHaveBeenCalledOnce());
        selectLocalFile(new File(['<game />'], 'second.xml'));
        rejectRead(new DOMException('File is no longer accessible', 'NotReadableError'));
        await Promise.allSettled([pendingRead]);
        if (withCatalog) {
            await screen.getByRole('button', { name: 'Open', exact: true }).click();
        }

        await vi.waitFor(() => {
            expect(onOpenFile).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ filename: 'second.xml' }));
        });
        await expect.element(screen.getByText('The file could not be read. Please select it again.')).not.toBeInTheDocument();
    });
}

function selectLocalFile(file: File): void {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    Object.defineProperty(input!, 'files', { configurable: true, value: [file] });
    input!.dispatchEvent(new Event('change', { bubbles: true }));
}

for (const sourceType of ['game', 'database'] as const) {
    it(`submits the ${sourceType} chooser without navigation only when a source is selected`, async () => {
        const { onOpenFile, screen } = sourceType === 'game'
            ? renderGameSourceChooser(defaultSettings.maxGameFileBytes, makeGameCatalog())
            : renderDatabaseSourceChooser(makeDatabaseCatalog());

        await screen.getByRole('button', { name: 'Open chooser' }).click();
        const form = screen.getByRole('dialog').element().querySelector('form')!;
        const emptySubmit = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(emptySubmit);

        expect(emptySubmit.defaultPrevented).toBe(true);
        expect(onOpenFile).not.toHaveBeenCalled();
        await expect.element(screen.getByRole('dialog')).toBeVisible();

        await screen.getByRole('radio').first().click();
        const submit = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submit);

        expect(submit.defaultPrevented).toBe(true);
        expect(onOpenFile).toHaveBeenCalledOnce();
        await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
    });
}

function makeGameCatalog(): readonly GameCatalogEntry[] {
    return [{
        id: 'catalog-game',
        localizations: {
            en: {
                title: 'Catalog Game',
                pageUrl: '/en/games/catalog-game/',
                files: [
                    { url: '/catalog-game.xml', filename: 'catalog-game.xml' },
                    { url: '/catalog-game-compact.xml', filename: 'catalog-game-compact.xml' },
                ],
            },
            de: {
                title: 'Katalogspiel',
                pageUrl: '/de/spiele/catalog-game/',
                files: [{ url: '/katalogspiel.xml', filename: 'katalogspiel.xml' }],
            },
        },
    }];
}

function makeDatabaseCatalog(): readonly DatabaseCatalogEntry[] {
    return [{
        id: 'catalog-database',
        localizations: {
            en: {
                title: 'Catalog Database',
                files: [{ url: '/catalog-database.sql', filename: 'catalog-database.sql' }],
            },
            de: {
                title: 'Katalogdatenbank',
                files: [{ url: '/katalogdatenbank.sql', filename: 'katalogdatenbank.sql' }],
            },
        },
    }];
}
