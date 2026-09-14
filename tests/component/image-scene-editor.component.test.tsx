import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { EditImageSceneTab } from '../../src/apps/game-editor/scenes/SceneEditorForms';
import { readImageDimensions } from '../../src/game/image';
import type { Scene } from '../../src/game/model';
import { SettingsContext } from '../../src/settings/context';
import { defaultSettings } from '../../src/settings/store';
import { decodeFromBase64 } from '../../src/util';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: {
                common: {
                    loaded: 'Loaded',
                    loading: 'Loading',
                    nothing_loaded: 'Nothing loaded',
                    open: 'Open',
                },
            },
            'game-editor': {
                image_fetch_error: 'Failed to open image file',
                image_invalid_error: 'Invalid image',
                image_loaded_details: '{{width}} × {{height}} px · {{fileSize}}',
                image_open: 'Open image',
                image_processing_error: 'Image processing failed',
                image_resize_animated_error: 'Animated images cannot be resized',
                image_too_large_error: 'The image exceeds the file-size limit',
                image_too_many_pixels_error: 'The image is {{width}} × {{height}} px ({{pixelCount}}); maximum {{limit}}.',
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

it('rejects an oversized image before reading its contents', async () => {
    const maxImageInputFileBytes = 8;
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const oversizedFile = new File(
        [new Uint8Array(maxImageInputFileBytes + 1)],
        'too-large.png',
        { type: 'image/png' },
    );
    Object.defineProperty(oversizedFile, 'arrayBuffer', { value: arrayBuffer });
    const initialScene: Scene = {
        type: 'image',
        base64string: '',
        mediaType: 'image/png',
    };
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SettingsContext.Provider value={{
                settings: { ...defaultSettings, maxImageInputFileBytes },
                darkMode: false,
                updateSettings: vi.fn(),
            }}>
                <EditImageSceneTab
                    initialScene={initialScene}
                    updateScene={vi.fn()}
                    onCommitStateChange={vi.fn()}
                />
            </SettingsContext.Provider>
        </I18nextProvider>,
    );
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    Object.defineProperty(fileInput!, 'files', { configurable: true, value: [oversizedFile] });

    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));

    await expect.element(screen.getByText('The image exceeds the file-size limit')).toBeVisible();
    expect(arrayBuffer).not.toHaveBeenCalled();
});

it('applies the input pixel limit before attempting to resize', async () => {
    const oversizedPng = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0, 0, 0, 13,
        0x49, 0x48, 0x44, 0x52,
        0, 0, 0x17, 0x70,
        0, 0, 0x0f, 0xa0,
    ]);
    const sourceFile = new File([oversizedPng], 'too-many-pixels.png', { type: 'image/png' });
    const updateScene = vi.fn();
    const screen = renderImageSceneEditor(updateScene, { maxImageInputPixels: 16_000_000 });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    Object.defineProperty(fileInput!, 'files', { configurable: true, value: [sourceFile] });

    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));

    await expect.element(screen.getByText('The image is 6000 × 4000 px (24 MP); maximum 16 MP.')).toBeVisible();
    expect(updateScene).not.toHaveBeenCalled();
});

it('keeps the latest image when an older file read finishes later', async () => {
    const olderBlob = await createSolidPng(1, 1, '#ff0000');
    const newerBlob = await createSolidPng(2, 1, '#0000ff');
    const olderBytes = await olderBlob.arrayBuffer();
    let resolveOlderRead: ((data: ArrayBuffer) => void) | undefined;
    const olderRead = vi.fn(() => new Promise<ArrayBuffer>(resolve => {
        resolveOlderRead = resolve;
    }));
    const olderFile = new File([olderBlob], 'older.png', { type: 'image/png' });
    Object.defineProperty(olderFile, 'arrayBuffer', { value: olderRead });
    const newerFile = new File([newerBlob], 'newer.png', { type: 'image/png' });
    const updateScene = vi.fn();
    const screen = renderImageSceneEditor(updateScene, {});
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    Object.defineProperty(fileInput!, 'files', { configurable: true, value: [olderFile] });
    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    await expect.element(screen.getByText('Loading')).toBeVisible();
    expect(olderRead).toHaveBeenCalledOnce();

    Object.defineProperty(fileInput!, 'files', { configurable: true, value: [newerFile] });
    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    await expect.element(screen.getByText(/^Loaded: 2 × 1 px · \d+ B$/)).toBeVisible();
    const callCountAfterNewerImage = updateScene.mock.calls.length;

    resolveOlderRead?.(olderBytes);
    await new Promise(resolve => setTimeout(resolve, 0));

    await expect.element(screen.getByText(/^Loaded: 2 × 1 px · \d+ B$/)).toBeVisible();
    expect(updateScene).toHaveBeenCalledTimes(callCountAfterNewerImage);
    const committedDimensions = updateScene.mock.calls.map(([scene]) => {
        const committedScene = scene as Scene;
        if (committedScene.type === 'image') {
            const data = decodeFromBase64(committedScene.base64string);
            return readImageDimensions(data, committedScene.mediaType);
        }
        else {
            return null;
        }
    });
    expect(committedDimensions).toContainEqual({ width: 2, height: 1 });
    expect(committedDimensions).not.toContainEqual({ width: 1, height: 1 });
});

