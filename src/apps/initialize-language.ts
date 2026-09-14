import i18n, { i18nReady } from '../i18n/i18n';
import { isSupportedLanguage, resolveSupportedLanguage, type Language } from '../i18n/languages';
import { defaultSettingsStore } from '../settings/store';

export async function initializeAppLanguage(initialLanguage?: Language): Promise<void> {
    if (initialLanguage !== undefined && !isSupportedLanguage(initialLanguage)) {
        throw new Error(`Unsupported initial language: ${initialLanguage}`);
    }
    else {
        await i18nReady;
        if (initialLanguage !== undefined) {
            defaultSettingsStore.update({ language: initialLanguage });
        }
        const language = defaultSettingsStore.getSnapshot().language
            ?? resolveSupportedLanguage(i18n.resolvedLanguage ?? i18n.language);
        await i18n.changeLanguage(language);
    }
}
