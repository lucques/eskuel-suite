import type { ReactNode } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import styles from './NonreadyView.module.css';

export type ErrorPresentation = {
    title: string,
    message: string,
    details?: string,
};

export type NonreadyViewProps =
    | { kind: 'loading', message?: string }
    | { kind: 'failed', error: ErrorPresentation, actions?: ReactNode };

export function NonreadyView(props: NonreadyViewProps) {
    const { t } = useTranslation('common');

    if (props.kind === 'loading') {
        const message = props.message ?? t('common.loading');
        return (
            <div className={styles.root} data-testid='nonready-view'>
                <div className={styles.loading} aria-live='polite'>
                    <Spinner animation='border' as='span' role='status'>
                        <span className='visually-hidden'>{message}</span>
                    </Spinner>
                    <span>{message}</span>
                </div>
            </div>
        );
    }
    else if (props.kind === 'failed') {
        return (
            <div className={styles.root} data-testid='nonready-view'>
                <Alert className={styles.error} variant='danger' role='alert'>
                    <Alert.Heading as='h2' className='fs-5'>{props.error.title}</Alert.Heading>
                    <p className='mb-0'>{props.error.message}</p>
                    {props.error.details !== undefined && (
                        <details className={styles.details}>
                            <summary>{t('initialization.technical_details')}</summary>
                            <pre>{props.error.details}</pre>
                        </details>
                    )}
                    {props.actions !== undefined && <div className={styles.actions}>{props.actions}</div>}
                </Alert>
            </div>
        );
    }
    else {
        const _n: never = props;
        return _n;
    }
}
