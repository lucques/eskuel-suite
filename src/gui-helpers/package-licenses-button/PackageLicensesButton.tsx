import { useTranslation } from 'react-i18next';

import { SubtleButton } from '../subtle-button/SubtleButton';
import type { SubtleButtonVariant } from '../subtle-button/SubtleButton';

export function PackageLicensesButton({ className, onClick, variant }: {
    className?: string;
    onClick: () => void;
    variant?: SubtleButtonVariant;
}) {
    const { t } = useTranslation('common');

    return (
        <SubtleButton
            type='button'
            size='sm'
            className={className}
            onClick={onClick}
            variant={variant}
        >
            <i className='bi bi-box-seam me-2' aria-hidden='true' />
            {t('common.licenses')}
        </SubtleButton>
    );
}
