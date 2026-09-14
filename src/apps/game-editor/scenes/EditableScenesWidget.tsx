import { DragDropContext, Draggable, Droppable, type DraggableProvidedDragHandleProps, type DropResult } from '@hello-pangea/dnd';
import classNames from 'classnames';
import type { TFunction } from 'i18next';
import type { ReactElement, ReactNode } from 'react';
import { useRef } from 'react';
import { Badge, Button, ButtonGroup, Dropdown, ListGroup, OverlayTrigger, Tooltip } from 'react-bootstrap';
import type { TooltipProps } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import type { OrdinaryHint, ImageScene, ManipulateScene, Scene, SelectScene, TextScene } from '../../../game/model';
import { Base64Image } from '../../../gui-helpers/base64-image/Base64Image';
import { BareIconButton } from '../../../gui-helpers/bare-icon-button/BareIconButton';
import { SqlListing } from '../../../gui-helpers/sql-listing/SqlListing';
import { SubtleButton } from '../../../gui-helpers/subtle-button/SubtleButton';
import styles from './EditableScenesWidget.module.css';
import type { Editable, EditableScene } from './editable-scene';
import type { SceneTestStatus } from '../testing';
import type { GameEditorCommandStatus } from '../session';
import { CommandTriggerCancelButton } from '../../../gui-helpers/command-controls/CommandControls';
import { getCommandControlStatus } from '../../../gui-helpers/command-controls/command-control-status';
import { InlineMarkup } from '../../../gui-helpers/inline-markup/InlineMarkup';
import { formatFileSize } from '../../../gui-helpers/file-size';