it('resizes a static image to the configured embedded-image bounds', async () => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 4;
    sourceCanvas.height = 2;
    const sourceContext = sourceCanvas.getContext('2d');
    expect(sourceContext).not.toBeNull();
    sourceContext!.fillStyle = '#ff0000';
    sourceContext!.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    const sourceBlob = await new Promise<Blob>((resolve, reject) => {
        sourceCanvas.toBlob(blob => {
            if (blob === null) {
                reject(new Error('Failed to create source image'));
            }
            else {
                resolve(blob);
            }
        }, 'image/png');
    });
    const sourceFile = new File([sourceBlob], 'large.png', { type: 'image/png' });
    const updateScene = vi.fn();
    const screen = renderImageSceneEditor(updateScene, {
        maxImageFileBytes: 1024,
        maxImageWidth: 2,
        maxImageHeight: 2,
    });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    Object.defineProperty(fileInput!, 'files', { configurable: true, value: [sourceFile] });

    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
        const resizedScene = updateScene.mock.calls
            .map(([scene]) => scene as Scene)
            .find(scene => scene.type === 'image' && scene.base64string !== '');
        expect(resizedScene?.type).toBe('image');
        if (resizedScene?.type === 'image') {
            const bytes = decodeFromBase64(resizedScene.base64string);
            expect(readImageDimensions(bytes, resizedScene.mediaType)).toEqual({ width: 2, height: 1 });
        }
    });
    await expect.element(screen.getByText(/^Loaded: 2 × 1 px · \d+ B$/)).toBeVisible();
});

it('reduces a static image until it meets the embedded byte limit', async () => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 32;
    sourceCanvas.height = 32;
    const sourceContext = sourceCanvas.getContext('2d');
    expect(sourceContext).not.toBeNull();
    const imageData = sourceContext!.createImageData(sourceCanvas.width, sourceCanvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
        imageData.data[index] = index % 251;
        imageData.data[index + 1] = (index * 3) % 251;
        imageData.data[index + 2] = (index * 7) % 251;
        imageData.data[index + 3] = 255;
    }
    sourceContext!.putImageData(imageData, 0, 0);
    const sourceBlob = await new Promise<Blob>((resolve, reject) => {
        sourceCanvas.toBlob(blob => {
            if (blob === null) {
                reject(new Error('Failed to create source image'));
            }
            else {
                resolve(blob);
            }
        }, 'image/png');
    });
    const maxImageFileBytes = 100;
    expect(sourceBlob.size).toBeGreaterThan(maxImageFileBytes);
    const sourceFile = new File([sourceBlob], 'large.png', { type: 'image/png' });
    const updateScene = vi.fn();
    renderImageSceneEditor(updateScene, {
        maxImageFileBytes,
        maxImageWidth: sourceCanvas.width,
        maxImageHeight: sourceCanvas.height,
    });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    Object.defineProperty(fileInput!, 'files', { configurable: true, value: [sourceFile] });

    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
        const resizedScene = updateScene.mock.calls
            .map(([scene]) => scene as Scene)
            .find(scene => scene.type === 'image' && scene.base64string !== '');
        expect(resizedScene?.type).toBe('image');
        if (resizedScene?.type === 'image') {
            expect(decodeFromBase64(resizedScene.base64string).byteLength).toBeLessThanOrEqual(maxImageFileBytes);
        }
    });
});

it('rejects an animated image that would need resizing', async () => {
    const animatedGif = new Uint8Array([
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0,
        0, 0, 0, 0xff, 0xff, 0xff,
        0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0,
        0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0,
        0x3b,
    ]);
    const animatedFile = new File([animatedGif], 'animated.gif', { type: 'image/gif' });
    const updateScene = vi.fn();
    const screen = renderImageSceneEditor(updateScene, {
        maxImageFileBytes: animatedGif.byteLength - 1,
    });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    Object.defineProperty(fileInput!, 'files', { configurable: true, value: [animatedFile] });

    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));

    await expect.element(screen.getByText('Animated images cannot be resized')).toBeVisible();
    expect(updateScene).not.toHaveBeenCalledWith(expect.objectContaining({
        type: 'image',
        base64string: expect.any(String),
    }));
});

function renderImageSceneEditor(updateScene: (scene: Scene) => void, settings: Partial<typeof defaultSettings>) {
    return render(
        <I18nextProvider i18n={i18n}>
            <SettingsContext.Provider value={{
                settings: { ...defaultSettings, ...settings },
                darkMode: false,
                updateSettings: vi.fn(),
            }}>
                <EditImageSceneTab
                    initialScene={{ type: 'text', text: '' }}
                    updateScene={updateScene}
                    onCommitStateChange={vi.fn()}
                />
            </SettingsContext.Provider>
        </I18nextProvider>,
    );
}

async function createSolidPng(width: number, height: number, color: string): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) {
        throw new Error('Failed to create a canvas context');
    }
    else {
        context.fillStyle = color;
        context.fillRect(0, 0, width, height);
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob === null) {
                    reject(new Error('Failed to create a PNG image'));
                }
                else {
                    resolve(blob);
                }
            }, 'image/png');
        });
    }
}
