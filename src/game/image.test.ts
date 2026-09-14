import { describe, expect, it } from 'vitest';

import {
    DEFAULT_IMAGE_INPUT_RESOURCE_LIMITS,
    DEFAULT_IMAGE_RESOURCE_LIMITS,
    detectImageMediaType,
    imageDimensionLimitFailure,
    imageFileSizeLimitFailure,
    imagePixelLimitFailure,
    isAnimatedImage,
    isImageMediaType,
    readImageDimensions,
} from './image';

const ascii = (value: string): number[] => (
    Array.from(value, character => character.charCodeAt(0))
);

const uint32BigEndian = (value: number): number[] => [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
];

const uint24LittleEndian = (value: number): number[] => [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
];

const uint16BigEndian = (value: number): number[] => [
    (value >>> 8) & 0xff,
    value & 0xff,
];

const uint16LittleEndian = (value: number): number[] => [
    value & 0xff,
    (value >>> 8) & 0xff,
];

const width = 1024;
const height = 768;
const DIMENSION_FIXTURES = [
    ['image/png', [
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ...uint32BigEndian(13),
        ...ascii('IHDR'),
        ...uint32BigEndian(width),
        ...uint32BigEndian(height),
    ]],
    ['image/jpeg', [
        0xff, 0xd8, 0xff, 0xc0, 0, 7, 8,
        ...uint16BigEndian(height),
        ...uint16BigEndian(width),
    ]],
    ['image/gif', [
        ...ascii('GIF89a'),
        ...uint16LittleEndian(width),
        ...uint16LittleEndian(height),
    ]],
    ['image/webp', [
        ...ascii('RIFF'), 22, 0, 0, 0,
        ...ascii('WEBP'),
        ...ascii('VP8X'), 10, 0, 0, 0,
        0, 0, 0, 0,
        ...uint24LittleEndian(width - 1),
        ...uint24LittleEndian(height - 1),
    ]],
    ['image/avif', [
        ...uint32BigEndian(16),
        ...ascii('ftypavif'), 0, 0, 0, 0,
        ...uint32BigEndian(20),
        ...ascii('ispe'), 0, 0, 0, 0,
        ...uint32BigEndian(width),
        ...uint32BigEndian(height),
    ]],
] as const;

