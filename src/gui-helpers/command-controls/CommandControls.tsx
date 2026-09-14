import classNames from 'classnames';
import { forwardRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { OverlayTrigger, Spinner, Tooltip } from 'react-bootstrap';
import type { TooltipProps } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import { SubtleButton } from '../subtle-button/SubtleButton';
import type { SubtleButtonProps } from '../subtle-button/SubtleButton';
import type { CommandControlStatus } from './command-control-status';
import styles from './CommandControls.module.css';

export type CommandTriggerButtonProps = Omit<SubtleButtonProps, 'children' | 'onClick'> & {
    children: ReactNode,
    onClick: () => void,
    runningLabel?: string,
    status: CommandControlStatus,
};

export const CommandTriggerButton = forwardRef<HTMLButtonElement, CommandTriggerButtonProps>(function CommandTriggerButton({
    children,
    className,
    compactSize,
    disabled = false,
    onClick,
    runningLabel,
    size = 'md',
    status,
    variant = 'secondary',
    ...props
}: CommandTriggerButtonProps, ref) {
    const { t } = useTranslation('common');
    const statusPresentation = getCommandControlStatusPresentation(status);
    const effectiveLabel = statusPresentation.cancelling
        ? t('common.cancelling')
        : statusPresentation.inProgress
            ? runningLabel ?? t('common.loading')
            : props['aria-label'];
    const content = (
        <span className={styles.commandButtonContent}>
            <span
                className={classNames(styles.label, statusPresentation.inProgress && styles.hiddenLabel)}
                aria-hidden={statusPresentation.inProgress}
            >
                {children}
            </span>
            {statusPresentation.inProgress
                ? <Spinner animation='border' role='status' size='sm'>
                    <span className='visually-hidden'>
                        {statusPresentation.cancelling ? t('common.cancelling') : runningLabel ?? t('common.loading')}
                    </span>
                </Spinner>
                : null}
        </span>
    );

    return (
        <SubtleButton
            {...props}
            ref={ref}
            aria-label={effectiveLabel}
            className={className}
            compactSize={compactSize}
            disabled={statusPresentation.inProgress || disabled}
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                onClick();
            }}
            size={size}
            variant={variant}
        >
            {content}
        </SubtleButton>
    );
});

export type CommandCancelButtonProps = Omit<SubtleButtonProps, 'children' | 'hidden' | 'onClick' | 'title'> & {
    onClick: () => void,
    status: CommandControlStatus,
};

export const CommandCancelButton = forwardRef<HTMLButtonElement, CommandCancelButtonProps>(function CommandCancelButton({
    className,
    compactSize,
    disabled = false,
    onClick,
    size = 'md',
    status,
    variant = 'secondary',
    ...props
}: CommandCancelButtonProps, ref) {
    const { t } = useTranslation('common');
    const statusPresentation = getCommandControlStatusPresentation(status);
    const label = statusPresentation.cancelling ? t('common.cancelling') : t('common.cancel');
    const effectiveDisabled = statusPresentation.cancelling || disabled;

    return (
        <OverlayTrigger
            placement='bottom'
            flip
            delay={{ show: 0, hide: 0 }}
            overlay={(overlayProps: TooltipProps) => (
                <Tooltip {...overlayProps}>{label}</Tooltip>
            )}
        >
            <span className={styles.cancelButtonTooltipTarget} hidden={!statusPresentation.inProgress}>
                <SubtleButton
                    {...props}
                    ref={ref}
                    aria-label={label}
                    className={classNames(className, effectiveDisabled && styles.cancelButtonDisabled)}
                    compactSize={compactSize}
                    disabled={effectiveDisabled}
                    hidden={!statusPresentation.inProgress}
                    onClick={(event: MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                        onClick();
                    }}
                    size={size}
                    variant={variant}
                >
                    <span className={styles.cancelButtonContent}>
                        {statusPresentation.cancelling
                            ? <Spinner animation='border' aria-hidden='true' size='sm' />
                            : <i className='bi bi-x-lg' aria-hidden='true' />}
                        <span className='visually-hidden'>{label}</span>
                    </span>
                </SubtleButton>
            </span>
        </OverlayTrigger>
    );
});

export type CommandTriggerCancelButtonProps = CommandTriggerButtonProps & {
    onCancel: () => void,
};

export const CommandTriggerCancelButton = forwardRef<HTMLButtonElement, CommandTriggerCancelButtonProps>(function CommandTriggerCancelButton({
    children,
    className,
    compactSize,
    disabled = false,
    onCancel,
    onClick,
    runningLabel,
    size = 'md',
    status,
    variant = 'secondary',
    ...props
}: CommandTriggerCancelButtonProps, ref) {
    const { t } = useTranslation('common');
    const statusPresentation = getCommandControlStatusPresentation(status);
    const effectiveLabel = statusPresentation.cancelling
        ? t('common.cancelling')
        : statusPresentation.cancellationAvailable
            ? t('common.cancel')
            : props['aria-label'];
    const content = (
        <span className={styles.commandButtonContent}>
            <span
                className={classNames(styles.label, statusPresentation.inProgress && styles.hiddenLabel)}
                aria-hidden={statusPresentation.inProgress}
            >
                {children}
            </span>
            {statusPresentation.inProgress
                ? <span className={styles.indicator}>
                    <span className={classNames(styles.indicator, styles.spinnerIndicator)}>
                        <Spinner animation='border' role='status' size='sm'>
                            <span className='visually-hidden'>
                                {statusPresentation.cancelling ? t('common.cancelling') : runningLabel ?? t('common.loading')}
                            </span>
                        </Spinner>
                    </span>
                    {statusPresentation.cancellationAvailable
                        ? <span className={classNames(styles.indicator, styles.cancelIndicator)} aria-hidden='true'>
                            <i className='bi bi-x-lg' />
                        </span>
                        : null}
                </span>
                : null}
        </span>
    );

    return (
        <SubtleButton
            {...props}
            ref={ref}
            aria-label={effectiveLabel}
            className={classNames(className, statusPresentation.cancellationAvailable && styles.cancellable)}
            compactSize={compactSize}
            disabled={statusPresentation.inProgress ? statusPresentation.cancelling : disabled}
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                switch (status) {
                    case 'idle':
                        onClick();
                        break;
                    case 'running':
                        onCancel();
                        break;
                    case 'rebuilding-after-cancellation':
                        break;
                    default: { const _n: never = status; return _n; }
                }
            }}
            size={size}
            variant={variant}
        >
            {content}
        </SubtleButton>
    );
});

function getCommandControlStatusPresentation(status: CommandControlStatus): {
    cancellationAvailable: boolean,
    cancelling: boolean,
    inProgress: boolean,
} {
    switch (status) {
        case 'idle':
            return { cancellationAvailable: false, cancelling: false, inProgress: false };
        case 'running':
            return { cancellationAvailable: true, cancelling: false, inProgress: true };
        case 'rebuilding-after-cancellation':
            return { cancellationAvailable: false, cancelling: true, inProgress: true };
        default: { const _n: never = status; return _n; }
    }
}
