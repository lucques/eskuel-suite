import { ListGroup, Table } from 'react-bootstrap';
import type { SqlTable, SqlValue } from '../../database/api';
import { useTranslation } from 'react-i18next';
import styles from './ResultView.module.css';


export function ResultTablesView({tables, className}: {tables: SqlTable[], className?: string}) {
    const { t } = useTranslation('common');

    const renderCell = (c: SqlValue) => {
        if (c === null) {
            return <i>NULL</i>;
        }
        else if (typeof c === 'boolean') {
            return c ? 'TRUE' : 'FALSE';
        }
        else if (c instanceof Uint8Array) {
            return `\\x${Array.from(c, byte => byte.toString(16).padStart(2, '0')).join('')}`;
        }
        else {
            return c;
        }
    };

    return (
        tables.length === 0 ?
            <ListGroup.Item className={styles.centeredItem}>
                <em>{t('result.no_rows')}</em>
            </ListGroup.Item>
        :
            tables.map((table, i) => {
                return (
                    <ListGroup.Item key={i} className={className}>
                        <Table bordered striped className={`${styles.resultTable} border-secondary`}>
                            <thead>
                                <tr>
                                    {table.columns.map((col, i) => <th key={i}>{col}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {table.values.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{renderCell(cell)}</td>)}</tr>)}
                            </tbody>
                            {table.truncated === true
                                ? <thead>
                                    <tr>
                                        {table.columns.map((col, i) => <td key={i}>...</td>)}
                                    </tr>
                                </thead>
                                : null}
                        </Table>
                        {table.truncated === true
                            ? <div className={styles.centeredItem}><em>{t('result.truncated_rows', { count: table.values.length })}</em></div>
                            : null}
                    </ListGroup.Item>
                );
            })
    );
}
