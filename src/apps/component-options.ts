import type { DatabaseCatalogEntry, GameCatalogEntry } from '../catalog';
import type { Language } from '../i18n/languages';

export type AppLink = {
    readonly title: string;
    readonly url: string;
};

export type LocalizedLink = Readonly<Record<Language, AppLink>>;

export type AppComponentOptions = {
    /** Starting interface language; overrides and updates the saved preference. */
    initialLanguage?: Language;
    /** Reports subsequent effective language changes, never initialization. */
    onLanguageChange?: (language: Language) => void;
    linksCenterLeft?: readonly LocalizedLink[];
    linksRight?: readonly LocalizedLink[];
};

export type BrowserAppOptions = AppComponentOptions & {
    databaseCatalog?: readonly DatabaseCatalogEntry[];
    initialDatabaseUrls?: readonly string[];
};

export type GameConsoleAppOptions = AppComponentOptions & {
    gameCatalog?: readonly GameCatalogEntry[];
    initialGameUrl?: string;
    initiallySkipFirstScenes?: number;
    persistGameProgress?: boolean;
};

export type GameEditorAppOptions = AppComponentOptions & {
    gameCatalog?: readonly GameCatalogEntry[];
    initialGameUrls?: readonly string[];
    persistGameDrafts?: boolean;
};
