import { ListGroup } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import type { SqlResult } from '../../database/api';
import { ResultTablesView } from './ResultTablesView';
import { GenericResultView } from './ResultView';

export function SqlResultView({ result, onClose }: { result: SqlResult, onClose?: () => void }) {
    const { t } = useTranslation('common');

    if (result.type === 'succ') {
        return (
            <GenericResultView
                variant='success'
                prominentBackground={false}
                sql={result.sql}
                onClose={onClose}
                main={<ResultTablesView tables={result.result} />}
            />
        );
    }
    else if (result.type === 'error') {
        return (
            <GenericResultView
                variant='danger'
                prominentBackground={false}
                sql={result.sql}
                onClose={onClose}
                main={(
                    <ListGroup.Item>
                        <p className='mb-0'>
                            <strong>{t('result.error_message')}:</strong> {result.message}
                        </p>
                    </ListGroup.Item>
                )}
            />
        );
    }
    else { const _n: never = result; return _n; }
}
