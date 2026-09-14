export const IMAGE_MEDIA_TYPES = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/avif',
    'image/gif',
] as const;

export type ImageMediaType = typeof IMAGE_MEDIA_TYPES[number];

export type ImageDimensions = {
    width: number;
    height: number;
};

export type ImageResourceLimits = {
    maxImageFileBytes: number;
    maxImageWidth: number;
    maxImageHeight: number;
};

export type ImageInputResourceLimits = {
    maxImageFileBytes: number;
    maxImagePixels: number;
};

export type ImageFileSizeLimitFail = {
    kind: 'image-resource-limit';
    resource: 'file-bytes';
    limit: number;
};

export type ImagePixelLimitFail = {
    kind: 'image-resource-limit';
    resource: 'pixels';
    limit: number;
    dimensions: ImageDimensions;
};

export type ImageDimensionLimitFail = {
    kind: 'image-resource-limit';
    resource: 'width' | 'height';
    limit: number;
};

export type ImageResourceLimitFail = ImageFileSizeLimitFail | ImagePixelLimitFail | ImageDimensionLimitFail;
export type EmbeddedImageResourceLimitFail = ImageFileSizeLimitFail | ImageDimensionLimitFail;
export type SceneImageResourceLimitFail = EmbeddedImageResourceLimitFail & {
    sceneNumber: number;
};

export const DEFAULT_IMAGE_RESOURCE_LIMITS: ImageResourceLimits = {
    maxImageFileBytes: 2 * 1024 * 1024,
    maxImageWidth: 2400,
    maxImageHeight: 1200,
};

export const DEFAULT_IMAGE_INPUT_RESOURCE_LIMITS: ImageInputResourceLimits = {
    maxImageFileBytes: 24 * 1024 * 1024,
    maxImagePixels: 32_000_000,
};

export function isImageMediaType(value: string): value is ImageMediaType {
    return IMAGE_MEDIA_TYPES.some(mediaType => mediaType === value);
}

