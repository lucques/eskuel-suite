import { ReactNode } from 'react';
import { ButtonGroup, Dropdown, OverlayTrigger, Tooltip } from 'react-bootstrap';
import type { TooltipProps } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { SubtleButton } from '../subtle-button/SubtleButton';
import type { SubtleButtonSize, SubtleButtonVariant } from '../subtle-button/SubtleButton';

export type LayoutOption<Layout extends string> = {
    value: Layout;
    label: ReactNode;
};

export function LayoutSwitcher<Layout extends string>({
    layouts,
    onSelect,
    id = 'layout-switcher',
    ariaLabel = undefined,
    buttonContent = <i className='bi bi-layout-split' />,
    compactSize,
    variant,
}: {
    layouts: readonly LayoutOption<Layout>[];
    onSelect: (layout: Layout) => void;
    id?: string;
    ariaLabel?: string;
    buttonContent?: ReactNode;
    compactSize?: SubtleButtonSize;
    variant: SubtleButtonVariant;
}) {
    const { t } = useTranslation('common');
    const tooltipText = t('layout.switch');

    const toggle = (
        <Dropdown.Toggle
            as={SubtleButton}
            variant={variant}
            compactSize={compactSize}
            id={id}
            aria-label={ariaLabel ?? tooltipText}
            style={{ justifyContent: 'center', alignItems: 'center' }}
        >
            <span>{buttonContent}</span>
        </Dropdown.Toggle>
    );

    return (
        <Dropdown as={ButtonGroup}>
            <OverlayTrigger
                placement='bottom'
                flip
                delay={{ show: 0, hide: 0 }}
                overlay={(props: TooltipProps) => <Tooltip {...props}>{tooltipText}</Tooltip>}
                trigger={['hover', 'focus']}
            >
                {toggle}
            </OverlayTrigger>
            <Dropdown.Menu>
                {layouts.map((layout, index) => (
                    <Dropdown.Item
                        key={layout.value}
                        eventKey={`${index + 1}`}
                        onClick={() => onSelect(layout.value)}
                    >
                        {layout.label}
                    </Dropdown.Item>
                ))}
            </Dropdown.Menu>
        </Dropdown>
    );
}
