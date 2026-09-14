import { createInstance } from 'i18next';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import {
    CommandCancelButton,
    CommandTriggerButton,
    CommandTriggerCancelButton,
} from '../../src/gui-helpers/command-controls/CommandControls';
import type { CommandControlStatus } from '../../src/gui-helpers/command-controls/command-control-status';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: {
                common: {
                    cancel: 'Cancel',
                    cancelling: 'Cancelling...',
                    loading: 'Loading...',
                },
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

it('keeps the running command and its cancel action as separate buttons', async () => {
    const onExecute = vi.fn();
    const onCancel = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <CommandCancelButton
                onClick={onCancel}
                status='running'
            />
            <CommandTriggerButton
                onClick={onExecute}
                status='running'
            >
                Execute
            </CommandTriggerButton>
        </I18nextProvider>,
    );

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await expect.element(cancelButton).toBeEnabled();
    await expect.element(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    await expect.element(screen.getByRole('status')).toHaveTextContent('Loading...');
    await cancelButton.click();

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onExecute).not.toHaveBeenCalled();
});

it('hides cancellation while the command is idle', async () => {
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <CommandCancelButton
                data-testid='cancel-command'
                onClick={vi.fn()}
                status='idle'
            />
            <CommandTriggerButton
                onClick={vi.fn()}
                status='idle'
            >
                Execute
            </CommandTriggerButton>
        </I18nextProvider>,
    );

    await expect.element(screen.getByRole('button', { name: 'Execute' })).toBeEnabled();
    await expect.element(screen.getByTestId('cancel-command')).toHaveAttribute('hidden');
});

it('disables both controls after cancellation was requested', async () => {
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <CommandCancelButton
                data-testid='cancel-command'
                onClick={vi.fn()}
                status='rebuilding-after-cancellation'
            />
            <CommandTriggerButton
                data-testid='trigger-command'
                onClick={vi.fn()}
                status='rebuilding-after-cancellation'
            >
                Execute
            </CommandTriggerButton>
        </I18nextProvider>,
    );

    await expect.element(screen.getByTestId('cancel-command')).toBeDisabled();
    await expect.element(screen.getByTestId('trigger-command')).toBeDisabled();
    await expect.element(screen.getByRole('status')).toHaveTextContent('Cancelling...');
});

function StatefulTriggerCancelButton({
    initialStatus = 'idle',
    onCancel,
    onExecute,
}: {
    initialStatus?: CommandControlStatus,
    onCancel: () => void,
    onExecute: () => void,
}) {
    const [status, setStatus] = useState<CommandControlStatus>(initialStatus);
    return (
        <CommandTriggerCancelButton
            aria-label='Execute'
            onClick={() => {
                onExecute();
                setStatus('running');
            }}
            onCancel={() => {
                onCancel();
                setStatus('rebuilding-after-cancellation');
            }}
            status={status}
        >
            Execute
        </CommandTriggerCancelButton>
    );
}

it('changes the combined trigger button from execute to cancel to cancelling', async () => {
    const onCancel = vi.fn();
    const onExecute = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <StatefulTriggerCancelButton onCancel={onCancel} onExecute={onExecute} />
        </I18nextProvider>,
    );

    await screen.getByRole('button', { name: 'Execute' }).click();
    expect(onExecute).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await expect.element(cancelButton).toBeEnabled();
    await cancelButton.click();
    expect(onCancel).toHaveBeenCalledOnce();

    await expect.element(screen.getByRole('button', { name: 'Cancelling...' })).toBeDisabled();
    await expect.element(screen.getByRole('status')).toHaveTextContent('Cancelling...');
});

it('prevents a second cancellation while the combined trigger button is cancelling', async () => {
    const onCancel = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <StatefulTriggerCancelButton
                initialStatus='running'
                onCancel={onCancel}
                onExecute={vi.fn()}
            />
        </I18nextProvider>,
    );

    await screen.getByRole('button', { name: 'Cancel' }).click();
    const cancellingButton = screen.getByRole('button', { name: 'Cancelling...' });
    await expect.element(cancellingButton).toBeDisabled();

    (cancellingButton.element() as HTMLButtonElement).click();
    expect(onCancel).toHaveBeenCalledOnce();
});
