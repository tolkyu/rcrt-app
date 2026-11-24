// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

vi.mock('@/components/ui/tooltip-content', () => {
  throw new Error('chunk failed to load');
});

afterEach(cleanup);

describe('Tooltip with a chunk that fails to load [UI foundation F2]', () => {
  it('keeps the plain trigger working and shows no tooltip', async () => {
    const onClick = vi.fn();
    render(
      createElement(Tooltip, {
        content: 'Підказка',
        children: createElement(Button, { onClick }, 'Дія'),
      }),
    );
    const button = screen.getByRole('button', { name: 'Дія' });
    await userEvent.hover(button);
    await userEvent.tab();
    // Lets the rejected import settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Дія' }).hasAttribute('data-state'),
    ).toBe(false);
  });
});
