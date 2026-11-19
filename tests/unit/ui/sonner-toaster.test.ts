// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement, startTransition, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as SonnerModule from '@/components/ui/sonner';
import type * as ToastApi from '@/lib/toast';

vi.mock('@/components/ui/sonner-runtime', () => ({
  default: (props: { position?: string }) =>
    createElement('div', { 'data-testid': 'runtime' }, props.position ?? 'ok'),
}));

async function fresh(): Promise<{
  Toaster: typeof SonnerModule.Toaster;
  toast: typeof ToastApi.toast;
}> {
  vi.resetModules();
  const [{ Toaster }, { toast }] = await Promise.all([
    import('@/components/ui/sonner'),
    import('@/lib/toast'),
  ]);
  return { Toaster, toast };
}

afterEach(cleanup);

describe('Toaster [UI foundation F7, BUG-S3-14]', () => {
  it('loads nothing until the first toast, then mounts the runtime with the given props', async () => {
    const { Toaster, toast } = await fresh();
    render(createElement(Toaster, { position: 'top-center' }));
    expect(screen.queryByTestId('runtime')).toBeNull();

    act(() => toast.error('Недостатньо прав для цієї дії.'));

    expect((await screen.findByTestId('runtime')).textContent).toBe(
      'top-center',
    );
  });

  it('mounts the runtime when a toast was raised before the Toaster itself mounted', async () => {
    const { Toaster, toast } = await fresh();
    toast.info('Раніше');

    render(createElement(Toaster));

    expect(await screen.findByTestId('runtime')).toBeTruthy();
  });

  it('keeps the runtime when a transition re-renders the tree right after the toast (router.refresh)', async () => {
    const { Toaster, toast } = await fresh();
    let refresh: () => void = () => undefined;
    function Shell() {
      const [version, setVersion] = useState(0);
      refresh = () => startTransition(() => setVersion((value) => value + 1));
      return createElement(
        'div',
        { 'data-version': version },
        createElement(Toaster),
      );
    }
    render(createElement(Shell));

    act(() => {
      toast.error('Недостатньо прав для цієї дії.');
      refresh();
    });

    expect(await screen.findByTestId('runtime')).toBeTruthy();
  });
});
