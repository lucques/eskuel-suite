import { describe, expect, it } from 'vitest';

import type { LocalizedLink } from './component-options';
import { selectLocalizedLinks } from './localized-link';

const links: readonly LocalizedLink[] = [
    {
        en: { title: 'First', url: '/en/first/' },
        de: { title: 'Erster', url: '/de/erster/' },
    },
    {
        en: { title: 'Second', url: '/en/second/' },
        de: { title: 'Zweiter', url: '/de/zweiter/' },
    },
];

describe('selectLocalizedLinks', () => {
    it('selects every link for the active supported language', () => {
        expect(selectLocalizedLinks(links, 'en')).toEqual([
            { title: 'First', url: '/en/first/' },
            { title: 'Second', url: '/en/second/' },
        ]);
        expect(selectLocalizedLinks(links, 'de')).toEqual([
            { title: 'Erster', url: '/de/erster/' },
            { title: 'Zweiter', url: '/de/zweiter/' },
        ]);
    });

    it('normalizes regional language tags and falls back to English', () => {
        expect(selectLocalizedLinks(links, 'de-DE')[0]).toEqual({ title: 'Erster', url: '/de/erster/' });
        expect(selectLocalizedLinks(links, 'fr')[0]).toEqual({ title: 'First', url: '/en/first/' });
        expect(selectLocalizedLinks(links, undefined)[0]).toEqual({ title: 'First', url: '/en/first/' });
    });

    it('turns an omitted link list into an empty list', () => {
        expect(selectLocalizedLinks(undefined, 'de')).toEqual([]);
    });
});
