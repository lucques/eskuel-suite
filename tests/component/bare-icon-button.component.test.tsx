import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { BareIconButton } from '../../src/gui-helpers/bare-icon-button/BareIconButton';

it('exposes an accessible action independent of its icon and tooltip', async () => {
    const onClick = vi.fn();
    const screen = render(
        <BareIconButton
            accessibleName='Insert scene'
            onClick={onClick}
            tooltipText='Choose this insertion point'
        >
            <svg width='16' height='16' aria-hidden='true'>
                <circle cx='8' cy='8' r='6' />
            </svg>
        </BareIconButton>,
    );
    const button = screen.getByRole('button', { name: 'Insert scene' });

    await expect.element(button).toBeEnabled();
    await button.click();
    expect(onClick).toHaveBeenCalledOnce();
});

it('uses native disabled-button behavior', async () => {
    const screen = render(
        <BareIconButton
            accessibleName='Delete scene'
            disabled={true}
            onClick={vi.fn()}
        >
            <svg width='16' height='16' aria-hidden='true'>
                <circle cx='8' cy='8' r='6' />
            </svg>
        </BareIconButton>,
    );

    await expect.element(screen.getByRole('button', { name: 'Delete scene' })).toBeDisabled();
});
