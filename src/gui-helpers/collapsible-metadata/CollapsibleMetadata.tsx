import { ReactNode, useState } from 'react';
import { SubtleButton } from '../subtle-button/SubtleButton';
import styles from './CollapsibleMetadata.module.css';

export function CollapsibleMetadata({
    title,
    collapseLabel,
    expandLabel,
    children,
    testId,
    compact = false,
}: {
    title: string,
    collapseLabel: string,
    expandLabel: string,
    children: ReactNode,
    testId?: string,
    compact?: boolean,
}) {
    const [collapsed, setCollapsed] = useState(false);
    const toggleLabel = collapsed ? expandLabel : collapseLabel;

    return (
        <div
            className={`${styles.metadata} ${collapsed ? styles.collapsed : styles.expanded} ${compact ? styles.compact : ''}`}
            data-testid={testId}
        >
            {
                collapsed
                    ? (
                        <div className={styles.collapsedTitle}>
                            <h1>{title}</h1>
                        </div>
                    )
                    : <div className={styles.expandedContent}>{children}</div>
            }
            <div className={styles.controlColumn}>
                <SubtleButton
                    type='button'
                    size='sm'
                    variant='secondary'
                    aria-expanded={!collapsed}
                    aria-label={toggleLabel}
                    title={toggleLabel}
                    onClick={() => setCollapsed(previous => !previous)}
                >
                    <i className={`bi ${collapsed ? 'bi-chevron-down' : 'bi-chevron-up'}`} aria-hidden='true' />
                </SubtleButton>
            </div>
        </div>
    );
}
