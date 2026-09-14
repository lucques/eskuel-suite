export const MAX_PACKAGE_DESCRIPTOR_BYTES = 64 * 1024;
export const MAX_PACKAGE_LICENSE_BYTES = 256 * 1024;
export const MAX_PACKAGE_AUXILIARY_FILE_BYTES = 1024 * 1024;

export type Contributor = {
    title?: string;
    givenName?: string;
    familyName?: string;
    path?: string;
    email?: string;
    roles?: string[];
    organization?: string;
};

export type License = {
    name?: string;
    path: string;
    title?: string;
};

export type PackageSource = {
    title?: string;
    path?: string;
    email?: string;
    version?: string;
};

export type PackageNotice = {
    path: string;
    title?: string;
};

export type PackageProvenance = {
    path: string;
    mediatype: string;
};

export type BundledPackageLicense = {
    metadata: License;
    text: string;
};

export type BundledPackageNotice = {
    metadata: PackageNotice;
    text: string;
};

export type BundledPackageProvenance = {
    metadata: PackageProvenance;
    text: string;
};

export function validateBundledPackageTexts<M>(
    candidate: unknown,
    metadata: M[],
    context: string,
): Array<{ metadata: M, text: string }> {
    if (!Array.isArray(candidate) || candidate.length !== metadata.length) {
        throw new TypeError(`${context} must contain one text for every metadata entry`);
    }
    else {
        return metadata.map((entryMetadata, index) => {
            const entry = candidate[index];
            if (!isRecord(entry) || typeof entry.text !== 'string') {
                throw new TypeError(`${context}[${index}] must contain text`);
            }
            else {
                return { metadata: entryMetadata, text: entry.text };
            }
        });
    }
}

export function validateOptionalBundledPackageText<M>(
    candidate: unknown,
    metadata: M | undefined,
    context: string,
): { metadata: M, text: string } | undefined {
    if (metadata === undefined && candidate === undefined) {
        return undefined;
    }
    else if (metadata !== undefined && isRecord(candidate) && typeof candidate.text === 'string') {
        return { metadata, text: candidate.text };
    }
    else {
        throw new TypeError(`${context} must match its metadata declaration`);
    }
}

export function requireDistinctPaths(paths: string[], context: string): void {
    const foldedPaths = paths.map(path => path.toLocaleLowerCase('en-US'));
    if (new Set(foldedPaths).size !== foldedPaths.length) {
        throw new Error(`${context} must be distinct`);
    }
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
    return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}