describe('image media types', () => {
    it.each([
        ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
        ['image/jpeg', [0xff, 0xd8, 0xff]],
        ['image/gif', ascii('GIF87a')],
        ['image/gif', ascii('GIF89a')],
        ['image/webp', [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')]],
        ['image/avif', [0, 0, 0, 16, ...ascii('ftypavif'), 0, 0, 0, 0]],
        ['image/avif', [0, 0, 0, 20, ...ascii('ftypmif1'), 0, 0, 0, 0, ...ascii('avif')]],
    ] as const)('detects %s from its binary signature', (mediaType, bytes) => {
        expect(detectImageMediaType(new Uint8Array(bytes))).toBe(mediaType);
    });

    it.each([
        new Uint8Array(),
        new Uint8Array([1, 2, 3]),
        new Uint8Array([0, 0, 0, 24, ...ascii('ftypavif'), 0, 0, 0, 0]),
    ])('does not classify unsupported or truncated data', data => {
        expect(detectImageMediaType(data)).toBeNull();
    });

    it.each([
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/avif',
        'image/gif',
    ])('accepts the supported media type %s', mediaType => {
        expect(isImageMediaType(mediaType)).toBe(true);
    });

    it('rejects a media type outside the allowlist', () => {
        expect(isImageMediaType('image/svg+xml')).toBe(false);
    });

    it.each(DIMENSION_FIXTURES)(
        'reads dimensions from %s headers without decoding pixels',
        (mediaType, bytes) => {
            expect(readImageDimensions(new Uint8Array(bytes), mediaType)).toEqual({
                width,
                height,
            });
        },
    );

    it('uses the largest image extent declared by an AVIF file', () => {
        const avifBytes = [
            ...uint32BigEndian(16),
            ...ascii('ftypavif'), 0, 0, 0, 0,
            ...uint32BigEndian(20),
            ...ascii('ispe'), 0, 0, 0, 0,
            ...uint32BigEndian(320),
            ...uint32BigEndian(200),
            ...uint32BigEndian(20),
            ...ascii('ispe'), 0, 0, 0, 0,
            ...uint32BigEndian(width),
            ...uint32BigEndian(height),
        ];

        expect(readImageDimensions(new Uint8Array(avifBytes), 'image/avif')).toEqual({
            width,
            height,
        });
    });

    it.each([
        ['image/png', [
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            ...uint32BigEndian(13), ...ascii('IHDR'),
            ...uint32BigEndian(width), ...uint32BigEndian(height),
            8, 6, 0, 0, 0, 0, 0, 0, 0,
            ...uint32BigEndian(8), ...ascii('acTL'), ...uint32BigEndian(2), ...uint32BigEndian(0), 0, 0, 0, 0,
        ]],
        ['image/gif', [
            ...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0,
            0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0,
            0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0,
            0x3b,
        ]],
        ['image/webp', [
            ...ascii('RIFF'), 12, 0, 0, 0, ...ascii('WEBP'),
            ...ascii('ANIM'), 0, 0, 0, 0,
        ]],
        ['image/avif', [
            ...uint32BigEndian(16), ...ascii('ftypavis'), 0, 0, 0, 0,
        ]],
    ] as const)('detects animated %s data', (mediaType, bytes) => {
        expect(isAnimatedImage(new Uint8Array(bytes), mediaType)).toBe(true);
    });

    it.each(DIMENSION_FIXTURES)('does not classify static %s data as animated', (mediaType, bytes) => {
        expect(isAnimatedImage(new Uint8Array(bytes), mediaType)).toBe(false);
    });

    it('rejects an image file that exceeds its compressed-byte limit', () => {
        expect(imageFileSizeLimitFailure(101, {
            maxImageFileBytes: 100,
        })).toEqual({
            kind: 'image-resource-limit',
            resource: 'file-bytes',
            limit: 100,
        });
    });

    it('rejects dimensions that exceed the pixel-count limit', () => {
        expect(imagePixelLimitFailure({ width: 1001, height: 1000 }, {
            maxImageFileBytes: 1024,
            maxImagePixels: 1_000_000,
        })).toEqual({
            kind: 'image-resource-limit',
            resource: 'pixels',
            limit: 1_000_000,
            dimensions: { width: 1001, height: 1000 },
        });
    });

    it('accepts image resources exactly at both limits', () => {
        const inputLimits = {
            maxImageFileBytes: 100,
            maxImagePixels: 1_000_000,
        };

        expect(imageFileSizeLimitFailure(100, inputLimits)).toBeNull();
        expect(imagePixelLimitFailure({ width: 1000, height: 1000 }, inputLimits)).toBeNull();
    });

    it('rejects dimensions that exceed the embedded width or height limit', () => {
        const limits = {
            maxImageFileBytes: 100,
            maxImageWidth: 2400,
            maxImageHeight: 1200,
        };

        expect(imageDimensionLimitFailure({ width: 2401, height: 1200 }, limits)).toEqual({
            kind: 'image-resource-limit',
            resource: 'width',
            limit: 2400,
        });
        expect(imageDimensionLimitFailure({ width: 2400, height: 1201 }, limits)).toEqual({
            kind: 'image-resource-limit',
            resource: 'height',
            limit: 1200,
        });
        expect(imageDimensionLimitFailure({ width: 2400, height: 1200 }, limits)).toBeNull();
    });

    it('uses separate defaults for embedded images and imports', () => {
        expect(DEFAULT_IMAGE_RESOURCE_LIMITS).toEqual({
            maxImageFileBytes: 2 * 1024 * 1024,
            maxImageWidth: 2400,
            maxImageHeight: 1200,
        });
        expect(DEFAULT_IMAGE_INPUT_RESOURCE_LIMITS).toEqual({
            maxImageFileBytes: 24 * 1024 * 1024,
            maxImagePixels: 32_000_000,
        });
    });
});
