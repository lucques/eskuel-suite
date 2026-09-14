import { type CSSProperties, type ReactElement } from "react";
import { CloseButton, ListGroup } from "react-bootstrap";

import styles from "./ResultView.module.css";
import { SqlListing } from '../sql-listing/SqlListing';

export type ResultViewVariant = 'success' | 'danger' | 'info' | 'warning';

export function GenericResultView({ title, sql, main, variant, prominentBackground, onClose }: {
    title?: ReactElement | null,
    sql?: string | null,
    main: ReactElement,
    variant: ResultViewVariant,
    prominentBackground: boolean,
    onClose?: () => void,
}) {
    const hasTitle = title !== null && title !== undefined;
    const hasSql = sql !== null && sql !== undefined;
    const showTitleRow = hasTitle || (onClose !== undefined && !hasSql);
    const titleItemClassName = `${styles.resultHeader} d-flex justify-content-between align-items-start bg-${variant} bg-opacity-${prominentBackground ? '50' : '25'} border-${variant}`;
    const sqlItemClassName = [
        styles.resultHeader,
        'd-flex',
        'justify-content-between',
        'align-items-start',
        ...(!showTitleRow && !prominentBackground ? [`bg-${variant}`, 'bg-opacity-25', `border-${variant}`] : []),
    ].join(' ');
    const listGroupStyle = {
        '--bs-list-group-border-color': `rgba(var(--bs-${variant}-rgb), 1)`,
        ...(prominentBackground
            ? {
            '--bs-list-group-bg': `rgba(var(--bs-${variant}-rgb), .25)`,
            }
            : {}),
    } as CSSProperties;

    return (
        <div className={styles.resultWrapper}>
            <ListGroup className={styles.resultListGroup} style={listGroupStyle}>
                {
                    showTitleRow
                    ? (
                        <ListGroup.Item className={titleItemClassName}>
                            {hasTitle ? <p className="mb-0">{title}</p> : <span />}
                            {onClose !== undefined ? <CloseButton onClick={onClose} /> : null}
                        </ListGroup.Item>
                    )
                    : null
                }
                {
                    hasSql
                    ? (
                        <ListGroup.Item className={sqlItemClassName}>
                            <SqlListing sql={sql} className={styles.resultSql} />
                            {onClose !== undefined && !showTitleRow ? <CloseButton onClick={onClose} /> : null}
                        </ListGroup.Item>
                    )
                    : null
                }
                {main}
            </ListGroup>
        </div>
    );
}
