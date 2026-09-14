export type CatalogFile = {
    readonly url: string;
    readonly filename: string;
};

export type CatalogLocalization = {
    readonly title: string;
    /** Optional URL of a page with more information about the catalog entry. */
    readonly pageUrl?: string;
    readonly files: readonly CatalogFile[];
};

type CatalogEntry = {
    readonly id: string;
    readonly localizations: Readonly<Record<string, CatalogLocalization>>;
};

export type GameCatalogEntry = CatalogEntry;

export type DatabaseCatalogEntry = CatalogEntry;
