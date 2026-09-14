import type { GameSource } from '../../game/loader';
import { domXmlParser } from '../../game/xml/dom-parser';
import { createDatabaseEngine } from '../../database/engine';
import { GameConsoleSession } from '../../apps/game-console/session';

export function createWebBrowserGameSession(
    source: GameSource,
    initiallySkipFirstScenes?: number,
): GameConsoleSession {
    return new GameConsoleSession(source, initiallySkipFirstScenes, {
        databaseEngineFactory: createDatabaseEngine,
        supportedDatabaseSystems: ['sqlite', 'postgresql'],
        xmlParser: domXmlParser,
    });
}
