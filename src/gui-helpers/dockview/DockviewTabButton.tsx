import type { ReactNode } from 'react';

import styles from './DockviewTabButton.module.css';

export type DockviewTabButtonVariant = 'default' | 'hover';

const variantClassNames = {
    default: styles.default,
    hover: styles.hover,
} satisfies Record<DockviewTabButtonVariant, string>;

export function DockviewTabButton({ variant, label, onClick, children }: {
    variant: DockviewTabButtonVariant;
    label: string;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type='button'
            className={`${styles.button} ${variantClassNames[variant]}`}
            aria-label={label}
            title={label}
            onPointerDown={event => {
                event.preventDefault();
                event.stopPropagation();
            }}
            onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                onClick();
            }}
        >
            {children}
        </button>
    );
}
