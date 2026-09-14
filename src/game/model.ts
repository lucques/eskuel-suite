import { assert } from '../util';
import { DbData, SqlResult } from '../database/api';
import {
    DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS,
    isDatabaseSystemVersion,
    type DatabaseSystem,
} from '../database/system';
import type { ImageMediaType } from './image';

export class Game {
    constructor(
        readonly title: string,
        readonly teaser: string,
        readonly copyright: string,
        readonly dbData: DbData | null,
        readonly scenes: Scene[],
        readonly dbSystem: DatabaseSystem = 'sqlite',
        readonly dbSystemMinVersion: string = DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS[dbSystem])
    {
        assert(scenes.length > 0, 'There must be at least one scene');
        assert(isDatabaseSystemVersion(dbSystemMinVersion), 'The database-system minimum version must have three parts');
        assert(
            dbData?.type !== 'initial-sql-script' || dbData.system === dbSystem,
            'The game and its initial SQL script must use the same database system',
        );
        assert(
            dbData?.type !== 'sqlite-db' || dbSystem === 'sqlite',
            'A game with an embedded SQLite database must use the SQLite system',
        );
    }
}

export type TextScene   = {
    type: 'text';
    text: string
}
export type ImageScene   = {
    type: 'image';
    base64string: string;
    mediaType: ImageMediaType
}
export type SelectScene = {
    type: 'select';
    text: string;
    sqlSol: string;
    sqlPlaceholder: string;
    isRowOrderRelevant: boolean;
    isColOrderRelevant: boolean;
    areColNamesRelevant: boolean;
    ordinaryHints: OrdinaryHint[];
    hasSolHint: boolean;
}
export type ManipulateScene = {
    type: 'manipulate',
    text: string;
    sqlSol: string;
    sqlCheck: string;
    sqlPlaceholder: string;
    ordinaryHints: OrdinaryHint[];
    hasSolHint: boolean;
}
export type Scene = TextScene | ImageScene | SelectScene | ManipulateScene;

export type OrdinaryTextHint = {
    type: 'text',
    text: string
}
export type OrdinaryExpectedResultHint = {
    type: 'expected-result'
}
export type OrdinaryHint = OrdinaryTextHint | OrdinaryExpectedResultHint

export function createBlankGame(name: string, content: {
    teaser: string,
    copyright: string,
    firstSceneText: string,
}) {
    return new Game(
        name,
        content.teaser,
        content.copyright,
        null,
        [
            {
                type: 'text',
                text: content.firstSceneText,
            }
        ],
    );
}
