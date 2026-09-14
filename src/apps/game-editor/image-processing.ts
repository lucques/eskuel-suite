import {
    detectImageMediaType,
    imageDimensionLimitFailure,
    imageFileSizeLimitFailure,
    isAnimatedImage,
    readImageDimensions,
} from '../../game/image';
import type { ImageDimensions, ImageMediaType, ImageResourceLimits } from '../../game/image';
import type { Fail, Success } from '../../util';

export type EmbeddedImageLimits = ImageResourceLimits;

export type PreparedImage = {
    data: Uint8Array;
    dimensions: ImageDimensions;
    mediaType: ImageMediaType;
};

export type ImagePreparationFail = {
    kind: 'image-preparation-failed' | 'image-resize-animated';
};

const LOSSY_QUALITIES = [0.92, 0.85, 0.78, 0.7];
const MAX_SIZE_ATTEMPTS = 8;

export async function prepareImageForEmbedding(
    data: Uint8Array,
    mediaType: ImageMediaType,
    encodedDimensions: ImageDimensions,
    limits: EmbeddedImageLimits,
): Promise<Success<PreparedImage> | Fail<ImagePreparationFail>> {
    try {
        return await prepareImageForEmbeddingUnsafe(data, mediaType, encodedDimensions, limits);
    }
    catch {
        return { ok: false, error: { kind: 'image-preparation-failed' } };
    }
}

async function prepareImageForEmbeddingUnsafe(
    data: Uint8Array,
    mediaType: ImageMediaType,
    encodedDimensions: ImageDimensions,
    limits: EmbeddedImageLimits,
): Promise<Success<PreparedImage> | Fail<ImagePreparationFail>> {
    const image = await loadImage(data, mediaType);
    if (image === null) {
        return { ok: false, error: { kind: 'image-preparation-failed' } };
    }
    else {
        const decodedDimensions = {
            width: image.naturalWidth,
            height: image.naturalHeight,
        };
        const requiresTransformation = imageRequiresTransformation(data.byteLength, encodedDimensions, limits)
            || imageRequiresTransformation(data.byteLength, decodedDimensions, limits);
        if (!requiresTransformation) {
            return {
                ok: true,
                data: { data, dimensions: encodedDimensions, mediaType },
            };
        }
        else if (isAnimatedImage(data, mediaType)) {
            return { ok: false, error: { kind: 'image-resize-animated' } };
        }
        else {
            return resizeStaticImage(image, mediaType, limits);
        }
    }
}

function imageRequiresTransformation(
    fileBytes: number,
    dimensions: ImageDimensions,
    limits: EmbeddedImageLimits,
): boolean {
    return fileBytes > limits.maxImageFileBytes
        || imageDimensionLimitFailure(dimensions, limits) !== null;
}

async function loadImage(data: Uint8Array, mediaType: ImageMediaType): Promise<HTMLImageElement | null> {
    const image = new Image();
    const objectUrl = URL.createObjectURL(new Blob([data.slice()], { type: mediaType }));
    return new Promise(resolve => {
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(null);
        };
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.src = objectUrl;
    });
}

async function resizeStaticImage(
    image: HTMLImageElement,
    sourceMediaType: ImageMediaType,
    limits: EmbeddedImageLimits,
): Promise<Success<PreparedImage> | Fail<ImagePreparationFail>> {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context === null) {
        return { ok: false, error: { kind: 'image-preparation-failed' } };
    }
    else {
        const outputMediaType = chooseOutputMediaType(sourceMediaType);
        let dimensions = fitImageDimensions({
            width: image.naturalWidth,
            height: image.naturalHeight,
        }, limits);
        let result: Success<PreparedImage> | Fail<ImagePreparationFail> = {
            ok: false,
            error: { kind: 'image-preparation-failed' },
        };
        let attempt = 0;
        let finished = false;
        while (attempt < MAX_SIZE_ATTEMPTS && !finished) {
            canvas.width = dimensions.width;
            canvas.height = dimensions.height;
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            const encoded = await encodeCanvas(canvas, outputMediaType, limits.maxImageFileBytes);
            if (encoded.blob !== null && encoded.blob.size <= limits.maxImageFileBytes) {
                result = await preparedImageFromBlob(encoded.blob, limits);
                finished = true;
            }
            else if (encoded.blob === null || (dimensions.width === 1 && dimensions.height === 1)) {
                finished = true;
            }
            else {
                dimensions = reduceDimensionsToFitBytes(
                    dimensions,
                    encoded.blob.size,
                    limits.maxImageFileBytes,
                );
                attempt++;
            }
        }
        return result;
    }
}

