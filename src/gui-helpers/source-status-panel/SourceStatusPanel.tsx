import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import type { CommandControlStatus } from '../command-controls/command-control-status';
import { IconActionButton } from '../icon-button/IconActionButton';
import styles from './SourceStatusPanel.module.css';

export type LoadingStatus =
    { kind: 'empty' } |
    { kind: 'pending' } |
    { kind: 'loaded', details?: string } |
    { kind: 'failed', error: string };

export function SourceStatusPanelWithOpenButton({ onOpen, tooltipText, status }: {
    onOpen: () => void,
    tooltipText: string,
    status: LoadingStatus,
}) {
    const { t } = useTranslation('common');

    return (
        <div className={styles.bar}>
            <IconActionButton
                onClick={onOpen}
                tooltipText={tooltipText}
                text={t('common.open')}
                size='sm'
            >
                <i className='bi bi-folder2-open' aria-hidden='true' />
            </IconActionButton>
            <LoadingStatusAlert status={status} />
        </div>
    );
}

export function SourceStatusPanelWithOpenSaveButtons({ onOpen, tooltipText, status, onSave, saveTooltipText, disabled = false, openStatus = 'idle', onCancelOpen = undefined }: {
    onOpen: () => void,
    tooltipText: string,
    status: LoadingStatus,
    onSave: () => void,
    saveTooltipText: string,
    disabled?: boolean,
    openStatus?: CommandControlStatus,
    onCancelOpen?: () => void,
}) {
    const { t } = useTranslation('common');

    return (
        <div className={styles.bar}>
            <IconActionButton
                onClick={onOpen}
                onCancel={onCancelOpen}
                tooltipText={tooltipText}
                disabled={disabled}
                status={openStatus}
                text={t('common.open')}
                size='sm'
            >
                <i className='bi bi-folder2-open' aria-hidden='true' />
            </IconActionButton>
            <LoadingStatusAlert status={status} />
            {
                status.kind === 'loaded' &&
                    <IconActionButton
                        onClick={onSave}
                        tooltipText={saveTooltipText}
                        disabled={disabled}
                        text={t('common.save')}
                        size='sm'
                    >
                        <i className='bi bi-floppy' aria-hidden='true' />
                    </IconActionButton>
            }
        </div>
    );
}

function LoadingStatusAlert({ status }: { status: LoadingStatus }) {
    const { t } = useTranslation('common');

    switch (status.kind) {
        case 'empty':
            return <Alert className={styles.status} variant='warning'>{t('common.nothing_loaded')}</Alert>;
        case 'pending':
            return <Alert className={styles.status} variant='warning'>{t('common.loading')}</Alert>;
        case 'loaded':
            return (
                <Alert className={styles.status} variant='success'>
                    {status.details === undefined
                        ? t('common.loaded')
                        : `${t('common.loaded')}: ${status.details}`}
                </Alert>
            );
        case 'failed':
            return <Alert className={styles.status} variant='danger'>{status.error}</Alert>;
        default: { const _n: never = status; return _n; }
    }
}
