import { resolveSupportedLanguage } from '../i18n/languages';
import type { AppLink, LocalizedLink } from './component-options';

export function selectLocalizedLinks(
    links: readonly LocalizedLink[] | undefined,
    activeLanguage: string | undefined,
): readonly AppLink[] {
    const language = resolveSupportedLanguage(activeLanguage);
    return links?.map(link => link[language]) ?? [];
}
