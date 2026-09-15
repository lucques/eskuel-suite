import { userEvent } from '@vitest/browser/context';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { NewGameFileModal } from '../../src/apps/game-editor/NewGameFileModal';
import commonEnglish from '../../src/i18n/locales/common/en.json';
import gameEditorEnglish from '../../src/i18n/locales/game-editor/en.json';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    resources: {
        en: {
            common: commonEnglish,
            'game-editor': gameEditorEnglish,
        },
    },
    showSupportNotice: false,
});

// Keep a regression from navigating away from the test runner, while recording
// whether the modal itself prevented the browser's default submission.
const observeSubmit = vi.fn((event: SubmitEvent) => {
    const prevented = event.defaultPrevented;
    event.preventDefault();
    return prevented;
});

beforeEach(() => {
    observeSubmit.mockClear();
    document.addEventListener('submit', observeSubmit);
});

afterEach(() => {
    document.removeEventListener('submit', observeSubmit);
});

for (const action of ['Enter', 'Create'] as const) {
    it(`creates a game once without navigating when using ${action}`, async () => {
        const onCreate = vi.fn();
        const onHide = vi.fn();
        const screen = render(
            <I18nextProvider i18n={i18n}>
                <NewGameFileModal show onHide={onHide} onCreate={onCreate} />
            </I18nextProvider>,
        );

        await screen.getByRole('textbox').fill('Keyboard game');
        if (action === 'Enter') {
            await userEvent.keyboard('{Enter}');
        }
        else if (action === 'Create') {
            await screen.getByRole('button', { name: 'Create', exact: true }).click();
        }
        else { const _n: never = action; }

        expect(onCreate).toHaveBeenCalledExactlyOnceWith('Keyboard game');
        expect(onHide).toHaveBeenCalledOnce();
        expect(observeSubmit).toHaveBeenCalledOnce();
        expect(observeSubmit).toHaveReturnedWith(true);
    });
}

it('does not create an unnamed game when pressing Enter or submitting directly', async () => {
    const onCreate = vi.fn();
    const onHide = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <NewGameFileModal show onHide={onHide} onCreate={onCreate} />
        </I18nextProvider>,
    );

    const nameInput = screen.getByRole('textbox');
    await nameInput.fill('');
    await userEvent.keyboard('{Enter}');
    await expect.element(screen.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();

    const submit = new Event('submit', { bubbles: true, cancelable: true });
    nameInput.element().closest('form')!.dispatchEvent(submit);

    expect(observeSubmit).toHaveReturnedWith(true);
    expect(onCreate).not.toHaveBeenCalled();
    expect(onHide).not.toHaveBeenCalled();
    await expect.element(screen.getByRole('dialog')).toBeVisible();
});
