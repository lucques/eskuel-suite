import type { GameSource } from '../../game/loader';
import { fastXmlParser } from '../../game/xml/fast-parser';
import { createInProcessDatabaseEngine } from '../../database/in-process-engine';
import { GameConsoleSession } from '../../apps/game-console/session';

export function createNodeGameSession(
    source: GameSource,
    initiallySkipFirstScenes?: number,
): GameConsoleSession {
    return new GameConsoleSession(source, initiallySkipFirstScenes, {
        databaseEngineFactory: createInProcessDatabaseEngine,
        supportedDatabaseSystems: ['sqlite', 'postgresql'],
        xmlParser: fastXmlParser,
    });
}
