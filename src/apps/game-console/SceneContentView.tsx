import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Scene } from '../../game/model';
import { Base64Image } from '../../gui-helpers/base64-image/Base64Image';
import { CommandTriggerButton, CommandTriggerCancelButton } from '../../gui-helpers/command-controls/CommandControls';
import type { CommandControlStatus } from '../../gui-helpers/command-controls/command-control-status';
import { IconActionButton } from '../../gui-helpers/icon-button/IconActionButton';
import { InlineMarkup } from '../../gui-helpers/inline-markup/InlineMarkup';
import type { SceneStatus } from './game-progress';
import styles from './SceneContentView.module.css';

export function SceneContentView({
    scene,
    showNextButton,
    nextDisabled = false,
    nextStatus = 'idle',
    onNext = undefined,
    revealedOrdinaryTextHints = [],
}: {
    scene: Scene,
    showNextButton: boolean,
    nextDisabled?: boolean,
    nextStatus?: CommandControlStatus,
    onNext?: () => void,
    revealedOrdinaryTextHints?: string[],
}) {
    const { t } = useTranslation('game-console');
    const newestOrdinaryHintRef = useRef<HTMLDivElement>(null);
    const previousOrdinaryHintCountRef = useRef(revealedOrdinaryTextHints.length);

    useEffect(() => {
        if (revealedOrdinaryTextHints.length > previousOrdinaryHintCountRef.current) {
            newestOrdinaryHintRef.current?.scrollIntoView({ block: 'nearest' });
        }
        previousOrdinaryHintCountRef.current = revealedOrdinaryTextHints.length;
    }, [revealedOrdinaryTextHints.length]);

    return (
        <div className={styles.root}>
            <div className={styles.content}>
                {
                    scene.type === 'image'
                    ? (
                        <div className={styles.image}>
                            <Base64Image
                                base64string={scene.base64string}
                                mediaType={scene.mediaType}
                            />
                        </div>
                    )
                    : <InlineMarkup text={scene.text} />
                }
                {revealedOrdinaryTextHints.map((ordinaryHint, index) => (
                    <div
                        key={index}
                        ref={index === revealedOrdinaryTextHints.length - 1 ? newestOrdinaryHintRef : undefined}
                        className={styles.ordinaryHint}
                    >
                        <InlineMarkup text={ordinaryHint} />
                    </div>
                ))}
            </div>
            {
                showNextButton && onNext
                ? (
                    <div className={styles.actionRow}>
                        <CommandTriggerButton
                            variant='primary'
                            onClick={onNext}
                            disabled={nextDisabled}
                            status={nextStatus}
                        >
                            {t('next_scene')}
                        </CommandTriggerButton>
                    </div>
                )
                : null
            }
        </div>
    );
}

