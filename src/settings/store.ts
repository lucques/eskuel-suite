import {
    DEFAULT_IMAGE_INPUT_RESOURCE_LIMITS,
    DEFAULT_IMAGE_RESOURCE_LIMITS,
} from '../game/image';
import { isSupportedLanguage } from '../i18n/languages';
import type { Language } from '../i18n/languages';

export type { Language } from '../i18n/languages';
export type ThemeMode = 'system' | 'light' | 'dark';

export type Settings = {
    language: Language | null;
    themeMode: ThemeMode;
    maxDatabaseFileBytes: number;
    maxDisplayedResultRowsPerTable: number;
    maxGameFileBytes: number;
    maxGamePackageBytes: number;
    maxImageFileBytes: number;
    maxImageWidth: number;
    maxImageHeight: number;
    maxImageInputFileBytes: number;
    maxImageInputPixels: number;
    maxFetchedSourceBytes: number;
    maxQueryResultRows: number;
    maxOpenDatabases: number;
};

export const defaultSettings: Settings = {
    language: null,
    themeMode: 'system',
    maxDatabaseFileBytes: 100 * 1024 * 1024,
    maxDisplayedResultRowsPerTable: 50,
    maxGameFileBytes: 20 * 1024 * 1024,
    maxGamePackageBytes: 128 * 1024 * 1024,
    maxImageFileBytes: DEFAULT_IMAGE_RESOURCE_LIMITS.maxImageFileBytes,
    maxImageWidth: DEFAULT_IMAGE_RESOURCE_LIMITS.maxImageWidth,
    maxImageHeight: DEFAULT_IMAGE_RESOURCE_LIMITS.maxImageHeight,
    maxImageInputFileBytes: DEFAULT_IMAGE_INPUT_RESOURCE_LIMITS.maxImageFileBytes,
    maxImageInputPixels: DEFAULT_IMAGE_INPUT_RESOURCE_LIMITS.maxImagePixels,
    maxFetchedSourceBytes: 128 * 1024 * 1024,
    maxQueryResultRows: 10_000,
    maxOpenDatabases: 5,
};

export type SettingsStore = {
    getSnapshot(): Settings;
    subscribe(listener: () => void): () => void;
    update(updates: Partial<Settings>): void;
};

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

type SubscribeToStorage = (
    listener: (key: string | null, newValue: string | null) => void,
) => () => void;

type SettingsStoreOptions = {
    storage?: SettingsStorage;
    subscribeToStorage?: SubscribeToStorage;
};

// Storage schema version. Increment for incompatible persisted-settings changes.
const settingsStorageKey = 'eskuel-suite:settings:v1';

function parseSettings(serialized: string | null): Settings {
    if (serialized === null) {
        return { ...defaultSettings };
    }

    try {
        const parsed: unknown = JSON.parse(serialized);
        if (typeof parsed !== 'object' || parsed === null) {
            return { ...defaultSettings };
        }

        return normalizeSettings(parsed, defaultSettings);
    }
    catch (error: unknown) {
        console.error('Failed to parse Eskuel Suite settings:', error);
        return { ...defaultSettings };
    }
}

