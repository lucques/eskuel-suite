import type { DatabaseEngine } from '../api';
import { defaultSettingsStore } from '../../settings/store';
import type { SettingsStore } from '../../settings/store';
import { PgliteCore } from './core';
import { PgliteProtocolEngine } from './protocol-engine';
import type { PgliteTransport } from './protocol-engine';
import type { PgliteRequest, PgliteResponse } from './protocol';

class InProcessPgliteTransport implements PgliteTransport {
    private readonly core = new PgliteCore();

    request(request: PgliteRequest): Promise<PgliteResponse> {
        return this.core.request(request);
    }

    dispose(): void {
        this.core.dispose();
    }
}

export class InProcessPgliteEngine extends PgliteProtocolEngine {
    constructor(settingsStore: SettingsStore = defaultSettingsStore) {
        super(() => new InProcessPgliteTransport(), settingsStore);
    }
}

export const createInProcessPgliteDatabaseEngine = (): DatabaseEngine => new InProcessPgliteEngine();
