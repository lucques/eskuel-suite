import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { Modal } from 'react-bootstrap';
import type { ModalProps } from 'react-bootstrap';

import './AppTheme.css';
import styles from './AppTheme.module.css';

export type AppThemeName = 'browser' | 'game-console' | 'game-editor';

const AppThemeContext = createContext<AppThemeName | null>(null);

function getAppThemeClassName(theme: AppThemeName): string {
    switch (theme) {
        case 'browser':
            return styles.browser;
        case 'game-console':
            return styles.gameConsole;
        case 'game-editor':
            return styles.gameEditor;
        default: {
            const _n: never = theme;
            return _n;
        }
    }
}

function joinClassNames(...classNames: Array<string | undefined>): string {
    return classNames.filter(className => className !== undefined && className !== '').join(' ');
}

export function AppThemeScope({ theme, className, children }: {
    theme: AppThemeName,
    className?: string,
    children: ReactNode,
}) {
    return (
        <AppThemeContext.Provider value={theme}>
            <div className={joinClassNames('localTheme', getAppThemeClassName(theme), className)}>
                {children}
            </div>
        </AppThemeContext.Provider>
    );
}

export function ThemedModal({ className, ...props }: ModalProps) {
    const theme = useContext(AppThemeContext);
    const themeClassNames = theme === null
        ? undefined
        : joinClassNames('localTheme', getAppThemeClassName(theme));

    return <Modal {...props} className={joinClassNames(themeClassNames, className)} />;
}
