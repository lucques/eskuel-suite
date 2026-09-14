import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { SceneNavbar } from '../../src/apps/game-console/SceneNavbar';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: {
                common: { loading: 'Loading...' },
                game_console: {
                    scene_title: 'Scene {{current}} / {{total}}',
                    previous_scene: 'Previous',
                    next_scene: 'Next',
                    skip_scene: 'Skip',
                    skipped_scenes: '{{count}} skipped',
                    restart: 'Restart',
                },
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

function renderNavbar({
    running = false,
    canGoPrevious = true,
    canGoNext = true,
    canSkip = true,
}: {
    running?: boolean,
    canGoPrevious?: boolean,
    canGoNext?: boolean,
    canSkip?: boolean,
}) {
    const handlers = {
        onPrevious: vi.fn(),
        onNext: vi.fn(),
        onSkip: vi.fn(),
        onReset: vi.fn(),
    };
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SceneNavbar
                current={2}
                total={5}
                canGoPrevious={canGoPrevious}
                canGoNext={canGoNext}
                canSkip={canSkip}
                commandStatus={running
                    ? {
                        kind: 'running',
                        command: { type: 'previous-scene' },
                    }
                    : { kind: 'idle' }}
                skippedCount={1}
                {...handlers}
            />
        </I18nextProvider>,
    );
    return { screen, handlers };
}

describe('SceneNavbar command state', () => {
    it('disables every command and exposes a loading indicator while work is running', async () => {
        const { screen } = renderNavbar({ running: true });

        await expect.element(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
        await expect.element(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
        await expect.element(screen.getByRole('button', { name: 'Skip' })).toBeDisabled();
        await expect.element(screen.getByRole('button', { name: 'Restart' })).toBeDisabled();
        await expect.element(screen.getByRole('status')).toHaveTextContent('Loading...');
    });

    it('releases commands and forwards user interaction when idle', async () => {
        const { screen, handlers } = renderNavbar({});
        const next = screen.getByRole('button', { name: 'Next' });

        await expect.element(next).toBeEnabled();
        await next.click();
        expect(handlers.onNext).toHaveBeenCalledOnce();
    });

    it('keeps unavailable navigation disabled while idle', async () => {
        const { screen } = renderNavbar({
            canGoPrevious: false,
            canGoNext: false,
        });

        await expect.element(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
        await expect.element(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
        await expect.element(screen.getByRole('button', { name: 'Restart' })).toBeEnabled();
    });
});
