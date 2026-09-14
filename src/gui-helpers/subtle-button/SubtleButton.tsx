import { forwardRef } from 'react';
import { Button } from 'react-bootstrap';
import type { ButtonProps } from 'react-bootstrap';
import styles from './SubtleButton.module.css';

// Primary:   Bright color
// Secondary: Gray
// *-subtle:  Merges into the corresponding semantic background
export type SubtleButtonVariant =
    | 'primary'
    | 'secondary'
    | 'primary-subtle'
    | 'success-subtle'
    | 'warning-subtle';
export type SubtleButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export type SubtleButtonProps = Omit<ButtonProps, 'color' | 'size' | 'variant'> & {
    variant?: SubtleButtonVariant;
    size?: SubtleButtonSize;
    compactSize?: SubtleButtonSize;
};

function toBootstrapButtonSize(size: SubtleButtonSize): ButtonProps['size'] {
    switch (size) {
        case 'xs':
            // Bootstrap has no xs size. Start with sm and override only padding and font size.
            return 'sm';
        case 'sm':
            return 'sm';
        case 'md':
            return undefined;
        case 'lg':
            return 'lg';
        default: { const _n: never = size; return _n; }
    }
}

/**
 * This button takes the default Bootstrap button and gives it a subtle look by
 * merging it into the light vs dark mode background.
 */
export const SubtleButton = forwardRef<HTMLButtonElement, SubtleButtonProps>(
    function SubtleButton({ children, className, compactSize, size = 'md', variant = 'secondary', style, ...props }, ref) {
        const mergedClassName = className
            ? `${styles.subtleButton} ${className}`
            : styles.subtleButton;

        return (
            <Button
                {...props}
                ref={ref}
                className={mergedClassName}
                size={toBootstrapButtonSize(size)}
                style={style}
                data-subtle-size={size}
                data-subtle-compact-size={compactSize}
                data-subtle-variant={variant}
            >
                {children}
            </Button>
        );
    }
);
