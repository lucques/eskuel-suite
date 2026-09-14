import { Effect } from 'effect';

import { xmlToGame } from './xml/codec';
import type { SceneImageResourceLimitFail } from './image';
import type { Game } from './model';
import { Game as GameModel } from './model';
import { readGamePackage } from './package';
import type { GamePackageInfo, ParseGamePackageFail } from './package';
import type { GameSource } from './source';
import type { DbData } from '../database/api';
import type { DatabaseSystem } from '../database/system';
import { defaultSettingsStore } from '../settings/store';
import type { Settings } from '../settings/store';
import { materializeBinarySource, materializeTextSource } from '../util';
import type { FileSizeTooLargeFail } from '../util';
import type { ParseXMLFail, XmlElement, XmlParser } from './xml/model';

export type { GameSource } from './source';

export type FetchXMLFail = { kind: 'fetch-xml', url: string };
export type FetchGamePackageFail = { kind: 'fetch-game-package', url: string };
export type LoadGameFail =
    | FetchXMLFail
    | FetchGamePackageFail
    | FileSizeTooLargeFail
    | ParseXMLFail
    | ParseGamePackageFail
    | SceneImageResourceLimitFail;

export type LoadedGame = {
    game: Game;
    packageInfo?: GamePackageInfo;
};

export function loadGame(source: GameSource, xmlParser: XmlParser): Effect.Effect<Game, LoadGameFail> {
    return loadGameWithInfo(source, xmlParser).pipe(Effect.map(loaded => loaded.game));
}

export function loadGameWithInfo(source: GameSource, xmlParser: XmlParser): Effect.Effect<LoadedGame, LoadGameFail> {
    if (source.type === 'object') {
        return Effect.succeed({ game: source.source });
    }
    else if (source.type === 'xml') {
        const settings = defaultSettingsStore.getSnapshot();
        const maxBytes = source.source.type === 'fetch'
            ? Math.min(settings.maxGameFileBytes, settings.maxFetchedSourceBytes)
            : settings.maxGameFileBytes;
        return Effect.tryPromise({
            try: async signal => {
                const result = await materializeTextSource(source.source, maxBytes, signal);
                if (!result.ok) {
                    throw result.error;
                }
                return result.data;
            },
            catch: error => isFileSizeTooLargeFail(error)
                ? error
                : { kind: 'fetch-xml' as const, url: source.source.type === 'fetch' ? source.source.url : '' },
        }).pipe(
            Effect.flatMap(text => parseGameXml(text, xmlParser, settings)),
            Effect.map(parsed => ({ game: parsed.game })),
        );
    }
    else if (source.type === 'eskuel-game-package') {
        const settings = defaultSettingsStore.getSnapshot();
        const maxBytes = source.source.type === 'fetch'
            ? Math.min(settings.maxGamePackageBytes, settings.maxFetchedSourceBytes)
            : settings.maxGamePackageBytes;
        return Effect.tryPromise({
            try: async signal => {
                const result = await materializeBinarySource(source.source, maxBytes, signal);
                if (!result.ok) {
                    throw result.error;
                }
                return result.data;
            },
            catch: error => isFileSizeTooLargeFail(error)
                ? error
                : {
                    kind: 'fetch-game-package' as const,
                    url: source.source.type === 'fetch' ? source.source.url : '',
                },
        }).pipe(
            Effect.flatMap(archive => Effect.promise(() => readGamePackage(archive, {
                maxGameXmlBytes: settings.maxGameFileBytes,
                maxDatabasePackageBytes: settings.maxDatabaseFileBytes,
                maxDatabaseResourceBytes: settings.maxDatabaseFileBytes,
            }))),
            Effect.flatMap(result => result.ok ? Effect.succeed(result.data) : Effect.fail(result.error)),
            Effect.flatMap(packageData => parseGameXml(packageData.xml, xmlParser, settings).pipe(
                Effect.mapError(error => error.kind === 'parse-xml'
                    ? gamePackageFail(`Game XML is invalid: ${error.details}`)
                    : error),
                Effect.flatMap(parsed => {
                    const game = parsed.game;
                    if (game.dbData !== null) {
                        return Effect.fail(gamePackageFail('Game XML must not contain an embedded database source'));
                    }
                    else if (parsed.xml.attributes['format-version'] === undefined) {
                        return Effect.fail(gamePackageFail('Game XML must declare format-version'));
                    }
                    else if (parsed.xml.attributes['db-system'] === undefined) {
                        return Effect.fail(gamePackageFail('Game XML must declare db-system'));
                    }
                    else if (parsed.xml.attributes['db-system-min-version'] === undefined) {
                        return Effect.fail(gamePackageFail('Game XML must declare db-system-min-version'));
                    }
                    else {
                        const databaseSystem = getDbDataSystem(packageData.dbData);
                        if (
                            parsed.xml.attributes['db-system'] !== databaseSystem
                            || game.dbSystem !== databaseSystem
                        ) {
                            return Effect.fail(gamePackageFail(
                                `Game XML db-system must match database dependency system ${databaseSystem}`,
                            ));
                        }
                        else {
                            return Effect.succeed({
                                game: new GameModel(
                                    game.title,
                                    game.teaser,
                                    game.copyright,
                                    packageData.dbData,
                                    game.scenes,
                                    game.dbSystem,
                                    game.dbSystemMinVersion,
                                ),
                                packageInfo: {
                                    descriptor: packageData.descriptor,
                                    licenses: packageData.licenses,
                                    notices: packageData.notices,
                                    ...(packageData.provenance === undefined
                                        ? {}
                                        : { provenance: packageData.provenance }),
                                    database: packageData.database,
                                },
                            });
                        }
                    }
                }),
            )),
        );
    }
    else { const _n: never = source; return _n; }
}

type ParsedGameXml = {
    game: Game;
    xml: XmlElement;
};

function parseGameXml(
    text: string,
    xmlParser: XmlParser,
    settings: Settings,
): Effect.Effect<ParsedGameXml, ParseXMLFail | SceneImageResourceLimitFail> {
    const xmlResult = xmlParser.parse(text);
    if (!xmlResult.ok) {
        return Effect.fail(xmlResult.error);
    }
    else {
        const gameResult = xmlToGame(xmlResult.data, {
            maxImageFileBytes: settings.maxImageFileBytes,
            maxImageWidth: settings.maxImageWidth,
            maxImageHeight: settings.maxImageHeight,
        });
        return gameResult.ok
            ? Effect.succeed({ game: gameResult.data, xml: xmlResult.data })
            : Effect.fail(gameResult.error);
    }
}

function isFileSizeTooLargeFail(error: unknown): error is FileSizeTooLargeFail {
    return typeof error === 'object' && error !== null && 'kind' in error && error.kind === 'file-size-too-large';
}

function gamePackageFail(details: string): ParseGamePackageFail {
    return { kind: 'parse-game-package', details };
}

function getDbDataSystem(dbData: DbData): DatabaseSystem {
    return dbData.system;
}
