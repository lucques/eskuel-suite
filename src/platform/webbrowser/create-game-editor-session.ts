import type { GameSource } from '../../game/loader';
import { domXmlParser } from '../../game/xml/dom-parser';
import { createDatabaseEngine } from '../../database/engine';
import { GameEditorSession } from '../../apps/game-editor/session';
import type { GameEditorSessionOptions } from '../../apps/game-editor/session';

export function createWebBrowserGameEditorSession(
    filename: string,
    source: GameSource,
    sessionOptions: GameEditorSessionOptions = {},
): GameEditorSession {
    const resolvedSessionOptions: GameEditorSessionOptions = sessionOptions.sourceKey !== undefined
        ? sessionOptions
        : {
            ...sessionOptions,
            sourceKey: source.type === 'object' || source.source.type === 'inline'
                ? null
                : `url:${new URL(source.source.url, window.location.href).href}`,
        };
    return new GameEditorSession(filename, source, {
        databaseEngineFactory: createDatabaseEngine,
        supportedDatabaseSystems: ['sqlite', 'postgresql'],
        xmlParser: domXmlParser,
    }, undefined, resolvedSessionOptions);
}
