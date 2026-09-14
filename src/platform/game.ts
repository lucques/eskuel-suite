import type { DatabaseEngineFactory } from '../database/api';
import type { DatabaseSystem } from '../database/system';
import type { XmlParser } from '../game/xml/model';

export type GamePlatformAdapters = {
    databaseEngineFactory: DatabaseEngineFactory;
    supportedDatabaseSystems: readonly DatabaseSystem[];
    xmlParser: XmlParser;
};
