import type { BrowserViewLayout } from './layout';

export interface BrowserViewHandle {
    applyLayout: (layout: BrowserViewLayout) => void;
}