function fitImageDimensions(
    dimensions: ImageDimensions,
    limits: EmbeddedImageLimits,
): ImageDimensions {
    const scale = Math.min(
        1,
        limits.maxImageWidth / dimensions.width,
        limits.maxImageHeight / dimensions.height,
    );
    return {
        width: Math.max(1, Math.floor(dimensions.width * scale)),
        height: Math.max(1, Math.floor(dimensions.height * scale)),
    };
}

function reduceDimensionsToFitBytes(
    dimensions: ImageDimensions,
    actualBytes: number,
    maxBytes: number,
): ImageDimensions {
    const scale = Math.min(0.9, Math.sqrt(maxBytes / actualBytes) * 0.95);
    const next = {
        width: Math.max(1, Math.floor(dimensions.width * scale)),
        height: Math.max(1, Math.floor(dimensions.height * scale)),
    };
    if (next.width !== dimensions.width || next.height !== dimensions.height) {
        return next;
    }
    else if (dimensions.width >= dimensions.height && dimensions.width > 1) {
        return { ...dimensions, width: dimensions.width - 1 };
    }
    else if (dimensions.height > 1) {
        return { ...dimensions, height: dimensions.height - 1 };
    }
    else {
        return dimensions;
    }
}

async function encodeCanvas(
    canvas: HTMLCanvasElement,
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp',
    maxBytes: number,
): Promise<{ blob: Blob | null }> {
    if (mediaType === 'image/png') {
        return { blob: await canvasToBlob(canvas, mediaType) };
    }
    else {
        let blob: Blob | null = null;
        let qualityIndex = 0;
        while (qualityIndex < LOSSY_QUALITIES.length && (blob === null || blob.size > maxBytes)) {
            blob = await canvasToBlob(canvas, mediaType, LOSSY_QUALITIES[qualityIndex]);
            qualityIndex++;
        }
        return { blob };
    }
}

function canvasToBlob(
    canvas: HTMLCanvasElement,
    mediaType: string,
    quality?: number,
): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(resolve, mediaType, quality));
}

async function preparedImageFromBlob(
    blob: Blob,
    limits: EmbeddedImageLimits,
): Promise<Success<PreparedImage> | Fail<ImagePreparationFail>> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const mediaType = detectImageMediaType(data);
    if (mediaType === null) {
        return { ok: false, error: { kind: 'image-preparation-failed' } };
    }
    else {
        const dimensions = readImageDimensions(data, mediaType);
        if (
            dimensions === null
            || imageFileSizeLimitFailure(data.byteLength, limits) !== null
            || imageDimensionLimitFailure(dimensions, limits) !== null
        ) {
            return { ok: false, error: { kind: 'image-preparation-failed' } };
        }
        else {
            return { ok: true, data: { data, dimensions, mediaType } };
        }
    }
}

function chooseOutputMediaType(
    sourceMediaType: ImageMediaType,
): 'image/png' | 'image/jpeg' | 'image/webp' {
    switch (sourceMediaType) {
        case 'image/png':
            return 'image/png';
        case 'image/jpeg':
            return 'image/jpeg';
        case 'image/webp':
        case 'image/avif':
            return 'image/webp';
        case 'image/gif':
            return 'image/png';
        default: { const _n: never = sourceMediaType; return _n; }
    }
}
