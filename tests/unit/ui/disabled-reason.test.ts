// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { DisabledReason } from '@/components/ui/disabled-reason';
import { Tooltip } from '@/components/ui/tooltip';

afterEach(cleanup);

const REASON = 'Заповніть посаду, щоб опублікувати.';

function mount(onClick: () => void, disabled = true) {
  render(
    createElement(
      'form',
      { onSubmit: (event: Event) => event.preventDefault() },
      createElement(DisabledReason, {
        reason: REASON,
        disabled,
        children: createElement(
          Button,
          { onClick, type: 'submit' },
          'Опублікувати',
        ),
      }),
    ),
  );
  return screen.getByRole('button', { name: 'Опублікувати' });
}

describe('DisabledReason [UI foundation F2, ui-foundation section 6]', () => {
  it('keeps the action focusable and describes it with the reason', async () => {
    const button = mount(vi.fn());
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    const reason = document.getElementById(
      button.getAttribute('aria-describedby') ?? '',
    );
    expect(reason?.textContent).toBe(REASON);
    await userEvent.tab();
    // The first focus loads the tooltip chunk, which replaces the trigger and hands focus to the new node.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Опублікувати' }),
      ),
    );
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('fires no handler and submits nothing on click, Enter or Space', async () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn();
    const button = mount(onClick);
    (button as HTMLButtonElement).form?.addEventListener('submit', onSubmit);
    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('leaves an available action untouched', async () => {
    const onClick = vi.fn();
    const button = mount(onClick, false);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    expect(screen.queryByText(REASON)).toBeNull();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the reason for screen readers and shows it as text where hover does not exist', () => {
    mount(vi.fn());
    const reason = screen.getByText(REASON);
    expect(reason.className).toContain('sr-only');
    expect(reason.className).toContain('[@media(hover:none)]:not-sr-only');
  });

  it('shows the reason in a tooltip on hover', async () => {
    const button = mount(vi.fn());
    await userEvent.hover(button);
    const tooltip = await screen.findByRole('tooltip', {}, { timeout: 3000 });
    expect(tooltip.textContent).toBe(REASON);
  });
});

describe('DisabledReason around other elements [UI foundation F2]', () => {
  it('blocks navigation of a link on click, Enter and auxclick', () => {
    const onClick = vi.fn();
    render(
      createElement(DisabledReason, {
        reason: REASON,
        children: createElement(
          'a',
          { href: '/vacancies', onClick },
          'Відкрити',
        ),
      }),
    );
    const link = screen.getByText('Відкрити');
    expect(fireEvent.click(link)).toBe(false);
    expect(fireEvent.keyDown(link, { key: 'Enter' })).toBe(false);
    expect(fireEvent.keyUp(link, { key: ' ' })).toBe(false);
    expect(
      fireEvent(
        link,
        new MouseEvent('auxclick', {
          bubbles: true,
          cancelable: true,
          button: 1,
        }),
      ),
    ).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('still passes other keys to the child handlers', () => {
    const onKeyDown = vi.fn();
    const onKeyUp = vi.fn();
    render(
      createElement(DisabledReason, {
        reason: REASON,
        children: createElement(Button, { onKeyDown, onKeyUp }, 'Дія'),
      }),
    );
    const button = screen.getByRole('button', { name: 'Дія' });
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.keyUp(button, { key: 'ArrowDown' });
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyUp).toHaveBeenCalledTimes(1);
  });

  it('announces the reason once while the tooltip is open', async () => {
    const button = mount(vi.fn());
    await userEvent.hover(button);
    await screen.findByRole('tooltip', {}, { timeout: 3000 });
    // Accessible description = text of every referenced node, skipping aria-hidden descendants.
    expect(
      screen.getByRole('button', {
        name: 'Опублікувати',
        description: /^Заповніть посаду, щоб опублікувати\.\s*$/,
      }),
    ).toBeTruthy();
  });
});

describe('Tooltip [UI foundation F2]', () => {
  const tooltip = () =>
    createElement(Tooltip, {
      content: 'Підказка',
      children: createElement(Button, null, 'Дія'),
    });

  it('renders only the trigger until the first hover or focus', () => {
    render(tooltip());
    expect(screen.getByRole('button', { name: 'Дія' })).toBeTruthy();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on keyboard focus without the hover delay, keeps focus and closes on Escape', async () => {
    render(tooltip());
    await userEvent.tab();
    const bubble = await screen.findByRole('tooltip', {}, { timeout: 3000 });
    expect(bubble.textContent).toBe('Підказка');
    expect(document.activeElement).toBe(screen.getByRole('button'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