function normalizeSettings(candidate: unknown, fallback: Settings): Settings {
    const values = typeof candidate === 'object' && candidate !== null
        ? candidate as Partial<Record<keyof Settings, unknown>>
        : {};
    const language = isSupportedLanguage(values.language) || values.language === null
        ? values.language
        : fallback.language;
    const legacyDarkMode = (values as Record<string, unknown>).darkMode;
    const themeMode = values.themeMode === 'system' || values.themeMode === 'light' || values.themeMode === 'dark'
        ? values.themeMode
        : typeof legacyDarkMode === 'boolean'
            ? legacyDarkMode ? 'dark' : 'light'
            : fallback.themeMode;

    return {
        language,
        themeMode,
        maxDatabaseFileBytes: positiveIntegerOr(values.maxDatabaseFileBytes, fallback.maxDatabaseFileBytes),
        maxDisplayedResultRowsPerTable: positiveIntegerOr(
            values.maxDisplayedResultRowsPerTable,
            fallback.maxDisplayedResultRowsPerTable,
        ),
        maxGameFileBytes: positiveIntegerOr(values.maxGameFileBytes, fallback.maxGameFileBytes),
        maxGamePackageBytes: positiveIntegerOr(values.maxGamePackageBytes, fallback.maxGamePackageBytes),
        maxImageFileBytes: positiveIntegerOr(values.maxImageFileBytes, fallback.maxImageFileBytes),
        maxImageWidth: positiveIntegerOr(values.maxImageWidth, fallback.maxImageWidth),
        maxImageHeight: positiveIntegerOr(values.maxImageHeight, fallback.maxImageHeight),
        maxImageInputFileBytes: positiveIntegerOr(
            values.maxImageInputFileBytes,
            fallback.maxImageInputFileBytes,
        ),
        maxImageInputPixels: positiveIntegerOr(values.maxImageInputPixels, fallback.maxImageInputPixels),
        maxFetchedSourceBytes: positiveIntegerOr(values.maxFetchedSourceBytes, fallback.maxFetchedSourceBytes),
        maxQueryResultRows: positiveIntegerOr(values.maxQueryResultRows, fallback.maxQueryResultRows),
        maxOpenDatabases: positiveIntegerOr(values.maxOpenDatabases, fallback.maxOpenDatabases),
    };
}

function positiveIntegerOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
        ? value
        : fallback;
}

function areSettingsEqual(a: Settings, b: Settings): boolean {
    return a.language === b.language
        && a.themeMode === b.themeMode
        && a.maxDatabaseFileBytes === b.maxDatabaseFileBytes
        && a.maxDisplayedResultRowsPerTable === b.maxDisplayedResultRowsPerTable
        && a.maxGameFileBytes === b.maxGameFileBytes
        && a.maxGamePackageBytes === b.maxGamePackageBytes
        && a.maxImageFileBytes === b.maxImageFileBytes
        && a.maxImageWidth === b.maxImageWidth
        && a.maxImageHeight === b.maxImageHeight
        && a.maxImageInputFileBytes === b.maxImageInputFileBytes
        && a.maxImageInputPixels === b.maxImageInputPixels
        && a.maxFetchedSourceBytes === b.maxFetchedSourceBytes
        && a.maxQueryResultRows === b.maxQueryResultRows
        && a.maxOpenDatabases === b.maxOpenDatabases;
}

export function createSettingsStore(options: SettingsStoreOptions = {}): SettingsStore {
    const { storage, subscribeToStorage } = options;
    const listeners = new Set<() => void>();
    let settings = parseSettings(storage?.getItem(settingsStorageKey) ?? null);

    const publish = (nextSettings: Settings) => {
        if (areSettingsEqual(settings, nextSettings)) {
            return;
        }

        settings = nextSettings;
        for (const listener of listeners) {
            listener();
        }
    };

    subscribeToStorage?.((key, newValue) => {
        if (key === settingsStorageKey || key === null) {
            publish(parseSettings(key === null ? null : newValue));
        }
    });

    return {
        getSnapshot: () => settings,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        update(updates) {
            const nextSettings = normalizeSettings(updates, settings);
            if (areSettingsEqual(settings, nextSettings)) {
                return;
            }

            try {
                storage?.setItem(settingsStorageKey, JSON.stringify(nextSettings));
            }
            catch (error: unknown) {
                console.error('Failed to persist Eskuel Suite settings:', error);
            }
            publish(nextSettings);
        },
    };
}

function createDefaultSettingsStore(): SettingsStore {
    if (typeof window === 'undefined') {
        return createSettingsStore();
    }

    try {
        return createSettingsStore({
            storage: window.localStorage,
            subscribeToStorage(listener) {
                const onStorage = (event: StorageEvent) => {
                    if (event.storageArea === window.localStorage) {
                        listener(event.key, event.newValue);
                    }
                };
                window.addEventListener('storage', onStorage);
                return () => {
                    window.removeEventListener('storage', onStorage);
                };
            },
        });
    }
    catch (error: unknown) {
        console.error('Failed to initialize persistent settings:', error);
        return createSettingsStore();
    }
}

export const defaultSettingsStore = createDefaultSettingsStore();
