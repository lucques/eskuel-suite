import classNames from "classnames";
import { OverlayTrigger, Tooltip, TooltipProps } from "react-bootstrap";
import type { SubtleButtonSize, SubtleButtonVariant } from '../subtle-button/SubtleButton';
import { useTranslation } from 'react-i18next';
import { CommandTriggerButton, CommandTriggerCancelButton } from '../command-controls/CommandControls';
import type { CommandControlStatus } from '../command-controls/command-control-status';

/**
 * Use for non-hyperlinks
 */
export function IconActionButton({children, onClick, onCancel = undefined, status = 'idle', runningLabel = undefined, text, textPlacement = 'right', disabled = false, active = false, size = undefined, compactSize = undefined, tooltipText = undefined, tooltipPlacement = 'bottom', className, variant}: {
        children: React.ReactNode,
        onClick: () => void,
        onCancel?: () => void,
        status?: CommandControlStatus,
        runningLabel?: string,
        text?: string,
        textPlacement?: 'left' | 'right' | 'top' | 'bottom',
        disabled?: boolean,
        active?: boolean,
        size?: SubtleButtonSize,
        compactSize?: SubtleButtonSize,
        tooltipText?: string,
        tooltipPlacement?: 'left' | 'right' | 'top' | 'bottom',
        className?: string,
        variant?: SubtleButtonVariant
    })
{
    const { t } = useTranslation('common');
    const flexDirection =
        textPlacement === 'left' ? 'row-reverse' :
        textPlacement === 'right' ? 'row' :
        textPlacement === 'top' ? 'column-reverse' :
        /* bottom */ 'column';

    const buttonContent = (
        <span className={classNames('d-inline-flex', text ? 'gap-2' : undefined, 'align-items-center')} style={{ flexDirection }}>
            {children}
            {text ? <span>{text}</span> : ''}
        </span>
    );
    const buttonClassName = classNames('btn', 'd-inline-flex', text ? 'gap-2' : undefined, active ? 'active' : '', className);
    const button = onCancel === undefined
        ? <CommandTriggerButton
            className={buttonClassName}
            disabled={disabled}
            active={active}
            variant={variant}
            size={size}
            compactSize={compactSize}
            aria-label={text ? undefined : tooltipText}
            onClick={onClick}
            status={status}
            runningLabel={runningLabel}
            style={{ justifyContent: 'center', alignItems: 'center' }}
        >
            {buttonContent}
        </CommandTriggerButton>
        : <CommandTriggerCancelButton
            className={buttonClassName}
            disabled={disabled}
            active={active}
            variant={variant}
            size={size}
            compactSize={compactSize}
            aria-label={text ? undefined : tooltipText}
            onClick={onClick}
            onCancel={onCancel}
            status={status}
            runningLabel={runningLabel}
            style={{ justifyContent: 'center', alignItems: 'center' }}
        >
            {buttonContent}
        </CommandTriggerCancelButton>;
    
    if (tooltipText) {
        const effectiveTooltipText = (() => {
            switch (status) {
                case 'idle':
                    return tooltipText;
                case 'running':
                    return onCancel === undefined
                        ? runningLabel ?? t('common.loading')
                        : t('common.cancel');
                case 'rebuilding-after-cancellation':
                    return t('common.cancelling');
                default: { const _n: never = status; return _n; }
            }
        })();
        return (
            <OverlayTrigger
                placement={tooltipPlacement}
                flip
                delay={{ show: 0, hide: 0 }}
                overlay={(props: TooltipProps) => (
                    <Tooltip {...props}>
                        {effectiveTooltipText}
                    </Tooltip>
                )}
                // Show only on hover, not on click (problem with modals opening)
                trigger={['hover', 'focus']}>
                {button}
            </OverlayTrigger>
        )
    }
    else {
        return button;
    }
}
