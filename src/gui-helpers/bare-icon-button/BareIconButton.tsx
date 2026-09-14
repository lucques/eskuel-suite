import classNames from 'classnames';
import type { ReactNode } from 'react';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import type { TooltipProps } from 'react-bootstrap';

import styles from './BareIconButton.module.css';

export function BareIconButton({
    accessibleName,
    children,
    className,
    disabled = false,
    onClick,
    tooltipPlacement = 'bottom',
    tooltipText,
}: {
    accessibleName: string,
    children: ReactNode,
    className?: string,
    disabled?: boolean,
    onClick: () => void,
    tooltipPlacement?: 'left' | 'right' | 'top' | 'bottom',
    tooltipText?: string,
}) {
    const button = (
        <button
            type='button'
            className={classNames(styles.button, className)}
            aria-label={accessibleName}
            disabled={disabled}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
                event.stopPropagation();
                onClick();
            }}
        >
            {children}
        </button>
    );

    if (tooltipText !== undefined) {
        const tooltipTarget = disabled
            ? <span className={styles.disabledTooltipTarget}>{button}</span>
            : button;
        return (
            <OverlayTrigger
                placement={tooltipPlacement}
                flip
                delay={{ show: 0, hide: 0 }}
                overlay={(props: TooltipProps) => <Tooltip {...props}>{tooltipText}</Tooltip>}
                trigger={['hover', 'focus']}
            >
                {tooltipTarget}
            </OverlayTrigger>
        );
    }
    else {
        return button;
    }
}
