import 'i18next';
import browser from './locales/browser/en.json';
import common from './locales/common/en.json';
import gameConsole from './locales/game-console/en.json';
import gameEditor from './locales/game-editor/en.json';

declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNS: 'common';
        resources: {
            browser: typeof browser;
            common: typeof common;
            'game-console': typeof gameConsole;
            'game-editor': typeof gameEditor;
        };
    }
}
