import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { fallbackLanguage, supportedLanguages } from './languages';
import { translationResources } from './resources';

export const i18nReady = i18n
.use(LanguageDetector)
.use(initReactI18next)
.init({
    showSupportNotice: false,
    defaultNS: 'common',
    ns: ['common', 'browser', 'game-console', 'game-editor'],
    resources: translationResources,
    fallbackLng: fallbackLanguage,
    supportedLngs: supportedLanguages,

    detection: {
        order: ['navigator', 'htmlTag'],
        caches: [],
    },
    
    interpolation: {
        escapeValue: false, // react already escapes
    },
});

export default i18n;
