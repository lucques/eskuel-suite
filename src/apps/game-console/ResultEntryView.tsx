import { ListGroup } from 'react-bootstrap';

import { useTranslation } from 'react-i18next';

import type { ResultEntry } from './session';
import { ResultTablesView } from '../../gui-helpers/result-view/ResultTablesView';
import { GenericResultView } from '../../gui-helpers/result-view/ResultView';
import { SqlListing } from '../../gui-helpers/sql-listing/SqlListing';
import { SessionNotice } from '../../gui-helpers/session-notice/SessionNotice';

export function ResultEntryView({entry, onClose}: {entry: ResultEntry, onClose: () => void}) {
    const { t } = useTranslation('common');
    const { t: tg } = useTranslation('game-console');

    switch (entry.type) {
        case 'database-reset-notice':
            if (entry.trigger === 'manual') {
                return (
                    <SessionNotice variant='warning' onClose={onClose}>
                        {t('session_notice.game_console_database_reset', { sceneNumber: entry.sceneIndex + 1 })}
                    </SessionNotice>
                );
            }
            else if (entry.trigger === 'cancellation') {
                return (
                    <SessionNotice variant='warning' onClose={onClose}>
                        {t('session_notice.game_console_database_reset_after_cancellation', { sceneNumber: entry.sceneIndex + 1 })}
                    </SessionNotice>
                );
            }
            else { const _n: never = entry.trigger; return _n; }
        case 'sql':
            if (entry.res.type === 'succ') {
                return (
                    <GenericResultView
                        variant='success'
                        prominentBackground={false}
                        sql={entry.res.sql}
                        onClose={onClose}
                        main={<ResultTablesView tables={entry.res.result} />}
                    />
                );
            }
            else {
                return (
                    <GenericResultView
                        variant='danger'
                        prominentBackground={false}
                        sql={entry.res.sql}
                        onClose={onClose}
                        main={
                            <ListGroup.Item>
                                <p className='mb-0'><strong>{t('result.error_message')}:</strong> {entry.res.message}</p>
                            </ListGroup.Item>
                        }
                    />
                );
            }
        case 'correct':
            if (entry.res.type === 'succ') {
                return (
                    <GenericResultView
                        variant='success'
                        prominentBackground={true}
                        title={<strong>{tg('result_correct')}</strong>}
                        sql={entry.res.sql}
                        onClose={onClose}
                        main={<ResultTablesView tables={entry.res.result} />}
                    />
                );
            }
            else {
                return (
                    <GenericResultView
                        variant='success'
                        prominentBackground={true}
                        title={<strong>{tg('result_correct')}</strong>}
                        sql={entry.res.sql}
                        onClose={onClose}
                        main={
                            <ListGroup.Item>
                                <p className='mb-0'><strong>{t('result.error_message')}:</strong> {entry.res.message}</p>
                            </ListGroup.Item>
                        }
                    />
                );
            }
        case 'miss':
            if (entry.res.type === 'succ') {
                return (
                    <GenericResultView
                        variant='warning'
                        prominentBackground={true}
                        title={<em>{tg('result_not_solved')}</em>}
                        sql={entry.res.sql}
                        onClose={onClose}
                        main={<ResultTablesView tables={entry.res.result} />}
                    />
                );
            }
            else {
                return (
                    <GenericResultView
                        variant='danger'
                        prominentBackground={true}
                        title={<em>{tg('result_not_solved')}</em>}
                        sql={entry.res.sql}
                        onClose={onClose}
                        main={
                            <ListGroup.Item>
                                <p className='mb-0'><strong>{t('result.error_message')}:</strong> {entry.res.message}</p>
                            </ListGroup.Item>
                        }
                    />
                );
            }
        case 'sample-sol':
            if (entry.res.type === 'succ') {
                return (
                    <GenericResultView
                        variant='info'
                        prominentBackground={true}
                        title={<em>{tg('sample_solution')}</em>}
                        sql={entry.res.sql}
                        onClose={onClose}
                        main={<ResultTablesView tables={entry.res.result} />}
                    />
                );
            }
            else {
                return (
                    <GenericResultView
                        variant='info'
                        prominentBackground={true}
                        title={<em>{tg('sample_solution')}</em>}
                        sql={entry.res.sql}
                        onClose={onClose}
                        main={
                            <ListGroup.Item>
                                <p className='mb-0'><strong>{t('result.error_message')}:</strong> {entry.res.message}</p>
                            </ListGroup.Item>
                        }
                    />
                );
            }
        case 'sol-hint':
            if (entry.res.type === 'succ') {
                return (
                    <GenericResultView
                        variant='info'
                        prominentBackground={true}
                        title={<em>{tg('result_solution_hint')}</em>}
                        sql={entry.res.sql}
                        onClose={onClose}
                        main={<ResultTablesView tables={entry.res.result} />}
                    />
                );
            }
            else {
                return (
                    <GenericResultView
                        variant='info'
                        prominentBackground={true}
                        title={<em>{tg('result_solution_hint')}</em>}
                        sql={entry.res.sql}
                        onClose={onClose}
                        main={
                            <ListGroup.Item>
                                <p className='mb-0'><strong>{t('result.error_message')}:</strong> {entry.res.message}</p>
                            </ListGroup.Item>
                        }
                    />
                );
            }
        case 'ordinary-hint-select':
            if (entry.expectedResult.type === 'succ') {
                return (
                    <GenericResultView
                        variant='info'
                        prominentBackground={true}
                        title={<em>{tg('result_ordinary_expected_result_hint')}</em>}
                        onClose={onClose}
                        main={<ResultTablesView tables={entry.expectedResult.result} />}
                    />
                );
            }
            else {
                return (
                    <GenericResultView
                        variant='info'
                        prominentBackground={true}
                        title={<em>{tg('result_ordinary_expected_result_hint')}</em>}
                        onClose={onClose}
                        main={
                            <ListGroup.Item>
                                <p className='mb-0'><strong>{t('result.error_message')}:</strong> {entry.expectedResult.message}</p>
                            </ListGroup.Item>
                        }
                    />
                );
            }
        case 'ordinary-hint-manipulate':
            if (entry.checkResult.type === 'succ') {
                return (
                    <GenericResultView
                        variant='info'
                        prominentBackground={true}
                        title={<em>{tg('ordinary_hint')}</em>}
                        onClose={onClose}
                        main={
                            <>
                                <ListGroup.Item>
                                    <p>{tg('result_ordinary_manipulate_hint_query_intro')}</p>
                                    <SqlListing sql={entry.checkResult.sql} />
                                    <p>{tg('result_ordinary_manipulate_hint_query_outro')}</p>
                                </ListGroup.Item>
                                <ResultTablesView tables={entry.checkResult.result} />
                            </>
                        }
                    />
                );
            }
            else {
                return (
                    <GenericResultView
                        variant='info'
                        prominentBackground={true}
                        title={<em>{tg('ordinary_hint')}</em>}
                        onClose={onClose}
                        main={
                            <>
                                <ListGroup.Item>
                                    <p>{tg('result_ordinary_manipulate_hint_query_intro')}</p>
                                    <SqlListing sql={entry.checkResult.sql} />
                                    <p>{tg('result_ordinary_manipulate_hint_query_outro')}</p>
                                </ListGroup.Item>
                                <ListGroup.Item>
                                    <p className='mb-0'><strong>{t('result.error_message')}:</strong> {entry.checkResult.message}</p>
                                </ListGroup.Item>
                            </>
                        }
                    />
                );
            }
        default: {
            const _n: never = entry;
            return _n;
        }
    }
}
