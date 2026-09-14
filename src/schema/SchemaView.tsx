import styles from './SchemaView.module.css';

import type { ColInfo, TableInfo } from './model';
import { OverlayTrigger, Table, Tooltip } from 'react-bootstrap';
import type { TooltipProps } from 'react-bootstrap';
import React from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import type { SchemaStatus } from './status';

export function SchemaView({schemaStatus}: {schemaStatus: SchemaStatus}) {
    const { t } = useTranslation('common');

    switch (schemaStatus.kind) {
        case 'pending':
            return (
                <p className={`text-center`}>
                    <em>{t('common.loading')}</em>
                </p>
            );
        case 'failed':
            return (
                <p className={`text-center text-danger`}>
                    <em>{t('common.error')}: {schemaStatus.error.details}</em>
                </p>
            );
        case 'loaded':
            return (
                <div className={`${styles.schema}`}>
                    <div className={styles.tables}>
                        {
                            schemaStatus.data.length === 0 &&
                            <div>
                                <p className={`text-center`}><em>{t('schema.no_tables')}</em></p>
                            </div>
                        }
                        <Table borderless>
                            <tbody>
                                {
                                    schemaStatus.data.map((tableInfo) =>
                                        <TableInfoView key={tableInfo.name} tableInfo={tableInfo} />
                                    )
                                }
                            </tbody>
                        </Table>
                    </div>
                    <div className={styles.key}>
                        <table className={styles.keyTable}>
                            <tbody>
                                <tr>
                                    <td className={styles.keyMarker}><u>{t('schema.underlined')}</u></td>
                                    <td className={styles.keySeparator}>:</td>
                                    <td className={styles.keyLabel}>{t('schema.primary_key')}</td>
                                </tr>
                                <tr>
                                    <td className={styles.keyMarker}><span className={styles.keyArrow} aria-hidden='true'>&uarr;</span></td>
                                    <td className={styles.keySeparator}>:</td>
                                    <td className={styles.keyLabel}>{t('schema.foreign_key')}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            );

    }
}

function TableInfoView({tableInfo}: {tableInfo: TableInfo}) {
    const cols = tableInfo.cols.map(
        (col: ColInfo, index: number) =>
            <React.Fragment key={col.name}> 
                <ColInfoView table={tableInfo} col={col} />
                <span>{index < tableInfo.cols.length - 1 ? ', ' : ''}</span>
            </React.Fragment>
    );

    return (
        <tr>
            <td className={`${styles.tableName}`}>{tableInfo.name}</td>
            <td className={`${styles.tableCols}`}>
                ({cols})
            </td>
        </tr>
    )
}

function ColInfoView({table, col}: {table: TableInfo, col: ColInfo}) {
    const { t } = useTranslation('common');
    const classes = [];
    const foreignKeyReferences = table.foreignKeys[col.name] ?? [];
    const foreignKeyTooltip = foreignKeyReferences
        .map(reference => {
            switch (reference.kind) {
                case 'column':
                    return t('schema.foreign_key_reference', {
                        table: reference.foreignTable,
                        column: reference.foreignCol,
                    });
                case 'primary-key':
                    return t('schema.foreign_key_primary_key_reference', {
                        table: reference.foreignTable,
                    });
                default: { const _n: never = reference; return _n; }
            }
        })
        .join('\n');

    if (table.primaryKey.includes(col.name)) {
        classes.push(styles.primaryKey);
    }

    return (
        <span className={styles.column}>
            {
                foreignKeyReferences.length > 0 &&
                <OverlayTrigger
                    placement='top'
                    flip
                    delay={{ show: 0, hide: 0 }}
                    overlay={(props: TooltipProps) => <Tooltip {...props}>{foreignKeyTooltip}</Tooltip>}
                    trigger={['hover', 'focus']}
                >
                    <span
                        className={styles.foreignKeyArrow}
                        aria-label={foreignKeyTooltip}
                        tabIndex={0}
                    >
                        &uarr;
                    </span>
                </OverlayTrigger>
            }
            <span className={classNames(classes)}>{col.name}</span>
        </span>
    )
}
