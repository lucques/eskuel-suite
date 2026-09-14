import type { GameSource } from '../../game/loader';
import { fastXmlParser } from '../../game/xml/fast-parser';
import { createInProcessDatabaseEngine } from '../../database/in-process-engine';
import { GameEditorSession } from '../../apps/game-editor/session';
import type { GameEditorSessionOptions } from '../../apps/game-editor/session';

export function createNodeGameEditorSession(
    filename: string,
    source: GameSource,
    sessionOptions: GameEditorSessionOptions = {},
): GameEditorSession {
    return new GameEditorSession(filename, source, {
        databaseEngineFactory: createInProcessDatabaseEngine,
        supportedDatabaseSystems: ['sqlite', 'postgresql'],
        xmlParser: fastXmlParser,
    }, undefined, sessionOptions);
}
