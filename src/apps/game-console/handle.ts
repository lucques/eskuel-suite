import type { GameConsoleViewLayout } from './layout';

export interface GameConsoleViewHandle {
    applyLayout: (layout: GameConsoleViewLayout) => void;
}
