import { Effect } from 'effect';

import type { DbData } from './api';
import { parseSqlScriptMetadata, type ParseSqlMetadataFail } from './system';
import { readDatabasePackage, type DatabasePackageInfo, type ParseDatabasePackageFail } from './package';
import type { DbSource, FetchDbFail } from './source';
import { defaultSettingsStore, type SettingsStore } from '../settings/store';
import type { FileSizeTooLargeFail } from '../util';
import { materializeBinarySource, materializeTextSource } from '../util';

export type LoadDatabaseFail =
    | FetchDbFail
    | FileSizeTooLargeFail
    | ParseSqlMetadataFail
    | ParseDatabasePackageFail;

export type LoadedDatabase = {
    data: DbData;
    packageInfo?: DatabasePackageInfo;
};

export function loadDatabase(
    source: DbSource,
    settingsStore: SettingsStore = defaultSettingsStore,
): Effect.Effect<DbData, LoadDatabaseFail> {
    return loadDatabaseWithMetadata(source, settingsStore).pipe(
        Effect.map(loaded => loaded.data),
    );
}

export function loadDatabaseWithMetadata(
    source: DbSource,
    settingsStore: SettingsStore = defaultSettingsStore,
): Effect.Effect<LoadedDatabase, LoadDatabaseFail> {
    return Effect.gen(function* () {
        const settings = settingsStore.getSnapshot();
        const maxBytes = source.source.type === 'fetch'
            ? Math.min(settings.maxDatabaseFileBytes, settings.maxFetchedSourceBytes)
            : settings.maxDatabaseFileBytes;

        if (source.type === 'initial-sql-script') {
            const result = yield* Effect.tryPromise({
                try: signal => materializeTextSource(source.source, maxBytes, signal),
                catch: () => ({
                    kind: 'fetch-db' as const,
                    url: source.source.type === 'fetch' ? source.source.url : '',
                }),
            });
            if (!result.ok) {
                return yield* Effect.fail(toDatabaseSourceFail(result.error));
            }
            const metadata = parseSqlScriptMetadata(result.data);
            if (!metadata.ok) {
                return yield* Effect.fail(metadata.error);
            }
            return {
                data: {
                    type: 'initial-sql-script',
                    system: metadata.data.system,
                    systemMinVersion: metadata.data.systemMinVersion,
                    sql: result.data,
                },
            };
        }
        else if (source.type === 'sqlite-db') {
            const result = yield* Effect.tryPromise({
                try: signal => materializeBinarySource(source.source, maxBytes, signal),
                catch: () => ({
                    kind: 'fetch-db' as const,
                    url: source.source.type === 'fetch' ? source.source.url : '',
                }),
            });
            if (!result.ok) {
                return yield* Effect.fail(toDatabaseSourceFail(result.error));
            }
            return {
                data: {
                    type: 'sqlite-db',
                    system: 'sqlite',
                    systemMinVersion: '3.0.0',
                    data: result.data,
                },
            };
        }
        else if (source.type === 'eskuel-database-package') {
            const result = yield* Effect.tryPromise({
                try: signal => materializeBinarySource(source.source, maxBytes, signal),
                catch: () => ({
                    kind: 'fetch-db' as const,
                    url: source.source.type === 'fetch' ? source.source.url : '',
                }),
            });
            if (!result.ok) {
                return yield* Effect.fail(toDatabaseSourceFail(result.error));
            }
            const packageResult = yield* Effect.promise(() => readDatabasePackage(
                result.data,
                settings.maxDatabaseFileBytes,
            ));
            return packageResult.ok
                ? {
                    data: packageResult.data.data,
                    packageInfo: {
                        descriptor: packageResult.data.descriptor,
                        licenses: packageResult.data.licenses,
                        notices: packageResult.data.notices,
                        ...(packageResult.data.provenance === undefined
                            ? {}
                            : { provenance: packageResult.data.provenance }),
                    },
                }
                : yield* Effect.fail(packageResult.error);
        }
        else { const _n: never = source; return _n; }
    });
}

function toDatabaseSourceFail(
    error: FileSizeTooLargeFail | { kind: 'fetch', url: string },
): FileSizeTooLargeFail | FetchDbFail {
    return error.kind === 'file-size-too-large'
        ? error
        : { kind: 'fetch-db', url: error.url };
}
