import type { ReactNode } from 'react';
import { Alert, CloseButton } from 'react-bootstrap';

import styles from './SessionNotice.module.css';

export function SessionNotice({ children, className, onClose, variant }: {
    children: ReactNode,
    className?: string,
    onClose: () => void,
    variant: 'info' | 'warning',
}) {
    return (
        <Alert
            variant={variant}
            className={`${styles.notice} mb-0${className === undefined ? '' : ` ${className}`}`}
        >
            <span className={styles.message}>{children}</span>
            <CloseButton className={styles.closeButton} onClick={onClose} />
        </Alert>
    );
}
