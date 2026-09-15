import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import type { Scene } from '../../src/game/model';
import type { ImageSceneFormCommitState } from '../../src/apps/game-editor/scenes/SceneEditorForms';

vi.mock('../../src/apps/game-editor/scenes/SceneEditorForms', () => ({
    EditTextSceneTab: () => null,
    EditSelectSceneTab: () => null,
    EditManipulateSceneTab: () => null,
    EditImageSceneTab: ({ initialScene, updateScene, onCommitStateChange }: {
        initialScene: Scene | null,
        updateScene: (scene: Scene) => void,
        onCommitStateChange: (state: ImageSceneFormCommitState) => void,
    }) => initialScene === null
        ? null
        : (
            <button
                type='button'
                onClick={() => {
                    updateScene({
                        type: 'image',
                        base64string: 'selected-image',
                        mediaType: 'image/png',
                    });
                    onCommitStateChange('ready');
                }}
            >
                Finish loading image
            </button>
        ),
}));

import { AddSceneModal, EditSceneModal } from '../../src/apps/game-editor/scenes/SceneEditorModals';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: {
                common: {
                    add: 'Add',
                    close: 'Close',
                    save: 'Save',
                },
            },
            'game-editor': {
                scene_add_title: 'Add scene',
                scene_default_text: 'New scene',
                scene_type_image: 'Image',
                scene_type_manipulate: 'Manipulate',
                scene_type_prompt: 'Scene type',
                scene_type_select: 'Select',
                scene_type_text: 'Text',
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

for (const action of ['Add', 'Save'] as const) {
    it(`handles ${action} submissions without navigation and rejects an unloaded image`, async () => {
        const onSaveAndHide = vi.fn();
        const screen = render(
            <I18nextProvider i18n={i18n}>
                {action === 'Add'
                    ? <AddSceneModal show onHide={() => {}} onSaveAndHide={onSaveAndHide} />
                    : <EditSceneModal
                        initialScene={{ type: 'text', text: 'Original scene', key: 'original' }}
                        onHide={() => {}}
                        onSaveAndHide={onSaveAndHide}
                    />}
            </I18nextProvider>,
        );
        const saveButton = screen.getByRole('button', { name: action, exact: true });
        await expect.element(saveButton).toBeEnabled();

        const form = screen.getByRole('dialog').element().querySelector('form')!;
        const submit = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submit);

        expect(submit.defaultPrevented).toBe(true);
        expect(onSaveAndHide).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'text' }));
        onSaveAndHide.mockClear();

        await screen.getByRole('radio', { name: 'Image' }).click();
        await expect.element(saveButton).toBeDisabled();
        const invalidSubmit = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(invalidSubmit);

        expect(invalidSubmit.defaultPrevented).toBe(true);
        expect(onSaveAndHide).not.toHaveBeenCalled();
    });
}

it('requires a successfully loaded image before adding an image scene', async () => {
    const onSaveAndHide = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <AddSceneModal
                show={true}
                onHide={() => {}}
                onSaveAndHide={onSaveAndHide}
            />
        </I18nextProvider>,
    );
    const addButton = screen.getByRole('button', { name: 'Add' });

    await expect.element(addButton).toBeEnabled();
    await screen.getByRole('radio', { name: 'Image' }).click();
    await expect.element(addButton).toBeDisabled();

    await screen.getByRole('button', { name: 'Finish loading image' }).click();
    await expect.element(addButton).toBeEnabled();
    await addButton.click();

    expect(onSaveAndHide).toHaveBeenCalledWith({
        type: 'image',
        base64string: 'selected-image',
        mediaType: 'image/png',
    });
});
