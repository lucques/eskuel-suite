import browserDe from './locales/browser/de.json';
import browserEn from './locales/browser/en.json';
import commonDe from './locales/common/de.json';
import commonEn from './locales/common/en.json';
import gameConsoleDe from './locales/game-console/de.json';
import gameConsoleEn from './locales/game-console/en.json';
import gameEditorDe from './locales/game-editor/de.json';
import gameEditorEn from './locales/game-editor/en.json';
import type { Language } from './languages';

export const translationResources = {
    de: {
        browser: browserDe,
        common: commonDe,
        'game-console': gameConsoleDe,
        'game-editor': gameEditorDe,
    },
    en: {
        browser: browserEn,
        common: commonEn,
        'game-console': gameConsoleEn,
        'game-editor': gameEditorEn,
    },
} satisfies Record<Language, unknown>;