export function detectImageMediaType(data: Uint8Array): ImageMediaType | null {
    if (hasBytes(data, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return 'image/png';
    }
    else if (hasBytes(data, 0, [0xff, 0xd8, 0xff])) {
        return 'image/jpeg';
    }
    else if (
        hasAscii(data, 0, 'GIF87a')
        || hasAscii(data, 0, 'GIF89a')
    ) {
        return 'image/gif';
    }
    else if (hasAscii(data, 0, 'RIFF') && hasAscii(data, 8, 'WEBP')) {
        return 'image/webp';
    }
    else if (isAvif(data)) {
        return 'image/avif';
    }
    else {
        return null;
    }
}

export function readImageDimensions(
    data: Uint8Array,
    mediaType: ImageMediaType,
): ImageDimensions | null {
    switch (mediaType) {
        case 'image/png':
            return readPngDimensions(data);
        case 'image/jpeg':
            return readJpegDimensions(data);
        case 'image/webp':
            return readWebpDimensions(data);
        case 'image/avif':
            return readAvifDimensions(data);
        case 'image/gif':
            return readGifDimensions(data);
        default: { const _n: never = mediaType; return _n; }
    }
}

export function isAnimatedImage(data: Uint8Array, mediaType: ImageMediaType): boolean {
    switch (mediaType) {
        case 'image/png':
            return isAnimatedPng(data);
        case 'image/jpeg':
            return false;
        case 'image/webp':
            return isAnimatedWebp(data);
        case 'image/avif':
            return isAnimatedAvif(data);
        case 'image/gif':
            return isAnimatedGif(data);
        default: { const _n: never = mediaType; return _n; }
    }
}

export function imageFileSizeLimitFailure(
    fileBytes: number,
    limits: Pick<ImageResourceLimits, 'maxImageFileBytes'>,
): ImageFileSizeLimitFail | null {
    if (fileBytes > limits.maxImageFileBytes) {
        return {
            kind: 'image-resource-limit',
            resource: 'file-bytes',
            limit: limits.maxImageFileBytes,
        };
    }
    else {
        return null;
    }
}

export function imagePixelLimitFailure(
    dimensions: ImageDimensions,
    limits: ImageInputResourceLimits,
): ImagePixelLimitFail | null {
    const exceedsLimit = dimensions.width > Math.floor(limits.maxImagePixels / dimensions.height);
    if (exceedsLimit) {
        return {
            kind: 'image-resource-limit',
            resource: 'pixels',
            limit: limits.maxImagePixels,
            dimensions,
        };
    }
    else {
        return null;
    }
}

export function imageDimensionLimitFailure(
    dimensions: ImageDimensions,
    limits: ImageResourceLimits,
): ImageDimensionLimitFail | null {
    if (dimensions.width > limits.maxImageWidth) {
        return {
            kind: 'image-resource-limit',
            resource: 'width',
            limit: limits.maxImageWidth,
        };
    }
    else if (dimensions.height > limits.maxImageHeight) {
        return {
            kind: 'image-resource-limit',
            resource: 'height',
            limit: limits.maxImageHeight,
        };
    }
    else {
        return null;
    }
}

function readPngDimensions(data: Uint8Array): ImageDimensions | null {
    if (
        data.length < 24
        || !hasAscii(data, 12, 'IHDR')
    ) {
        return null;
    }
    else {
        return dimensionsOrNull(
            readUint32BigEndian(data, 16),
            readUint32BigEndian(data, 20),
        );
    }
}

function readGifDimensions(data: Uint8Array): ImageDimensions | null {
    if (data.length < 10) {
        return null;
    }
    else {
        return dimensionsOrNull(
            readUint16LittleEndian(data, 6),
            readUint16LittleEndian(data, 8),
        );
    }
}

function isAnimatedPng(data: Uint8Array): boolean {
    let offset = 8;
    let animated = false;
    while (offset + 12 <= data.length && !animated) {
        const chunkLength = readUint32BigEndian(data, offset);
        const chunkEnd = offset + 12 + chunkLength;
        if (!Number.isSafeInteger(chunkEnd) || chunkEnd > data.length) {
            offset = data.length;
        }
        else {
            const chunkType = asciiAt(data, offset + 4);
            animated = chunkType === 'acTL'
                && chunkLength >= 8
                && readUint32BigEndian(data, offset + 8) > 1;
            offset = chunkEnd;
        }
    }
    return animated;
}

function isAnimatedGif(data: Uint8Array): boolean {
    if (data.length < 13) {
        return false;
    }
    else {
        const globalColorTableSize = (data[10] & 0x80) !== 0
            ? 3 * (1 << ((data[10] & 0x07) + 1))
            : 0;
        let offset = 13 + globalColorTableSize;
        let frameCount = 0;
        while (offset < data.length && frameCount < 2) {
            const marker = data[offset];
            if (marker === 0x2c) {
                if (offset + 10 > data.length) {
                    offset = data.length;
                }
                else {
                    frameCount++;
                    const localColorTableSize = (data[offset + 9] & 0x80) !== 0
                        ? 3 * (1 << ((data[offset + 9] & 0x07) + 1))
                        : 0;
                    const imageDataOffset = offset + 10 + localColorTableSize;
                    offset = imageDataOffset < data.length
                        ? skipGifSubBlocks(data, imageDataOffset + 1)
                        : data.length;
                }
            }
            else if (marker === 0x21) {
                offset = offset + 2 <= data.length
                    ? skipGifSubBlocks(data, offset + 2)
                    : data.length;
            }
            else {
                offset = data.length;
            }
        }
        return frameCount > 1;
    }
}

function skipGifSubBlocks(data: Uint8Array, start: number): number {
    let offset = start;
    let finished = false;
    while (offset < data.length && !finished) {
        const blockSize = data[offset];
        offset++;
        if (blockSize === 0) {
            finished = true;
        }
        else if (offset + blockSize > data.length) {
            offset = data.length;
        }
        else {
            offset += blockSize;
        }
    }
    return offset;
}

function readJpegDimensions(data: Uint8Array): ImageDimensions | null {
    let offset = 2;
    let dimensions: ImageDimensions | null = null;
    while (offset + 4 <= data.length && dimensions === null) {
        if (data[offset] !== 0xff) {
            offset = data.length;
        }
        else {
            while (offset < data.length && data[offset] === 0xff) {
                offset++;
            }
            const marker = data[offset];
            offset++;
            if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
                // Standalone markers do not carry a segment length.
            }
            else if (marker === 0xd9 || marker === 0xda || offset + 2 > data.length) {
                offset = data.length;
            }
            else {
                const segmentLength = readUint16BigEndian(data, offset);
                if (segmentLength < 2 || offset + segmentLength > data.length) {
                    offset = data.length;
                }
                else if (isJpegStartOfFrame(marker) && segmentLength >= 7) {
                    dimensions = dimensionsOrNull(
                        readUint16BigEndian(data, offset + 5),
                        readUint16BigEndian(data, offset + 3),
                    );
                }
                else {
                    offset += segmentLength;
                }
            }
        }
    }
    return dimensions;
}

