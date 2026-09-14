import type { CatalogSourceOption } from '../../catalog/selection';
import type { WithFilename } from '../../util';

export type OpenSourceFile<T> = {
    key: string;
    source: WithFilename<T>;
};

export type OpenSourceOption<T> = {
    key: string;
    title: string;
    pageUrl?: string;
    files: readonly OpenSourceFile<T>[];
};

export function groupOpenSourceOptions<T>(
    catalogSources: readonly CatalogSourceOption<T>[],
): OpenSourceOption<T>[] {
    const groups = new Map<string, OpenSourceOption<T> & { files: OpenSourceFile<T>[] }>();

    for (const catalogSource of catalogSources) {
        const group = groups.get(catalogSource.entryKey);
        const file = { key: catalogSource.key, source: catalogSource.source };
        if (group === undefined) {
            groups.set(catalogSource.entryKey, {
                key: catalogSource.entryKey,
                title: catalogSource.entryTitle,
                pageUrl: catalogSource.pageUrl,
                files: [file],
            });
        }
        else {
            group.files.push(file);
        }
    }

    return [...groups.values()];
}
