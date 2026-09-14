import { describe, expect, it, vi } from 'vitest';

import { createSettingsStore, defaultSettings } from './store';

const settingsStorageKey = 'eskuel-suite:settings:v1';

function createMemoryStorage(initialValues: Record<string, string> = {}) {
    const values = new Map(Object.entries(initialValues));
    return {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, nextValue: string) => {
            values.set(key, nextValue);
        }),
    };
}

describe('settings store', () => {
    it('shares updates with all local subscribers and persists them', () => {
        const storage = createMemoryStorage();
        const store = createSettingsStore({ storage });
        const firstListener = vi.fn();
        const secondListener = vi.fn();
        store.subscribe(firstListener);
        store.subscribe(secondListener);

        store.update({ language: 'de' });

        expect(store.getSnapshot()).toEqual({ ...defaultSettings, language: 'de' });
        expect(firstListener).toHaveBeenCalledOnce();
        expect(secondListener).toHaveBeenCalledOnce();
        expect(storage.setItem).toHaveBeenCalledWith(settingsStorageKey, JSON.stringify({
            ...defaultSettings,
            language: 'de',
        }));
    });

    it('applies settings changes received from another browsing context', () => {
        let onStorage: ((key: string | null, newValue: string | null) => void) | undefined;
        const store = createSettingsStore({
            subscribeToStorage(listener) {
                onStorage = listener;
                return () => {};
            },
        });
        const listener = vi.fn();
        store.subscribe(listener);

        onStorage?.(settingsStorageKey, JSON.stringify({ language: 'en', themeMode: 'dark' }));

        expect(store.getSnapshot()).toEqual({ ...defaultSettings, language: 'en', themeMode: 'dark' });
        expect(listener).toHaveBeenCalledOnce();
    });

    it('loads persisted settings and fills missing values with defaults', () => {
        const storage = createMemoryStorage({
            [settingsStorageKey]: JSON.stringify({ themeMode: 'dark' }),
        });
        const store = createSettingsStore({ storage });

        expect(store.getSnapshot()).toEqual({ ...defaultSettings, themeMode: 'dark' });
    });

    it('migrates a persisted dark mode boolean to an explicit theme mode', () => {
        const storage = createMemoryStorage({
            [settingsStorageKey]: JSON.stringify({ darkMode: false }),
        });
        const store = createSettingsStore({ storage });

        expect(store.getSnapshot()).toEqual({ ...defaultSettings, themeMode: 'light' });
    });

    it('ignores invalid limits from persisted settings', () => {
        const storage = createMemoryStorage({
            [settingsStorageKey]: JSON.stringify({
                maxDatabaseFileBytes: -1,
                maxDisplayedResultRowsPerTable: 0,
                maxGamePackageBytes: 0,
                maxImageFileBytes: 0,
                maxImageWidth: -1,
                maxImageHeight: 0,
                maxImageInputFileBytes: 0,
                maxImageInputPixels: Number.NaN,
                maxQueryResultRows: 1.5,
                maxOpenDatabases: 0,
            }),
        });
        const store = createSettingsStore({ storage });

        expect(store.getSnapshot()).toEqual(defaultSettings);
    });

});
