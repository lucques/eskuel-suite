import { useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Alert, Form, Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { assert, type WithFilename } from '../../util';
import { SubtleButton } from '../subtle-button/SubtleButton';
import { ThemedModal } from '../app-theme/AppTheme';
import styles from './OpenSourceModal.module.css';
import type { OpenSourceFile, OpenSourceOption } from './OpenSourceOptions';
import { UnsupportedFileTypeError } from './file-error';

type SourceType = 'provided' | 'local-file';

export function OpenSourceModal<T>({
    title,
    providedSourcesTitle,
    emptyProvidedSourcesMessage,
    localFileTitle,
    fileIcons,
    fileAccept,
    providedSources,
    fileToSource,
    maxFileSizeBytes,
    onHide,
    onOpenFile,
}: {
    title: string;
    providedSourcesTitle: string;
    emptyProvidedSourcesMessage: string;
    localFileTitle: string;
    fileIcons: ReactNode;
    fileAccept: string;
    providedSources: readonly OpenSourceOption<T>[];
    fileToSource: (file: File) => Promise<T>;
    maxFileSizeBytes: number | ((file: File) => number);
    onHide: () => void;
    onOpenFile: (source: WithFilename<T>) => void;
}) {
    const { t } = useTranslation('common');
    const titleId = useId();
    const sourceSelectionName = useId();

    const [sourceType, setSourceType] = useState<SourceType | null>(null);
    const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null);
    const [selectedFileKeys, setSelectedFileKeys] = useState<Readonly<Record<string, string>>>({});
    const [localFileSource, setLocalFileSource] = useState<WithFilename<T> | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const fileReadId = useRef(0);
    const selectedOption = selectedOptionKey === null
        ? undefined
        : providedSources.find(option => option.key === selectedOptionKey);
    const selectedFile = selectedOption === undefined
        ? undefined
        : findSelectedFile(selectedOption, selectedFileKeys[selectedOption.key]);

    const selectLocalFileSource = () => {
        setSourceType('local-file');
        setSelectedOptionKey(null);
    };

    const onOpenClicked = () => {
        assert(sourceType !== null);
        if (sourceType === 'provided') {
            assert(selectedFile !== undefined);
            onOpenFile(selectedFile.source);
        }
        else {
            assert(localFileSource !== null);
            onOpenFile(localFileSource);
        }

        onHide();
    };

    const onFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const selectedFile = event.target.files[0];
            const currentFileReadId = ++fileReadId.current;
            selectLocalFileSource();
            setLocalFileSource(null);
            setFileError(null);

            const resolvedMaxFileSizeBytes = resolveMaxFileSizeBytes(maxFileSizeBytes, selectedFile);
            if (selectedFile.size > resolvedMaxFileSizeBytes) {
                setFileError(t('common.file_too_large', { limit: formatMegabytes(resolvedMaxFileSizeBytes) }));
            }
            else {
                void fileToSource(selectedFile).then(source => {
                    if (fileReadId.current === currentFileReadId) {
                        setLocalFileSource({ ...source, filename: selectedFile.name });
                    }
                }, (error: unknown) => {
                    if (fileReadId.current === currentFileReadId) {
                        setFileError(error instanceof UnsupportedFileTypeError
                            ? error.message
                            : t('common.file_read_error'));
                    }
                });
            }
        }
    };

    return (
        <ThemedModal show onHide={onHide} aria-labelledby={titleId} size='lg'>
            <Modal.Header closeButton>
                <Modal.Title id={titleId}>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <h2 className='h5 mb-3'>{providedSourcesTitle}</h2>
                    {providedSources.length === 0
                        ? <p className='fst-italic mb-0'>{emptyProvidedSourcesMessage}</p>
                        : <div className={styles.providedSourcesGrid}>
                            {providedSources.map(option => (
                                <div
                                    className={selectedOption?.key === option.key
                                        ? `${styles.providedSourceCard} ${styles.providedSourceCardSelected}`
                                        : styles.providedSourceCard}
                                    key={option.key}
                                    onClick={() => {
                                        setSourceType('provided');
                                        setSelectedOptionKey(option.key);
                                    }}
                                >
                                    <Form.Check.Input
                                        className={styles.sourceCardRadio}
                                        type='radio'
                                        name={sourceSelectionName}
                                        checked={sourceType === 'provided' && selectedOption?.key === option.key}
                                        aria-label={option.title}
                                        onChange={() => {
                                            setSourceType('provided');
                                            setSelectedOptionKey(option.key);
                                        }}
                                    />
                                    <div className={styles.sourceCardHeader}>
                                        <span className={styles.providedSourceTitle}>{option.title}</span>
                                    </div>
                                    <div className={styles.fileSelector}>
                                        {option.files.length === 1
                                            ? option.files.map(file => (
                                                <div
                                                    className={`form-control ${styles.singleFileFilename}`}
                                                    key={file.key}
                                                >
                                                    {file.source.filename}
                                                </div>
                                            ))
                                            : <Form.Select
                                                value={findSelectedFile(option, selectedFileKeys[option.key]).key}
                                                aria-label={t('catalog_source.select_file', { title: option.title })}
                                                onChange={event => {
                                                    setSourceType('provided');
                                                    setSelectedFileKeys(current => ({
                                                        ...current,
                                                        [option.key]: event.target.value,
                                                    }));
                                                    setSelectedOptionKey(option.key);
                                                }}
                                            >
                                                {option.files.map(file => (
                                                    <option value={file.key} key={file.key}>
                                                        {file.source.filename}
                                                    </option>
                                                ))}
                                            </Form.Select>}
                                    </div>
                                    {option.pageUrl === undefined
                                        ? null
                                        : <a
                                            href={option.pageUrl}
                                            className={styles.moreInformationLink}
                                            onClick={event => event.stopPropagation()}
                                        >
                                            {t('common.more_information')}
                                        </a>}
                                </div>
                            ))}
                        </div>}
                    <h2 className='h5 mt-4 mb-3'>{localFileTitle}</h2>
                    <div
                        className={sourceType === 'local-file'
                            ? `${styles.providedSourceCard} ${styles.providedSourceCardSelected} ${styles.localFileCard}`
                            : `${styles.providedSourceCard} ${styles.localFileCard}`}
                        onClick={selectLocalFileSource}
                    >
                        <Form.Check.Input
                            className={`${styles.sourceCardRadio} ${styles.localFileRadio}`}
                            type='radio'
                            name={sourceSelectionName}
                            checked={sourceType === 'local-file'}
                            aria-label={localFileTitle}
                            onChange={selectLocalFileSource}
                        />
                        <div className={styles.localFileSelector}>
                            <Form.Control
                                type='file'
                                accept={fileAccept}
                                onChange={onFileSelected}
                            />
                        </div>
                        <div className={styles.localFileIcons} aria-hidden='true'>
                            {fileIcons}
                        </div>
                    </div>
                    {fileError !== null && <Alert variant='danger' className='mt-3 mb-0'>{fileError}</Alert>}
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <SubtleButton onClick={onHide}>
                    {t('common.close')}
                </SubtleButton>
                <SubtleButton
                    onClick={onOpenClicked}
                    disabled={sourceType === null
                        || (sourceType === 'provided' && selectedFile === undefined)
                        || (sourceType === 'local-file' && localFileSource === null)}
                    variant='primary'
                >
                    {t('common.open')}
                </SubtleButton>
            </Modal.Footer>
        </ThemedModal>
    );
}

function findSelectedFile<T>(
    option: OpenSourceOption<T>,
    selectedFileKey: string | undefined,
): OpenSourceFile<T> {
    const selectedFile = option.files.find(file => file.key === selectedFileKey);
    if (selectedFile === undefined) {
        const firstFile = option.files[0];
        assert(firstFile !== undefined);
        return firstFile;
    }
    else {
        return selectedFile;
    }
}

function formatMegabytes(bytes: number): string {
    return (bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function resolveMaxFileSizeBytes(
    maxFileSizeBytes: number | ((file: File) => number),
    file: File,
): number {
    return typeof maxFileSizeBytes === 'number'
        ? maxFileSizeBytes
        : maxFileSizeBytes(file);
}
