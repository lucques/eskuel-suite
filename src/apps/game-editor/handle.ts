import type { GameEditorViewLayout } from './layout';

export interface GameEditorViewHandle {
    applyLayout: (layout: GameEditorViewLayout) => void;
}
