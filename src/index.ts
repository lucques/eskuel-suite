// All of these components can be plugged directly into an HTML file.

export type {
    CatalogFile,
    CatalogLocalization,
    DatabaseCatalogEntry,
    GameCatalogEntry,
} from './catalog';
export { assertDatabaseCatalog, assertGameCatalog } from './catalog';
export type {
    AppLink,
    AppComponentOptions,
    BrowserAppOptions,
    GameConsoleAppOptions,
    GameEditorAppOptions,
    LocalizedLink,
} from './apps/component-options';
export { supportedLanguages } from './i18n/languages';
export type { Language } from './i18n/languages';
export { BrowserApp } from './apps/browser/component';
export { GameConsoleApp } from './apps/game-console/component';
export { GameEditorApp } from './apps/game-editor/component';
