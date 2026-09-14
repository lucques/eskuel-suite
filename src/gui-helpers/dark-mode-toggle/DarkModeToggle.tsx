import { useTranslation } from 'react-i18next';

import { useSettings } from '../../settings/settings';
import { IconActionButton } from '../icon-button/IconActionButton';
import type { SubtleButtonSize, SubtleButtonVariant } from '../subtle-button/SubtleButton';

export function DarkModeToggle({ size, compactSize, variant }: {
    size?: SubtleButtonSize,
    compactSize?: SubtleButtonSize,
    variant: SubtleButtonVariant,
}) {
    const { t } = useTranslation('common');
    const { darkMode, updateSettings } = useSettings();
    const accessibleName = darkMode
        ? t('common.switch_to_light_mode')
        : t('common.switch_to_dark_mode');

    return (
        <IconActionButton
            variant={variant}
            size={size}
            compactSize={compactSize}
            tooltipText={accessibleName}
            onClick={() => updateSettings({ themeMode: darkMode ? 'light' : 'dark' })}
        >
            {
                darkMode
                ? <i className='bi bi-moon' aria-hidden='true' />
                : <i className='bi bi-sun' aria-hidden='true' />
            }
        </IconActionButton>
    );
}
