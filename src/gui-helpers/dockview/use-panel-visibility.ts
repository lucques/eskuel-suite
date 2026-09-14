import type { DockviewPanelApi } from 'dockview-core';
import { useCallback, useSyncExternalStore } from 'react';

export function usePanelVisibility(api: DockviewPanelApi): boolean {
    const subscribe = useCallback((onStoreChange: () => void) => {
        const subscription = api.onDidVisibilityChange(onStoreChange);
        return () => subscription.dispose();
    }, [api]);

    return useSyncExternalStore(subscribe, () => api.isVisible);
}