function isJpegStartOfFrame(marker: number): boolean {
    return (
        marker >= 0xc0
        && marker <= 0xcf
        && marker !== 0xc4
        && marker !== 0xc8
        && marker !== 0xcc
    );
}

function readWebpDimensions(data: Uint8Array): ImageDimensions | null {
    let offset = 12;
    let dimensions: ImageDimensions | null = null;
    while (offset + 8 <= data.length && dimensions === null) {
        const chunkType = asciiAt(data, offset);
        const chunkSize = readUint32LittleEndian(data, offset + 4);
        const chunkDataOffset = offset + 8;
        if (chunkDataOffset + chunkSize > data.length) {
            offset = data.length;
        }
        else if (chunkType === 'VP8X' && chunkSize >= 10) {
            dimensions = dimensionsOrNull(
                1 + readUint24LittleEndian(data, chunkDataOffset + 4),
                1 + readUint24LittleEndian(data, chunkDataOffset + 7),
            );
        }
        else if (
            chunkType === 'VP8 '
            && chunkSize >= 10
            && hasBytes(data, chunkDataOffset + 3, [0x9d, 0x01, 0x2a])
        ) {
            dimensions = dimensionsOrNull(
                readUint16LittleEndian(data, chunkDataOffset + 6) & 0x3fff,
                readUint16LittleEndian(data, chunkDataOffset + 8) & 0x3fff,
            );
        }
        else if (
            chunkType === 'VP8L'
            && chunkSize >= 5
            && data[chunkDataOffset] === 0x2f
        ) {
            const byte1 = data[chunkDataOffset + 1];
            const byte2 = data[chunkDataOffset + 2];
            const byte3 = data[chunkDataOffset + 3];
            const byte4 = data[chunkDataOffset + 4];
            dimensions = dimensionsOrNull(
                1 + byte1 + ((byte2 & 0x3f) << 8),
                1 + (byte2 >> 6) + (byte3 << 2) + ((byte4 & 0x0f) << 10),
            );
        }
        else {
            offset = chunkDataOffset + chunkSize + (chunkSize % 2);
        }
    }
    return dimensions;
}

function isAnimatedWebp(data: Uint8Array): boolean {
    let offset = 12;
    let animated = false;
    while (offset + 8 <= data.length && !animated) {
        const chunkType = asciiAt(data, offset);
        const chunkSize = readUint32LittleEndian(data, offset + 4);
        const chunkEnd = offset + 8 + chunkSize;
        if (!Number.isSafeInteger(chunkEnd) || chunkEnd > data.length) {
            offset = data.length;
        }
        else {
            animated = chunkType === 'ANIM' || chunkType === 'ANMF';
            offset = chunkEnd + (chunkSize % 2);
        }
    }
    return animated;
}

function readAvifDimensions(data: Uint8Array): ImageDimensions | null {
    return findAvifDimensions(data, 0, data.length, 0);
}

function isAnimatedAvif(data: Uint8Array): boolean {
    if (data.length < 16 || !hasAscii(data, 4, 'ftyp')) {
        return false;
    }
    else {
        const boxSize = readUint32BigEndian(data, 0);
        if (boxSize < 16 || boxSize > data.length) {
            return false;
        }
        else {
            let offset = 8;
            let animated = false;
            while (offset + 4 <= boxSize && !animated) {
                animated = hasAscii(data, offset, 'avis');
                offset = offset === 8 ? 16 : offset + 4;
            }
            return animated;
        }
    }
}

