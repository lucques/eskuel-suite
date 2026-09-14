import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { SourceStatusPanelWithOpenSaveButtons } from '../../src/gui-helpers/source-status-panel/SourceStatusPanel';

const i18n = createInstance();
await i18n.init({
    lng: 'de',
    fallbackLng: 'de',
    resources: {
        de: {
            common: {
                common: {
                    loaded: 'Geladen',
                    open: 'Öffnen',
                    save: 'Speichern',
                },
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

it('translates source actions and status text', async () => {
    const onOpen = vi.fn();
    const onSave = vi.fn();
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SourceStatusPanelWithOpenSaveButtons
                onOpen={onOpen}
                tooltipText='Datenbank öffnen'
                status={{ kind: 'loaded' }}
                onSave={onSave}
                saveTooltipText='Datenbank speichern'
            />
        </I18nextProvider>
    );
    const openButton = screen.getByRole('button', { name: 'Öffnen' });
    const saveButton = screen.getByRole('button', { name: 'Speichern' });

    await expect.element(screen.getByText('Geladen')).toBeVisible();
    await openButton.click();
    await saveButton.click();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
});