export function EditableScenesWidget({
    scenes,
    draggingEnabled,
    onEditSceneStart,
    onAddSceneStart,
    onDeleteScene,
    onReorderScenes,
    undoEnabled,
    redoEnabled,
    gameFileSizeBytes,
    maxGameFileBytes,
    onUndo,
    onRedo,
    sceneTestStatuses,
    showTestingControls,
    testingEnabled,
    commandStatus,
    onCancelCommand,
    onInspectSceneStatus,
    onTestScene,
    onTestScenesUpTo,
}: {
    scenes: EditableScene[],
    draggingEnabled: boolean,
    onEditSceneStart: (scene: EditableScene) => void,
    onAddSceneStart: (index: number) => void,
    onDeleteScene: (scene: EditableScene) => void,
    onReorderScenes: (start: number, end: number) => void,
    undoEnabled: boolean,
    redoEnabled: boolean,
    gameFileSizeBytes: number,
    maxGameFileBytes: number,
    onUndo: () => void,
    onRedo: () => void,
    sceneTestStatuses: SceneTestStatus[],
    showTestingControls: boolean,
    testingEnabled: boolean,
    commandStatus: GameEditorCommandStatus,
    onCancelCommand: () => void,
    onInspectSceneStatus: (scene: EditableScene) => void,
    onTestScene: (scene: EditableScene) => void,
    onTestScenesUpTo: (scene: EditableScene) => void,
}) {
    const { t } = useTranslation('game-editor');
    const scenesContainerRef = useRef<HTMLDivElement>(null);
    const sceneCounts: Record<Scene['type'], number> = {
        text: 0,
        image: 0,
        select: 0,
        manipulate: 0,
    };
    scenes.forEach(scene => {
        sceneCounts[scene.type]++;
    });

    const onDragStart = () => {
        scenesContainerRef.current?.classList.add(styles.editableScenesContainerDragging);
    };

    const onDragEnd = (result: DropResult) => {
        scenesContainerRef.current?.classList.remove(styles.editableScenesContainerDragging);

        if (result.destination === null) {
            // The scene was dropped outside the list, so its position remains unchanged.
        }
        else {
            onReorderScenes(result.source.index, result.destination.index);
        }
    };

    const sceneElements: ReactElement[] = [
        <SceneInsertionControl
            key='insert-first'
            atEnd={scenes.length === 0}
            onAdd={() => onAddSceneStart(0)}
        />,
    ];
    const firstTestableSceneIndex = scenes.findIndex(isSceneTestable);
    const showGameFileSizeWarning = gameFileSizeBytes > maxGameFileBytes * 0.75;
    scenes.forEach((scene, index) => {
        sceneElements.push(
            <Draggable key={scene.key} draggableId={scene.key} index={index} isDragDisabled={!draggingEnabled}>
                {provided => (
                    <div
                        ref={provided.innerRef}
                        className={styles.editableSceneWithTestingControls}
                        {...provided.draggableProps}
                    >
                        <EditableSceneView
                            index={index}
                            scene={scene}
                            deletable={scenes.length > 1}
                            dragHandleProps={provided.dragHandleProps}
                            onEditSceneStart={onEditSceneStart}
                            onDeleteScene={onDeleteScene}
                        />
                        {showTestingControls
                            ? <SceneTestingControls
                                index={index}
                                scene={scene}
                                status={sceneTestStatuses[index]}
                                testingEnabled={testingEnabled}
                                commandStatus={commandStatus}
                                onCancelCommand={onCancelCommand}
                                testUpToHereAvailable={firstTestableSceneIndex >= 0 && index >= firstTestableSceneIndex}
                                onInspect={() => onInspectSceneStatus(scene)}
                                onTest={() => onTestScene(scene)}
                                onTestUpToHere={() => onTestScenesUpTo(scene)}
                            />
                            : null}
                    </div>
                )}
            </Draggable>,
        );
        sceneElements.push(
            <SceneInsertionControl
                key={`insert-after-${scene.key}`}
                atEnd={index === scenes.length - 1}
                onAdd={() => onAddSceneStart(index + 1)}
            />,
        );
    });

    return (
        <div
            ref={scenesContainerRef}
            className={classNames(
                styles.editableScenesContainer,
                !showTestingControls && styles.editableScenesContainerWithoutTestingControls,
            )}
        >
            <div className={styles.sceneToolbar}>
                <div className={styles.sceneTypeCounts}>
                    {sceneCounts.text === 0
                        ? null
                        : <Badge pill bg='' className={classNames('border', 'text-body', 'fw-normal', getSceneColorClassNames('text', 'prominent'))}>
                            {t('scene_count_text', { count: sceneCounts.text })}
                        </Badge>}
                    {sceneCounts.image === 0
                        ? null
                        : <Badge pill bg='' className={classNames('border', 'text-body', 'fw-normal', getSceneColorClassNames('image', 'prominent'))}>
                            {t('scene_count_image', { count: sceneCounts.image })}
                        </Badge>}
                    {sceneCounts.select === 0
                        ? null
                        : <Badge pill bg='' className={classNames('border', 'text-body', 'fw-normal', getSceneColorClassNames('select', 'prominent'))}>
                            {t('scene_count_select', { count: sceneCounts.select })}
                        </Badge>}
                    {sceneCounts.manipulate === 0
                        ? null
                        : <Badge pill bg='' className={classNames('border', 'text-body', 'fw-normal', getSceneColorClassNames('manipulate', 'prominent'))}>
                            {t('scene_count_manipulate', { count: sceneCounts.manipulate })}
                        </Badge>}
                    {showGameFileSizeWarning
                        ? <Badge
                            pill
                            bg='warning'
                            className='fw-normal'
                            data-testid='game-file-size-estimate'
                        >
                            {t('game_file_size_estimate', {
                                actual: formatFileSize(gameFileSizeBytes),
                                limit: formatFileSize(maxGameFileBytes),
                            })}
                        </Badge>
                        : null}
                </div>
                <div className={styles.sceneHistoryActions}>
                    <SceneHistoryActionButton
                        label={t('undo')}
                        disabled={!undoEnabled}
                        onClick={onUndo}
                    >
                        <i className='bi bi-arrow-counterclockwise' aria-hidden='true' />
                    </SceneHistoryActionButton>
                    <SceneHistoryActionButton
                        label={t('redo')}
                        disabled={!redoEnabled}
                        onClick={onRedo}
                    >
                        <i className='bi bi-arrow-clockwise' aria-hidden='true' />
                    </SceneHistoryActionButton>
                </div>
            </div>
            <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
                <Droppable droppableId='droppable'>
                    {provided => (
                        <div
                            ref={provided.innerRef}
                            className={styles.editableScenesList}
                            {...provided.droppableProps}
                        >
                            {sceneElements}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        </div>
    );
}

function SceneHistoryActionButton({
    children,
    disabled,
    label,
    onClick,
}: {
    children: ReactNode,
    disabled: boolean,
    label: string,
    onClick: () => void,
}) {
    return (
        <OverlayTrigger
            placement='bottom'
            flip
            delay={{ show: 0, hide: 0 }}
            overlay={(overlayProps: TooltipProps) => (
                <Tooltip {...overlayProps}>{label}</Tooltip>
            )}
            trigger={['hover', 'focus']}
        >
            <span className={styles.sceneHistoryActionTooltipTarget}>
                <SubtleButton
                    type='button'
                    size='sm'
                    variant='primary-subtle'
                    aria-label={label}
                    disabled={disabled}
                    onClick={onClick}
                >
                    {children}
                </SubtleButton>
            </span>
        </OverlayTrigger>
    );
}

function SceneTestingControls({
    index,
    scene,
    status,
    testingEnabled,
    commandStatus,
    onCancelCommand,
    testUpToHereAvailable,
    onInspect,
    onTest,
    onTestUpToHere,
}: {
    index: number,
    scene: EditableScene,
    status: SceneTestStatus,
    testingEnabled: boolean,
    commandStatus: GameEditorCommandStatus,
    onCancelCommand: () => void,
    testUpToHereAvailable: boolean,
    onInspect: () => void,
    onTest: () => void,
    onTestUpToHere: () => void,
}) {
    const { t } = useTranslation('game-editor');
    const statusPresentation = getStatusPresentation(status, t);
    const statusLabel = t('scene_test_status', { status: statusPresentation.label });
    const statusClickable = status.kind === 'select-result' || status.kind === 'manipulate-result';
    const sceneTestable = isSceneTestable(scene);
    const testStatus = getCommandControlStatus(
        commandStatus,
        command => command.type === 'test-scene' && command.index === index,
    );
    const testUpToHereStatus = getCommandControlStatus(
        commandStatus,
        command => command.type === 'test-scenes-up-to' && command.index === index,
    );
    const activeTaskTestStatus = testStatus !== 'idle' ? testStatus : testUpToHereStatus;

    const testUpToHereButton = testUpToHereAvailable
        ? <SceneTestingButtonTooltip label={t('scene_test_up_to_here')}>
            <CommandTriggerCancelButton
                size='sm'
                variant='secondary'
                disabled={!testingEnabled}
                onClick={onTestUpToHere}
                onCancel={onCancelCommand}
                status={testUpToHereStatus}
                aria-label={t('scene_test_up_to_here')}
                data-testid='scene-test-up-to-here-button'
            >
                <i className={classNames(styles.sceneTestingActionIndicator, 'bi', 'bi-skip-end-fill')} aria-hidden='true' />
            </CommandTriggerCancelButton>
        </SceneTestingButtonTooltip>
        : null;

    let controls: ReactElement | null;
    if (sceneTestable) {
        const mainButton = activeTaskTestStatus !== 'idle'
            ? <CommandTriggerCancelButton
                size='sm'
                variant='secondary'
                disabled={!testingEnabled}
                onClick={onTest}
                onCancel={onCancelCommand}
                status={activeTaskTestStatus}
                aria-label={statusLabel}
                data-testid='scene-test-status'
            >
                <i className={statusPresentation.iconClassName} aria-hidden='true' />
            </CommandTriggerCancelButton>
            : statusClickable
                ? <SceneTestingButtonTooltip label={statusLabel}>
                    <Button
                        className={classNames(
                            `bg-${statusPresentation.variant}`,
                            'bg-opacity-25',
                            `border-${statusPresentation.variant}`,
                            'text-body',
                        )}
                        variant={statusPresentation.variant}
                        disabled={!testingEnabled}
                        onClick={onInspect}
                        aria-label={statusLabel}
                        data-testid='scene-test-status'
                    >
                        <i className={statusPresentation.iconClassName} aria-hidden='true' />
                    </Button>
                </SceneTestingButtonTooltip>
                : <SceneTestingButtonTooltip label={t('scene_test')}>
                    <CommandTriggerCancelButton
                        className={styles.unknownSceneTestButton}
                        size='sm'
                        variant='secondary'
                        disabled={!testingEnabled}
                        onClick={onTest}
                        onCancel={onCancelCommand}
                        status={testStatus}
                        aria-label={t('scene_test')}
                        data-testid='scene-test-status'
                    >
                        <span className={styles.unknownSceneTestIndicator}>
                            <i className={classNames(styles.unknownSceneStatusIcon, statusPresentation.iconClassName)} aria-hidden='true' />
                            <i className={classNames(styles.unknownSceneTestIcon, 'bi', 'bi-play-fill')} aria-hidden='true' />
                        </span>
                    </CommandTriggerCancelButton>
                </SceneTestingButtonTooltip>;

        controls = (
            <Dropdown className={styles.sceneTestingDropdown}>
                <ButtonGroup
                    vertical
                    size='sm'
                    className={styles.sceneTestingButtonGroup}
                    aria-label={t('scene_testing_controls')}
                >
                    {mainButton}
                    <Dropdown.Toggle
                        as={SubtleButton}
                        className={styles.sceneTestingDropdownToggle}
                        split
                        size='sm'
                        variant='secondary'
                        disabled={!testingEnabled}
                        aria-label={t('scene_test_options')}
                        data-testid='scene-test-options'
                    />
                </ButtonGroup>
                <Dropdown.Menu align='end'>
                    <Dropdown.Item onClick={onTest} disabled={!testingEnabled}>
                        <i className='bi bi-play-fill me-2' aria-hidden='true' />
                        {t('scene_test')}
                    </Dropdown.Item>
                    <Dropdown.Item onClick={onTestUpToHere} disabled={!testingEnabled || !testUpToHereAvailable}>
                        <i className='bi bi-skip-end-fill me-2' aria-hidden='true' />
                        {t('scene_test_up_to_here')}
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown>
        );
    }
    else {
        controls = testUpToHereButton;
    }

    return (
        <div
            className={styles.sceneTestingControls}
            data-testid='scene-testing-controls'
        >
            {controls}
        </div>
    );
}

function SceneTestingButtonTooltip({ children, label }: {
    children: ReactElement,
    label: string,
}) {
    return (
        <OverlayTrigger
            placement='left'
            flip
            delay={{ show: 0, hide: 0 }}
            overlay={(overlayProps: TooltipProps) => (
                <Tooltip {...overlayProps}>{label}</Tooltip>
            )}
            trigger={['hover', 'focus']}
        >
            {children}
        </OverlayTrigger>
    );
}

function isSceneTestable(scene: Scene): boolean {
    switch (scene.type) {
        case 'text':
        case 'image':
            return false;
        case 'select':
        case 'manipulate':
            return true;
        default: { const _n: never = scene; return _n; }
    }
}

function getStatusPresentation(status: SceneTestStatus, t: TFunction<'game-editor'>): {
    label: string,
    variant: 'secondary' | 'success' | 'danger' | 'warning',
    iconClassName: string,
} {
    switch (status.kind) {
        case 'none':
            return { label: t('scene_test_status_none'), variant: 'secondary', iconClassName: 'bi bi-slash-circle' };
        case 'unknown':
            return { label: t('scene_test_status_unknown'), variant: 'secondary', iconClassName: 'bi bi-question-circle' };
        case 'select-result':
            return status.result.type === 'succ'
                ? { label: t('scene_test_status_select_result'), variant: 'success', iconClassName: 'bi bi-check-circle' }
                : { label: t('scene_test_status_select_error'), variant: 'danger', iconClassName: 'bi bi-x-circle' };
        case 'manipulate-result': {
            const outcome = status.outcome;
            switch (outcome) {
                case 'sql-sol-error':
                    return { label: t('scene_test_status_sql_solution_error'), variant: 'danger', iconClassName: 'bi bi-x-circle' };
                case 'sql-check-error':
                    return { label: t('scene_test_status_sql_check_error'), variant: 'danger', iconClassName: 'bi bi-x-circle' };
                case 'sql-check-no-witness':
                    return { label: t('scene_test_status_no_witness'), variant: 'warning', iconClassName: 'bi bi-exclamation-triangle' };
                case 'success':
                    return { label: t('scene_test_status_manipulate_result'), variant: 'success', iconClassName: 'bi bi-check-circle' };
                default: { const _n: never = outcome; return _n; }
            }
        }
        default: { const _n: never = status; return _n; }
    }
}

function EditableSceneView({ index, scene, deletable, dragHandleProps, onEditSceneStart, onDeleteScene }: {
    index: number,
    scene: EditableScene,
    deletable: boolean,
    dragHandleProps: DraggableProvidedDragHandleProps | null,
    onEditSceneStart: (scene: EditableScene) => void,
    onDeleteScene: (scene: EditableScene) => void,
}) {
    if (scene.type === 'text') {
        return <EditableTextSceneView index={index} scene={scene} deletable={deletable} dragHandleProps={dragHandleProps} onEdit={() => onEditSceneStart(scene)} onDelete={() => onDeleteScene(scene)} />;
    }
    else if (scene.type === 'image') {
        return <EditableImageSceneView index={index} scene={scene} deletable={deletable} dragHandleProps={dragHandleProps} onEdit={() => onEditSceneStart(scene)} onDelete={() => onDeleteScene(scene)} />;
    }
    else if (scene.type === 'select') {
        return <EditableSelectSceneView index={index} scene={scene} deletable={deletable} dragHandleProps={dragHandleProps} onEdit={() => onEditSceneStart(scene)} onDelete={() => onDeleteScene(scene)} />;
    }
    else if (scene.type === 'manipulate') {
        return <EditableManipulateSceneView index={index} scene={scene} deletable={deletable} dragHandleProps={dragHandleProps} onEdit={() => onEditSceneStart(scene)} onDelete={() => onDeleteScene(scene)} />;
    }
    else { const _n: never = scene; return _n; }
}

function EditableTextSceneView({ index, scene, deletable, dragHandleProps, onEdit, onDelete }: {
    index: number,
    scene: Editable<TextScene>,
    deletable: boolean,
    dragHandleProps: DraggableProvidedDragHandleProps | null,
    onEdit: () => void,
    onDelete: () => void,
}) {
    const { t } = useTranslation('game-editor');

    return (
        <ListGroup>
            <EditableSceneViewHeader
                sceneType='text'
                deletable={deletable}
                dragHandleProps={dragHandleProps}
                title={<>{index + 1}. <strong><em>{t('scene_type_text')}</em></strong></>}
                onEdit={onEdit}
                onDelete={onDelete}
            />
            <EditableSceneContent sceneType='text'>
                <InlineMarkup text={scene.text} />
            </EditableSceneContent>
        </ListGroup>
    );
}

function EditableImageSceneView({ index, scene, deletable, dragHandleProps, onEdit, onDelete }: {
    index: number,
    scene: Editable<ImageScene>,
    deletable: boolean,
    dragHandleProps: DraggableProvidedDragHandleProps | null,
    onEdit: () => void,
    onDelete: () => void,
}) {
    const { t } = useTranslation('game-editor');

    return (
        <ListGroup>
            <EditableSceneViewHeader
                sceneType='image'
                deletable={deletable}
                dragHandleProps={dragHandleProps}
                title={<>{index + 1}. <strong><em>{t('scene_type_image')}</em></strong></>}
                onEdit={onEdit}
                onDelete={onDelete}
            />
            <EditableSceneContent sceneType='image'>
                <Base64Image
                    base64string={scene.base64string}
                    mediaType={scene.mediaType}
                />
            </EditableSceneContent>
        </ListGroup>
    );
}

function EditableSelectSceneView({ index, scene, deletable, dragHandleProps, onEdit, onDelete }: {
    index: number,
    scene: Editable<SelectScene>,
    deletable: boolean,
    dragHandleProps: DraggableProvidedDragHandleProps | null,
    onEdit: () => void,
    onDelete: () => void,
}) {
    const { t } = useTranslation('game-editor');

    return (
        <ListGroup>
            <EditableSceneViewHeader
                sceneType='select'
                deletable={deletable}
                dragHandleProps={dragHandleProps}
                title={<>{index + 1}. <strong><em>{t('scene_type_select')}</em></strong></>}
                onEdit={onEdit}
                onDelete={onDelete}
            />
            <EditableSceneContent sceneType='select'>
                <InlineMarkup text={scene.text} />
            </EditableSceneContent>
            <EditableSceneContent sceneType='select'>
                <div className='d-flex justify-content-between'>
                    <p><strong>{t('scene_sql_solution')}</strong></p>
                </div>
                <SqlListing sql={scene.sqlSol} />
            </EditableSceneContent>
            {(scene.isRowOrderRelevant || scene.isColOrderRelevant || scene.areColNamesRelevant) && (
                <EditableSceneContent sceneType='select' className={classNames(styles.gapDefault, 'd-flex', 'flex-wrap')}>
                    {scene.isRowOrderRelevant && (
                        <Badge className={styles.taskSceneBadge}>{t('scene_row_order_relevant')}</Badge>
                    )}
                    {scene.isColOrderRelevant && (
                        <Badge className={styles.taskSceneBadge}>{t('scene_column_order_relevant')}</Badge>
                    )}
                    {scene.areColNamesRelevant && (
                        <Badge className={styles.taskSceneBadge}>{t('scene_column_names_relevant')}</Badge>
                    )}
                </EditableSceneContent>
            )}
            {scene.sqlPlaceholder !== '' && (
                <EditableSceneContent sceneType='select'>
                    <p><strong>{t('scene_sql_placeholder')}</strong></p>
                    <SqlListing sql={scene.sqlPlaceholder} />
                </EditableSceneContent>
            )}
            <EditableOrdinaryHintsView
                sceneType='select'
                ordinaryHints={scene.ordinaryHints}
                hasSolHint={scene.hasSolHint}
            />
        </ListGroup>
    );
}

function EditableManipulateSceneView({ index, scene, deletable, dragHandleProps, onEdit, onDelete }: {
    index: number,
    scene: Editable<ManipulateScene>,
    deletable: boolean,
    dragHandleProps: DraggableProvidedDragHandleProps | null,
    onEdit: () => void,
    onDelete: () => void,
}) {
    const { t } = useTranslation('game-editor');

    return (
        <ListGroup>
            <EditableSceneViewHeader
                sceneType='manipulate'
                deletable={deletable}
                dragHandleProps={dragHandleProps}
                title={<>{index + 1}. <strong><em>{t('scene_type_manipulate')}</em></strong></>}
                onEdit={onEdit}
                onDelete={onDelete}
            />
            <EditableSceneContent sceneType='manipulate'>
                <InlineMarkup text={scene.text} />
            </EditableSceneContent>
            <EditableSceneContent sceneType='manipulate'>
                <p><strong>{t('scene_sql_solution')}</strong></p>
                <SqlListing sql={scene.sqlSol} />
            </EditableSceneContent>
            <EditableSceneContent sceneType='manipulate'>
                <p><strong>{t('scene_sql_check')}</strong></p>
                <SqlListing sql={scene.sqlCheck} />
            </EditableSceneContent>
            {scene.sqlPlaceholder !== '' && (
                <EditableSceneContent sceneType='manipulate'>
                    <p><strong>{t('scene_sql_placeholder')}</strong></p>
                    <SqlListing sql={scene.sqlPlaceholder} />
                </EditableSceneContent>
            )}
            <EditableOrdinaryHintsView
                sceneType='manipulate'
                ordinaryHints={scene.ordinaryHints}
                hasSolHint={scene.hasSolHint}
            />
        </ListGroup>
    );
}

function EditableOrdinaryHintsView({ sceneType, ordinaryHints, hasSolHint }: {
    sceneType: 'select' | 'manipulate',
    ordinaryHints: OrdinaryHint[],
    hasSolHint: boolean,
}) {
    const { t } = useTranslation('game-editor');

    return ordinaryHints.length > 0 || hasSolHint ? (
        <EditableSceneContent sceneType={sceneType}>
            <p><strong>{t('scene_ordinary_hints_label')}</strong></p>
            <ol className='mb-0'>
                {ordinaryHints.map((ordinaryHint, index) => (
                    <li key={index}>
                        <EditableOrdinaryHintSummary ordinaryHint={ordinaryHint} />
                    </li>
                ))}
                {hasSolHint && (
                    <li><em>{t('scene_solution_hint_offer')}</em></li>
                )}
            </ol>
        </EditableSceneContent>
    ) : null;
}

function EditableOrdinaryHintSummary({ ordinaryHint }: { ordinaryHint: OrdinaryHint }) {
    const { t } = useTranslation('game-editor');
    switch (ordinaryHint.type) {
        case 'text':
            return <InlineMarkup text={ordinaryHint.text} />;
        case 'expected-result':
            return <em>{t('scene_ordinary_expected_result_hint')}</em>;
        default: { const _n: never = ordinaryHint; return _n; }
    }
}

function EditableSceneViewHeader({ sceneType, deletable, dragHandleProps, title, onEdit, onDelete }: {
    sceneType: Scene['type'],
    deletable: boolean,
    dragHandleProps: DraggableProvidedDragHandleProps | null,
    title: ReactElement,
    onEdit: () => void,
    onDelete: () => void,
}) {
    const { t } = useTranslation('game-editor');

    return (
        <ListGroup.Item
            className={classNames(
                styles.editableSceneViewHeader,
                'd-flex',
                'justify-content-between',
                'align-items-center',
                getSceneColorClassNames(sceneType, 'prominent'),
            )}
            data-scene-type={sceneType}
            data-scene-emphasis='prominent'
            aria-label={t('scene_drag_handle')}
            {...dragHandleProps}
        >
            <p>{title}</p>
            <div className={styles.sceneActions}>
                <BareIconButton
                    accessibleName={t('scene_edit')}
                    onClick={onEdit}
                    tooltipText={t('scene_edit')}
                >
                    <i className='bi bi-pencil' aria-hidden='true' />
                </BareIconButton>
                {deletable && (
                    <BareIconButton
                        accessibleName={t('scene_delete')}
                        onClick={onDelete}
                        tooltipText={t('scene_delete')}
                    >
                        <i className='bi bi-trash' aria-hidden='true' />
                    </BareIconButton>
                )}
                <i className='bi bi-grip-vertical' aria-hidden='true' />
            </div>
        </ListGroup.Item>
    );
}

function EditableSceneContent({ sceneType, className, children }: {
    sceneType: Scene['type'],
    className?: string,
    children: ReactNode,
}) {
    return (
        <ListGroup.Item
            className={classNames(className, getSceneColorClassNames(sceneType, 'subtle'))}
            data-scene-type={sceneType}
            data-scene-emphasis='subtle'
        >
            {children}
        </ListGroup.Item>
    );
}

function getSceneColorClassNames(sceneType: Scene['type'], emphasis: 'subtle' | 'prominent'): string {
    const opacityClassName = emphasis === 'subtle' ? 'bg-opacity-25' : 'bg-opacity-50';

    switch (sceneType) {
        case 'text':
            return classNames('bg-secondary', opacityClassName, 'border-secondary');
        case 'image':
            return classNames('bg-secondary', opacityClassName, 'border-secondary');
        case 'select':
            return classNames(styles.selectSceneColor, opacityClassName);
        case 'manipulate':
            return classNames(styles.manipulateSceneColor, opacityClassName);
        default: { const _n: never = sceneType; return _n; }
    }
}

function SceneInsertionControl({ atEnd, onAdd }: {
    atEnd: boolean,
    onAdd: () => void,
}) {
    const { t } = useTranslation('game-editor');
    const accessibleName = atEnd
        ? t('scene_add_at_end')
        : t('scene_add');

    return (
        <div className={styles.sceneInsertionControl}>
            <BareIconButton
                accessibleName={accessibleName}
                onClick={onAdd}
                tooltipText={accessibleName}
            >
                <i
                    className={classNames(styles.sceneInsertionIcon, 'bi', 'bi-plus-circle')}
                    aria-hidden='true'
                />
            </BareIconButton>
        </div>
    );
}
