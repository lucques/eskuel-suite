export const supportedLanguages = ['en', 'de'] as const;

export type Language = typeof supportedLanguages[number];

export const fallbackLanguage: Language = 'en';

export function isSupportedLanguage(candidate: unknown): candidate is Language {
    return supportedLanguages.some(language => language === candidate);
}

export function resolveSupportedLanguage(candidate: string | undefined): Language {
    const language = candidate?.split('-')[0];
    return isSupportedLanguage(language) ? language : fallbackLanguage;
}

export function getLanguageDisplayName(language: string, displayLanguage: string): string {
    return new Intl.DisplayNames([displayLanguage], { type: 'language' }).of(language) ?? language;
}
