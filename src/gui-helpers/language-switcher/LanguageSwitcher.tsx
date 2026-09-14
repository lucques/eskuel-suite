import { ButtonGroup, Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { SubtleButton } from '../subtle-button/SubtleButton';
import type { SubtleButtonSize, SubtleButtonVariant } from '../subtle-button/SubtleButton';
import { resolveSupportedLanguage, supportedLanguages } from '../../i18n/languages';
import { useSettings } from '../../settings/settings';
import type { Language } from '../../settings/settings';
import styles from './LanguageSwitcher.module.css';

const languageLabels = {
    de: { full: 'Deutsch', compact: 'DE' },
    en: { full: 'English', compact: 'EN' },
} satisfies Record<Language, { full: string, compact: string }>;

function LanguageLabel({ language }: { language: Language }) {
    const label = languageLabels[language];

    return (
        <>
            <span className={styles.fullLabel}>{label.full}</span>
            <span className={styles.compactLabel}>{label.compact}</span>
        </>
    );
}

export function LanguageSwitcher({ compactSize, variant }: {
    compactSize?: SubtleButtonSize,
    variant: SubtleButtonVariant,
}) {
    const { i18n } = useTranslation();
    const { settings, updateSettings } = useSettings();
    const activeLanguage = settings.language ?? resolveSupportedLanguage(i18n.resolvedLanguage ?? i18n.language);

    const switchLanguage = (newLanguage: Language) => {
        if (newLanguage !== settings.language) {
            updateSettings({ language: newLanguage });
        }
    }

    return (
        <Dropdown as={ButtonGroup}>
            <Dropdown.Toggle
                as={SubtleButton}
                variant={variant}
                compactSize={compactSize}
                id='language-switcher'
                style={{ justifyContent: 'center', alignItems: 'center' }}
            >
                <LanguageLabel language={activeLanguage} />
            </Dropdown.Toggle>
            <Dropdown.Menu>
                {supportedLanguages.map(language => (
                    <Dropdown.Item key={language} eventKey={language} onClick={() => switchLanguage(language)}>
                        <LanguageLabel language={language} />
                    </Dropdown.Item>
                ))}
            </Dropdown.Menu>
        </Dropdown>
    );
}
