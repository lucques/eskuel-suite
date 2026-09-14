import { useTranslation } from 'react-i18next';

import { SqlResultView } from '../../gui-helpers/result-view/SqlResultView';
import { SessionNotice } from '../../gui-helpers/session-notice/SessionNotice';
import type { ResultEntry } from './session';

export function ResultEntryView({ entry, onClose }: { entry: ResultEntry, onClose: () => void }) {
    const { t } = useTranslation('common');

    switch (entry.type) {
        case 'sql':
            return <SqlResultView result={entry.result} onClose={onClose} />;
        case 'database-reset-notice':
            return (
                <SessionNotice variant='warning' onClose={onClose}>
                    {t('session_notice.game_editor_database_reset')}
                </SessionNotice>
            );
        case 'database-source-load-cancelled-notice':
            return (
                <SessionNotice variant='warning' onClose={onClose}>
                    {t('session_notice.game_editor_source_load_cancelled')}
                </SessionNotice>
            );
        default: { const _n: never = entry; return _n; }
    }
}
