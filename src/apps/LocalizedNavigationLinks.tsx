import { GuardedNavigationLink } from '../gui-helpers/guarded-navigation-link/GuardedNavigationLink';
import type { LocalizedLink } from './component-options';
import { selectLocalizedLinks } from './localized-link';

export function LocalizedNavigationLinks({
    links,
    activeLanguage,
    className,
    onNavigate,
}: {
    links: readonly LocalizedLink[] | undefined,
    activeLanguage: string | undefined,
    className?: string,
    onNavigate: (url: string) => void,
}) {
    const localizedLinks = selectLocalizedLinks(links, activeLanguage);
    return localizedLinks.length === 0
        ? null
        : <>
            {localizedLinks.map((link, index) => (
                <GuardedNavigationLink
                    key={`${index}:${link.url}`}
                    href={link.url}
                    className={className}
                    onNavigate={onNavigate}
                >
                    {link.title}
                </GuardedNavigationLink>
            ))}
        </>;
}
