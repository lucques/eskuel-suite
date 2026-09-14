import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import i18n from '../i18n/i18n';
import { resolveSupportedLanguage, type Language } from '../i18n/languages';
import { SettingsContext, type SettingsContextValue } from './context';
import { defaultSettingsStore } from './store';
import type { SettingsStore, ThemeMode } from './store';

const systemDarkModeQuery = '(prefers-color-scheme: dark)';

function subscribeToSystemDarkMode(listener: () => void): () => void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
    }

    const mediaQuery = window.matchMedia(systemDarkModeQuery);
    mediaQuery.addEventListener('change', listener);
    return () => {
        mediaQuery.removeEventListener('change', listener);
    };
}

function getSystemDarkMode(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia(systemDarkModeQuery).matches;
}

function resolveDarkMode(themeMode: ThemeMode, systemDarkMode: boolean): boolean {
    switch (themeMode) {
        case 'system':
            return systemDarkMode;
        case 'light':
            return false;
        case 'dark':
            return true;
        default: { const _n: never = themeMode; return _n; }
    }
}

export function SettingsProvider({ children, store = defaultSettingsStore, onLanguageChange }: {
    children: React.ReactNode;
    store?: SettingsStore;
    onLanguageChange?: (language: Language) => void;
}) {
    const languageChangeCallback = useRef(onLanguageChange);
    languageChangeCallback.current = onLanguageChange;
    const settings = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot,
    );
    const systemDarkMode = useSyncExternalStore(
        subscribeToSystemDarkMode,
        getSystemDarkMode,
        () => false,
    );
    const darkMode = resolveDarkMode(settings.themeMode, systemDarkMode);


    ///////////////////////////////////
    // Gobally apply Bootstrap theme //
    ///////////////////////////////////

    useEffect(() => {
        document.documentElement.setAttribute(
            'data-bs-theme',
            darkMode ? 'dark' : 'light'
        );
    }, [darkMode]);


    //////////////////////////////////
    // Globally apply i18n language //
    //////////////////////////////////

    useEffect(() => {
        i18n.changeLanguage(settings.language ?? i18n.language);
    }, [settings.language]);

    useEffect(() => {
        let previousLanguage = resolveSupportedLanguage(i18n.resolvedLanguage ?? i18n.language);
        const onChanged = (languageTag: string) => {
            const language = resolveSupportedLanguage(languageTag);
            if (language !== previousLanguage) {
                previousLanguage = language;
                languageChangeCallback.current?.(language);
            }
        };
        i18n.on('languageChanged', onChanged);
        return () => {
            i18n.off('languageChanged', onChanged);
        };
    }, []);


    ////////////
    // Render //
    ////////////

    const contextValue = useMemo<SettingsContextValue>(() => ({
        settings,
        darkMode,
        updateSettings: store.update,
    }), [darkMode, settings, store]);

    return (
        <SettingsContext.Provider value={contextValue}>
            {children}
        </SettingsContext.Provider>
    );
}
