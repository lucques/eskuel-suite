import type { CatalogFile, CatalogLocalization, DatabaseCatalogEntry, GameCatalogEntry } from '../catalog';
import type { Language } from '../i18n/languages';

export const standaloneGameFiles: Readonly<Record<Language, CatalogFile>> = {
    de: {
        url: '../res/games/gewoehnlicher-morgen/gewoehnlicher-morgen.xml',
        filename: 'gewoehnlicher-morgen.xml',
    },
    en: {
        url: '../res/games/ordinary-morning/ordinary-morning.xml',
        filename: 'ordinary-morning.xml',
    },
};

export const standaloneGameCatalog: readonly GameCatalogEntry[] = [
    {
        id: 'gewoehnlicher-morgen',
        localizations: {
            de: {
                title: 'Ein gewöhnlicher Morgen?',
                files: [standaloneGameFiles.de],
            },
            en: {
                title: 'An Ordinary Morning?',
                files: [standaloneGameFiles.en],
            },
        },
    },
];

export const standaloneDatabaseCatalog: readonly DatabaseCatalogEntry[] = [
    {
        id: 'fahrschule',
        localizations: {
            de: makeDatabaseLocalization('Fahrschule', 'fahrschule.sql'),
            en: makeDatabaseLocalization('Driving School', 'driving-school.sql'),
        },
    },
    {
        id: 'onlineshop',
        localizations: {
            de: makeDatabaseLocalization('Onlineshop', 'onlineshop.sql'),
            en: makeDatabaseLocalization('Online Shop', 'online-shop.sql'),
        },
    },
];

function makeDatabaseLocalization(
    title: string,
    filename: string,
): CatalogLocalization {
    return {
        title,
        files: [{
            url: `../res/dbs/${filename}`,
            filename,
        }],
    };
}
