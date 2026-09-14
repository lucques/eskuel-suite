import { useTranslation } from 'react-i18next';
import { ButtonGroup } from 'react-bootstrap';
import { IconActionButton } from '../../gui-helpers/icon-button/IconActionButton';
import { CommandTriggerButton } from '../../gui-helpers/command-controls/CommandControls';
import { getCommandControlStatus } from '../../gui-helpers/command-controls/command-control-status';
import styles from './SceneNavbar.module.css';
import type { GameConsoleCommandStatus } from './session';

export function SceneNavbar({
    current,
    total,
    canGoPrevious,
    canGoNext,
    canSkip,
    commandStatus,
    skippedCount,
    onPrevious,
    onNext,
    onSkip,
    onReset,
}: {
    current: number,
    total: number,
    canGoPrevious: boolean,
    canGoNext: boolean,
    canSkip: boolean,
    commandStatus: GameConsoleCommandStatus,
    skippedCount: number,
    onPrevious: () => void,
    onNext: () => void,
    onSkip: () => void,
    onReset: () => void,
}) {
    const { t } = useTranslation('game-console');
    const commandInProgress = commandStatus.kind !== 'idle';
    const previousStatus = getCommandControlStatus(commandStatus, command => command.type === 'previous-scene');
    const nextStatus = getCommandControlStatus(
        commandStatus,
        command => command.type === 'next-scene' && command.origin === 'navbar',
    );
    const skipStatus = getCommandControlStatus(commandStatus, command => command.type === 'skip-scene');
    const restartStatus = getCommandControlStatus(commandStatus, command => command.type === 'restart');

    return (
        <div className={styles.sceneNavbar}>
            <div className={styles.left}>
                <div>
                    <span className={styles.sceneTitle}>
                        {t('scene_title', {
                            current,
                            total,
                        })}
                    </span>
                    <span
                        className={styles.compactSceneTitle}
                        aria-label={t('scene_title', { current, total })}
                    >
                        {current} / {total}
                    </span>
                </div>
            </div>
            <div className={styles.center}>
                <div className={styles.centerLeft}>
                    <div>
                        <IconActionButton
                            size='sm'
                            variant='primary-subtle'
                            disabled={commandInProgress || !canGoPrevious}
                            onClick={onPrevious}
                            status={previousStatus}
                            tooltipText={t('previous_scene')}
                        >
                            <i className='bi bi-chevron-left' />
                        </IconActionButton>
                        <ButtonGroup>
                            <IconActionButton
                                size='sm'
                                variant='primary-subtle'
                                disabled={commandInProgress || !canGoNext}
                                onClick={onNext}
                                status={nextStatus}
                                tooltipText={t('next_scene')}
                            >
                                <i className='bi bi-chevron-right' />
                            </IconActionButton>
                            {
                                canSkip
                                ? (
                                    <CommandTriggerButton
                                        size='sm'
                                        variant='primary-subtle'
                                        onClick={onSkip}
                                        disabled={commandInProgress}
                                        status={skipStatus}
                                    >
                                        {t('skip_scene')}
                                    </CommandTriggerButton>
                                )
                                : null
                            }
                        </ButtonGroup>
                        {
                            skippedCount > 0 &&
                            <small><em>{t('skipped_scenes', { count: skippedCount })}</em></small>
                        }
                    </div>
                </div>
            </div>
            <div className={styles.right}>
                <div>
                    <CommandTriggerButton
                        size='sm'
                        variant='primary-subtle'
                        onClick={onReset}
                        disabled={commandInProgress}
                        status={restartStatus}
                    >
                        {t('restart')}
                    </CommandTriggerButton>
                </div>
            </div>
        </div>
    );
}
