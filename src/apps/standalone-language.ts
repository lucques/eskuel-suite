import i18n from '../i18n/i18n';
import { resolveSupportedLanguage, type Language } from '../i18n/languages';
import { defaultSettingsStore } from '../settings/store';

export function getStandaloneInitialLanguage(): Language {
    return defaultSettingsStore.getSnapshot().language
        ?? resolveSupportedLanguage(i18n.resolvedLanguage ?? i18n.language);
}