export function SceneStatusBar({
    sceneStatus,
    gameFinished,
    skippedTaskCount,
    solvedTaskCount,
    taskCount,
    onShowOrdinaryHint,
    onShowSolutionHint = () => {},
    onResetHints = () => {},
    onShowSolution,
    onCancelOrdinaryHint,
    onCancelSolutionHint,
    onCancelSolution,
    ordinaryHintStatus = 'idle',
    solutionHintStatus = 'idle',
    resetHintsStatus = 'idle',
    showOrdinaryHintButton = false,
    nextOrdinaryHintNumber = 1,
    ordinaryHintCount = 1,
    totalHintCount = 0,
    ordinaryHintDisabled = false,
    showSolutionHintButton = false,
    solutionHintDisabled = false,
    showResetHintsButton = false,
    solutionStatus = 'idle',
    disabled = false,
}: {
    sceneStatus: SceneStatus,
    gameFinished: boolean,
    skippedTaskCount: number,
    solvedTaskCount: number,
    taskCount: number,
    onShowOrdinaryHint: () => void,
    onShowSolutionHint?: () => void,
    onResetHints?: () => void,
    onShowSolution: () => void,
    onCancelOrdinaryHint: () => void,
    onCancelSolutionHint: () => void,
    onCancelSolution: () => void,
    ordinaryHintStatus?: CommandControlStatus,
    solutionHintStatus?: CommandControlStatus,
    resetHintsStatus?: CommandControlStatus,
    showOrdinaryHintButton?: boolean,
    nextOrdinaryHintNumber?: number,
    ordinaryHintCount?: number,
    totalHintCount?: number,
    ordinaryHintDisabled?: boolean,
    showSolutionHintButton?: boolean,
    solutionHintDisabled?: boolean,
    showResetHintsButton?: boolean,
    solutionStatus?: CommandControlStatus,
    disabled?: boolean,
}) {
    const { t } = useTranslation('game-console');
    const showSolutionButton = sceneStatus === 'task-solved-by-user'
        ? (
            <CommandTriggerCancelButton
                size='sm'
                compactSize='xs'
                variant='success-subtle'
                onClick={onShowSolution}
                onCancel={onCancelSolution}
                status={solutionStatus}
                disabled={disabled}
            >
                {t('sample_solution')}
            </CommandTriggerCancelButton>
        )
        : null;
    const hintControlVariant = sceneStatus === 'task-solved-by-sol-hint'
        ? 'success-subtle'
        : 'warning-subtle';
    const ordinaryHintLabel = ordinaryHintCount > 1
        ? t('ordinary_hint_progress', { current: nextOrdinaryHintNumber, total: ordinaryHintCount })
        : t('ordinary_hint');
    const resetHintsLabel = totalHintCount === 1
        ? t('reset_hint')
        : t('reset_hints');
    const hintControls = !gameFinished && (showResetHintsButton || showOrdinaryHintButton || showSolutionHintButton)
        ? <div className='d-flex align-items-center gap-2 ms-auto'>
            {showResetHintsButton && (
                <IconActionButton
                    size='sm'
                    compactSize='xs'
                    variant={hintControlVariant}
                    onClick={onResetHints}
                    status={resetHintsStatus}
                    disabled={disabled}
                    tooltipText={resetHintsLabel}
                >
                    <i className='bi bi-skip-backward' aria-hidden='true' />
                </IconActionButton>
            )}
            {showOrdinaryHintButton && (
                <CommandTriggerCancelButton
                    size='sm'
                    compactSize='xs'
                    variant={hintControlVariant}
                    onClick={onShowOrdinaryHint}
                    onCancel={onCancelOrdinaryHint}
                    status={ordinaryHintStatus}
                    disabled={disabled || ordinaryHintDisabled}
                >
                    {ordinaryHintLabel}
                </CommandTriggerCancelButton>
            )}
            {showSolutionHintButton && (
                <CommandTriggerCancelButton
                    size='sm'
                    compactSize='xs'
                    variant={hintControlVariant}
                    onClick={onShowSolutionHint}
                    onCancel={onCancelSolutionHint}
                    status={solutionHintStatus}
                    disabled={disabled || solutionHintDisabled}
                >
                    {t('show_solution')}
                </CommandTriggerCancelButton>
            )}
        </div>
        : null;

    if (gameFinished) {
        const hasSkippedTasks = skippedTaskCount > 0;

        return (
            <div className={`${styles.sceneStatusBar} ${styles.finishedStatusBar} ${hasSkippedTasks ? 'bg-warning' : 'bg-success'} bg-opacity-25`}>
                {
                    hasSkippedTasks
                        ? (
                            <>
                                <em><strong>{t('finished_with_skipped_status', { solved: solvedTaskCount, total: taskCount })}</strong></em>
                                <em>{t('finish_skipped_scenes_prompt')}</em>
                            </>
                        )
                        : <em><strong>{t('finished_status', { total: taskCount })}</strong></em>
                }
                {showSolutionButton}
            </div>
        );
    }

    switch (sceneStatus) {
        case 'task-solved-by-user':
            return (
                <div className={`${styles.sceneStatusBar} bg-success bg-opacity-25`}>
                    <em>{t('solved_task_status')}</em>
                    {showSolutionButton}
                </div>
            );
        case 'task-solved-by-sol-hint':
            return (
                <div className={`${styles.sceneStatusBar} bg-success bg-opacity-25`}>
                    <em>{t('solved_by_solution_hint_status')}</em>
                    {hintControls}
                </div>
            );
        case 'task-unsolved':
        case 'task-skipped':
            return (
                <div className={`${styles.sceneStatusBar} bg-warning bg-opacity-25`}>
                    <em>{t('unsolved_task_prompt')}</em>
                    {hintControls}
                </div>
            );
        case 'nontask-unseen':
        case 'nontask-seen':
            return null;
        default: {
            const _n: never = sceneStatus;
            return _n;
        }
    }
}
