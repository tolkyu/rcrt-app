// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

const onOpenChange = vi.fn();
const onInteractOutside = vi.fn();

const dialog = (): ReactElement =>
  createElement(Dialog, {
    open: true,
    onOpenChange,
    children: createElement(
      DialogContent,
      { closeLabel: 'Закрити', onInteractOutside },
      createElement(DialogTitle, null, 'Діалог'),
    ),
  });

const sheet = (): ReactElement =>
  createElement(Sheet, {
    open: true,
    onOpenChange,
    children: createElement(
      SheetContent,
      { closeLabel: 'Закрити', onInteractOutside },
      createElement(SheetTitle, null, 'Панель'),
    ),
  });

/** Radix registers its outside-pointer listener on the next macrotask. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A modal waits for the click that follows the pointer-down before it treats it as an outside dismissal. */
async function clickOutside(target: Element) {
  fireEvent.pointerDown(target);
  fireEvent.click(target);
  await settle();
}

beforeEach(() => {
  onOpenChange.mockClear();
  onInteractOutside.mockClear();
  document.body.insertAdjacentHTML(
    'beforeend',
    '<ol data-sonner-toaster><li><button id="toast-close">×</button></li></ol><div id="elsewhere"></div>',
  );
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe.each([
  ['Dialog', dialog],
  ['Sheet', sheet],
] as const)('%s and toasts [UI foundation F7]', (_name, modal) => {
  it('stays open when the pointer goes down inside a toast and does not bother the consumer', async () => {
    render(modal());
    await settle();

    await clickOutside(document.getElementById('toast-close')!);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onInteractOutside).not.toHaveBeenCalled();
  });

  it('still closes on any other outside click and runs the consumer handler first', async () => {
    render(modal());
    await settle();

    await clickOutside(document.getElementById('elsewhere')!);

    expect(onInteractOutside).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