function findAvifDimensions(
    data: Uint8Array,
    start: number,
    end: number,
    depth: number,
): ImageDimensions | null {
    if (depth > 8) {
        return null;
    }
    else {
        let offset = start;
        let dimensions: ImageDimensions | null = null;
        while (offset + 8 <= end) {
            const size32 = readUint32BigEndian(data, offset);
            const type = asciiAt(data, offset + 4);
            const usesLargeSize = size32 === 1;
            const headerSize = usesLargeSize ? 16 : 8;
            const boxSize = usesLargeSize
                ? readUint64BigEndian(data, offset + 8)
                : size32 === 0
                    ? end - offset
                    : size32;
            const boxEnd = offset + boxSize;
            if (
                boxSize < headerSize
                || !Number.isSafeInteger(boxEnd)
                || boxEnd > end
            ) {
                offset = end;
            }
            else {
                const contentStart = offset + headerSize;
                // Only image-property boxes and AVIF containers can contribute dimensions.
                if (type === 'ispe' && contentStart + 12 <= boxEnd) {
                    dimensions = largerDimensions(dimensions, dimensionsOrNull(
                        readUint32BigEndian(data, contentStart + 4),
                        readUint32BigEndian(data, contentStart + 8),
                    ));
                }
                else if (isAvifContainer(type)) {
                    const childStart = contentStart + (type === 'meta' ? 4 : 0);
                    // Recurse only when the container includes its required header.
                    if (childStart <= boxEnd) {
                        dimensions = largerDimensions(
                            dimensions,
                            findAvifDimensions(data, childStart, boxEnd, depth + 1),
                        );
                    }
                }
                offset = boxEnd;
            }
        }
        return dimensions;
    }
}

function largerDimensions(
    current: ImageDimensions | null,
    candidate: ImageDimensions | null,
): ImageDimensions | null {
    if (candidate === null) {
        return current;
    }
    else if (current === null) {
        return candidate;
    }
    else {
        const currentPixels = BigInt(current.width) * BigInt(current.height);
        const candidatePixels = BigInt(candidate.width) * BigInt(candidate.height);
        return candidatePixels > currentPixels ? candidate : current;
    }
}

function isAvifContainer(type: string): boolean {
    return [
        'meta',
        'iprp',
        'ipco',
        'moov',
        'trak',
        'mdia',
        'minf',
        'stbl',
    ].includes(type);
}

function dimensionsOrNull(width: number, height: number): ImageDimensions | null {
    if (width > 0 && height > 0) {
        return { width, height };
    }
    else {
        return null;
    }
}

function isAvif(data: Uint8Array): boolean {
    if (data.length < 16 || !hasAscii(data, 4, 'ftyp')) {
        return false;
    }
    else {
        const boxSize = readUint32BigEndian(data, 0);
        if (boxSize < 16 || boxSize > data.length) {
            return false;
        }
        else if (isAvifBrand(data, 8)) {
            return true;
        }
        else {
            let offset = 16;
            let found = false;
            while (offset + 4 <= boxSize && !found) {
                found = isAvifBrand(data, offset);
                offset += 4;
            }
            return found;
        }
    }
}

function isAvifBrand(data: Uint8Array, offset: number): boolean {
    return hasAscii(data, offset, 'avif') || hasAscii(data, offset, 'avis');
}

function readUint32BigEndian(data: Uint8Array, offset: number): number {
    return (
        data[offset] * 0x1000000
        + data[offset + 1] * 0x10000
        + data[offset + 2] * 0x100
        + data[offset + 3]
    );
}

function readUint64BigEndian(data: Uint8Array, offset: number): number {
    const high = readUint32BigEndian(data, offset);
    const low = readUint32BigEndian(data, offset + 4);
    return high * 0x100000000 + low;
}

function readUint32LittleEndian(data: Uint8Array, offset: number): number {
    return (
        data[offset]
        + data[offset + 1] * 0x100
        + data[offset + 2] * 0x10000
        + data[offset + 3] * 0x1000000
    );
}

function readUint24LittleEndian(data: Uint8Array, offset: number): number {
    return data[offset] + data[offset + 1] * 0x100 + data[offset + 2] * 0x10000;
}

function readUint16BigEndian(data: Uint8Array, offset: number): number {
    return data[offset] * 0x100 + data[offset + 1];
}

function readUint16LittleEndian(data: Uint8Array, offset: number): number {
    return data[offset] + data[offset + 1] * 0x100;
}

function asciiAt(data: Uint8Array, offset: number): string {
    return String.fromCharCode(...data.slice(offset, offset + 4));
}

function hasAscii(data: Uint8Array, offset: number, value: string): boolean {
    return hasBytes(
        data,
        offset,
        Array.from(value, character => character.charCodeAt(0)),
    );
}

function hasBytes(data: Uint8Array, offset: number, expected: number[]): boolean {
    return (
        offset + expected.length <= data.length
        && expected.every((value, index) => data[offset + index] === value)
    );
}
