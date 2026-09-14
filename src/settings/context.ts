import { createContext, useContext } from 'react';

import { assert } from '../util';
import type { Settings } from './store';

export type SettingsContextValue = {
    settings: Settings;
    darkMode: boolean;
    updateSettings: (updates: Partial<Settings>) => void;
};

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export const useSettings = (): SettingsContextValue => {
    const context = useContext(SettingsContext);
    assert(context !== null, 'useSettings must be used within a SettingsProvider');
    return context;
};
