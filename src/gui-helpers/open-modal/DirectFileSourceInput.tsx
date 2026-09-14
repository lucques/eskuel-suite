import { forwardRef, useId, useImperativeHandle, useRef, useState, type ChangeEvent, type ForwardedRef, type ReactElement, type RefAttributes } from 'react';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import type { WithFilename } from '../../util';
import { ThemedModal } from '../app-theme/AppTheme';
import { SubtleButton } from '../subtle-button/SubtleButton';
import { UnsupportedFileTypeError } from './file-error';

export type DirectFileSourceInputHandle = {
    open: () => void;
};

type DirectFileSourceInputProps<T> = {
    accept: string;
    maxFileSizeBytes: number | ((file: File) => number);
    fileToSource: (file: File) => Promise<T>;
    onOpenFile: (source: WithFilename<T>) => void;
};

function DirectFileSourceInputInner<T>({
    accept,
    maxFileSizeBytes,
    fileToSource,
    onOpenFile,
}: DirectFileSourceInputProps<T>, ref: ForwardedRef<DirectFileSourceInputHandle>) {
    const { t } = useTranslation('common');
    const titleId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const fileReadId = useRef(0);

    useImperativeHandle(ref, () => ({
        open: () => {
            inputRef.current?.click();
        },
    }), []);

    const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (file === undefined) {
            // The user cancelled the native file dialog.
        }
        else {
            const currentFileReadId = ++fileReadId.current;
            setFileError(null);
            const resolvedMaxFileSizeBytes = resolveMaxFileSizeBytes(maxFileSizeBytes, file);
            if (file.size > resolvedMaxFileSizeBytes) {
                setFileError(t('common.file_too_large', { limit: formatMegabytes(resolvedMaxFileSizeBytes) }));
            }
            else {
                void fileToSource(file).then(source => {
                    if (fileReadId.current === currentFileReadId) {
                        onOpenFile({ ...source, filename: file.name });
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
        <>
            <input
                ref={inputRef}
                type='file'
                accept={accept}
                onChange={onChange}
                hidden
            />
            <ThemedModal show={fileError !== null} onHide={() => setFileError(null)} aria-labelledby={titleId}>
                <Modal.Header closeButton>
                    <Modal.Title id={titleId}>{t('common.error')}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {fileError}
                </Modal.Body>
                <Modal.Footer>
                    <SubtleButton onClick={() => setFileError(null)}>
                        {t('common.close')}
                    </SubtleButton>
                </Modal.Footer>
            </ThemedModal>
        </>
    );
}

export const DirectFileSourceInput = forwardRef(DirectFileSourceInputInner) as <T>(
    props: DirectFileSourceInputProps<T> & RefAttributes<DirectFileSourceInputHandle>
) => ReactElement;

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
