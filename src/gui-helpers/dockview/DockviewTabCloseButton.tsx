import { useTranslation } from 'react-i18next';

import { DockviewTabButton } from './DockviewTabButton';
import type { DockviewTabButtonVariant } from './DockviewTabButton';

export type DockviewTabCloseButtonVariant = DockviewTabButtonVariant;

export function DockviewTabCloseButton({ variant, onClick }: {
    variant: DockviewTabCloseButtonVariant,
    onClick: () => void,
}) {
    const { t } = useTranslation('common');

    return (
        <DockviewTabButton
            variant={variant}
            label={t('common.close')}
            onClick={onClick}
        >
            <i className='bi bi-x-lg' aria-hidden='true' />
        </DockviewTabButton>
    );
}
