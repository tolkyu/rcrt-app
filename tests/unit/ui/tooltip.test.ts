// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip } from '@/components/ui/tooltip';

const DELAY_MS = 400;
const SKIP_MS = 300;

/** The chunk is imported once for real so the lazy swap later needs only microtasks, which fake timers leave alone. */
beforeAll(async () => {
  await import('@/components/ui/tooltip-content');
});

afterEach(async () => {
  if (vi.isFakeTimers()) {
    // Lets the module-level skip window of the test expire before the next one.
    await advance(SKIP_MS + 1);
    vi.useRealTimers();
  }
  cleanup();
});

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const fakeTimers = () =>
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

const tooltip = (label = '', disabled = false) =>
  createElement(Tooltip, {
    content: `Підказка ${label}`.trim(),
    disabled,
    children: createElement(Button, null, `Дія ${label}`.trim()),
  });

const trigger = (label = '') =>
  screen.getByRole('button', { name: `Дія ${label}`.trim() });

/** Radix opens on pointermove, which the browser sends after pointerenter. */
async function hover(element: HTMLElement) {
  fireEvent.pointerEnter(element, { pointerType: 'mouse' });
  fireEvent.pointerMove(element, { pointerType: 'mouse' });
  await advance(0);
}

/** A hoverable bubble closes once the pointer moves outside the trigger, the bubble and the grace area. */
const leave = (element: HTMLElement) => {
  fireEvent.pointerLeave(element, { pointerType: 'mouse' });
  fireEvent.pointerMove(document.body, {
    pointerType: 'mouse',
    clientX: 900,
    clientY: 900,
  });
};

describe('Tooltip loading and opening [UI foundation F2]', () => {
  it('does not swap in the Radix tree for a touch pointer', async () => {
    fakeTimers();
    render(tooltip());
    fireEvent.pointerEnter(trigger(), { pointerType: 'touch' });
    await advance(DELAY_MS * 2);
    expect(trigger().hasAttribute('data-state')).toBe(false);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders no bubble and no Radix trigger state when disabled', async () => {
    fakeTimers();
    render(tooltip('', true));
    await hover(trigger());
    await advance(DELAY_MS * 2);
    expect(trigger().hasAttribute('data-state')).toBe(false);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens a hovered trigger after the 400 ms delay in the delayed-open state, without a second pointer move', async () => {
    fakeTimers();
    render(tooltip());
    fireEvent.pointerEnter(trigger(), { pointerType: 'mouse' });
    await advance(0);
    expect(trigger().getAttribute('data-state')).toBe('closed');
    await advance(DELAY_MS - 50);
    expect(screen.queryByRole('tooltip')).toBeNull();
    await advance(100);
    const open = screen.getByRole('tooltip').closest('[data-state]');
    expect(open?.getAttribute('data-state')).toBe('delayed-open');
    expect(open?.hasAttribute('data-instant')).toBe(false);
  });

  it('cancels the opening when the pointer leaves before the delay and closes an open one on leave', async () => {
    fakeTimers();
    render(tooltip());
    await hover(trigger());
    await advance(100);
    leave(trigger());
    await advance(DELAY_MS * 2);
    expect(screen.queryByRole('tooltip')).toBeNull();

    await hover(trigger());
    await advance(DELAY_MS + 50);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    leave(trigger());
    await advance(300);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes an open tooltip on Escape', async () => {
    fakeTimers();
    render(tooltip());
    await hover(trigger());
    await advance(DELAY_MS + 50);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await advance(10);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens the next tooltip at once and without animation inside the skip window, then waits again', async () => {
    fakeTimers();
    render(
      createElement('div', null, tooltip('A'), tooltip('B'), tooltip('C')),
    );
    await hover(trigger('A'));
    await advance(DELAY_MS + 50);
    expect(screen.getByRole('tooltip').textContent).toBe('Підказка A');
    leave(trigger('A'));
    await advance(150);

    await hover(trigger('B'));
    await advance(20);
    const second = screen.getByRole('tooltip');
    expect(second.textContent).toBe('Підказка B');
    expect(second.closest('[data-instant]')).not.toBeNull();
    leave(trigger('B'));
    await advance(SKIP_MS + 100);

    await hover(trigger('C'));
    await advance(DELAY_MS - 100);
    expect(screen.queryByRole('tooltip')).toBeNull();
    await advance(200);
    expect(screen.getByRole('tooltip').closest('[data-instant]')).toBeNull();
  });
});

describe('Tooltip semantics and races [UI foundation F2]', () => {
  it('does not open for a pointer that left between the swap and the synthetic move', async () => {
    fakeTimers();
    render(tooltip());
    fireEvent.pointerEnter(trigger(), { pointerType: 'mouse' });
    // Microtasks only: the chunk swap commits, the 0 ms move is still pending.
    await act(async () => {
      for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
    });
    expect(trigger().hasAttribute('data-state')).toBe(true);
    fireEvent.pointerLeave(trigger(), { pointerType: 'mouse' });
    await advance(DELAY_MS * 2);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('describes its trigger with the tooltip text while open when not decorative', async () => {
    fakeTimers();
    render(tooltip());
    await hover(trigger());
    await advance(DELAY_MS + 50);
    expect(
      screen.getByRole('button', { name: 'Дія', description: /^Підказкаs*$/ }),
    ).toBeTruthy();
  });
});

describe('Tooltip inside a Radix Dialog [UI foundation F2]', () => {
  it('keeps keyboard focus on the trigger and opens it when the chunk swaps the node', async () => {
    render(
      createElement(
        Dialog,
        { defaultOpen: true },
        createElement(
          DialogContent,
          { closeLabel: 'Закрити' },
          createElement(DialogTitle, null, 'Діалог'),
          createElement(DialogDescription, null, 'Опис'),
          createElement(Button, null, 'Перша'),
          tooltip(),
        ),
      ),
    );
    const pointer = userEvent.setup();
    // The dialog focuses its first button; Tab moves to the trigger.
    await pointer.tab();
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy());
    expect(document.activeElement).toBe(trigger());
    expect(screen.getByRole('tooltip').textContent).toBe('Підказка');
  });
});
