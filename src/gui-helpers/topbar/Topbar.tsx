import classNames from 'classnames';
import { Children, isValidElement, ReactElement, ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AboutModal } from '../about-modal/AboutModal';
import { IconActionButton } from '../icon-button/IconActionButton';
import { SubtleButton } from '../subtle-button/SubtleButton';
import styles from './Topbar.module.css';

type TopbarSlotProps = {
    children?: ReactNode;
};

type TopbarProps = {
    children?: ReactNode;
};

function TopbarTitle({ children }: TopbarSlotProps) {
    return <>{children}</>;
}

function TopbarActionsLeft({ children }: TopbarSlotProps) {
    return <>{children}</>;
}

function TopbarActionsRight({ children }: TopbarSlotProps) {
    return <>{children}</>;
}

function TopbarLinksRight({ children }: TopbarSlotProps) {
    return <>{children}</>;
}

function isSlotElement(
    child: ReactNode,
    slot: (props: TopbarSlotProps) => ReactElement
): child is ReactElement<TopbarSlotProps> {
    return isValidElement(child) && child.type === slot;
}

export function Topbar({ children }: TopbarProps) {
    const { t } = useTranslation('common');
    const actionsId = useId();
    const [actionsExpanded, setActionsExpanded] = useState(false);
    const [aboutModalOpen, setAboutModalOpen] = useState(false);
    const childArray = Children.toArray(children);
    
    const title = childArray.find((child) => isSlotElement(child, TopbarTitle));
    const actionsLeft = childArray.find((child) => isSlotElement(child, TopbarActionsLeft));
    const actionsRight = childArray.find((child) => isSlotElement(child, TopbarActionsRight));
    const linksRight = childArray.find((child) => isSlotElement(child, TopbarLinksRight));

    return (
        <>
            <div className={styles.topbar}>
                <div className={styles.topbarTitle}>
                    <div>
                        {title?.props.children}
                    </div>
                </div>
                <div
                    id={actionsId}
                    className={classNames(
                        styles.topbarActions,
                        actionsExpanded ? styles.topbarActionsExpanded : undefined,
                    )}
                >
                    <div className={styles.topbarActionsLeft}>
                        <div>
                            {actionsLeft?.props.children}
                        </div>
                    </div>
                    <div className={styles.topbarActionsRight}>
                        <div>
                            {actionsRight?.props.children}
                            <IconActionButton
                                onClick={() => setAboutModalOpen(true)}
                                tooltipText={t('about.title')}
                                variant='primary-subtle'
                                compactSize='sm'
                            >
                                <i className='bi bi-info-circle' aria-hidden='true' />
                            </IconActionButton>
                        </div>
                    </div>
                    {linksRight === undefined
                        ? null
                        : <div className={styles.topbarNavigationMobile}>
                            <div>
                                {linksRight.props.children}
                            </div>
                        </div>}
                </div>
                {linksRight === undefined
                    ? null
                    : <div className={styles.topbarNavigation}>
                        <div>
                            {linksRight.props.children}
                        </div>
                    </div>}
                <SubtleButton
                    className={styles.topbarToggle}
                    variant='primary-subtle'
                    compactSize='sm'
                    aria-controls={actionsId}
                    aria-expanded={actionsExpanded}
                    aria-label={t('common.menu')}
                    title={t('common.menu')}
                    onClick={() => setActionsExpanded(expanded => !expanded)}
                >
                    <i
                        className={classNames('bi', actionsExpanded ? 'bi-x-lg' : 'bi-list')}
                        aria-hidden='true'
                    />
                </SubtleButton>
            </div>
            <AboutModal
                show={aboutModalOpen}
                onHide={() => setAboutModalOpen(false)}
            />
        </>
    );
}

export {
    TopbarActionsLeft,
    TopbarActionsRight,
    TopbarLinksRight,
    TopbarTitle
};
