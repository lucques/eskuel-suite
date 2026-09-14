import classNames from "classnames";
import { OverlayTrigger, Tooltip, TooltipProps } from "react-bootstrap";
import { SubtleButton } from '../subtle-button/SubtleButton';
import type { SubtleButtonSize, SubtleButtonVariant } from '../subtle-button/SubtleButton';

/**
 * Use for hyperlinks
 */
export function IconLinkButton({ children, href, text, textPlacement = 'right', disabled = false, onClick, size, compactSize, tooltipText = undefined, tooltipPlacement = 'bottom', className, variant }: {
    children: React.ReactNode,
    href: string,
    text?: string,
    textPlacement?: 'left' | 'right' | 'top' | 'bottom',
    disabled?: boolean,
    onClick?: React.MouseEventHandler<HTMLElement>,
    size?: SubtleButtonSize,
    compactSize?: SubtleButtonSize,
    tooltipText?: string,
    tooltipPlacement?: 'left' | 'right' | 'top' | 'bottom',
    className?: string,
    variant?: SubtleButtonVariant
}) {
    const flexDirection =
        textPlacement === 'left' ? 'row-reverse' :
        textPlacement === 'right' ? 'row' :
        textPlacement === 'top' ? 'column-reverse' :
        /* bottom */ 'column';

    const button =
        <SubtleButton
            as="a"
            variant={variant}
            size={size}
            compactSize={compactSize}
            href={disabled ? undefined : href}
            role='link'
            aria-label={text ? undefined : tooltipText}
            onClick={(e) => {
                e.stopPropagation();

                if (disabled) {
                    e.preventDefault();
                    return;
                }

                onClick?.(e);
            }}
            className={classNames('btn', 'd-inline-flex', text ? 'gap-2' : undefined, disabled ? 'disabled' : '', className)}
            style={{ flexDirection, justifyContent: 'center', alignItems: 'center' }}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
        >
            {children}
            {text ? <span>{text}</span> : ''}
        </SubtleButton>;

    if (tooltipText) {
        return (
            <OverlayTrigger
                placement={tooltipPlacement}
                flip
                delay={{ show: 0, hide: 0 }}
                overlay={(props: TooltipProps) => (
                    <Tooltip {...props}>{tooltipText}</Tooltip>
                )}
                trigger={['hover', 'focus']}
            >
                {button}
            </OverlayTrigger>
        );
    }
    else {
        return button;
    }
}
