export function formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB`;
    }
    else if (bytes >= 1024) {
        return `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB`;
    }
    else {
        return `${bytes.toLocaleString(undefined, { maximumFractionDigits: 0 })} B`;
    }
}
