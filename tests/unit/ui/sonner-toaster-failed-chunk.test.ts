// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { toast } from '@/lib/toast';
import messages from '@/messages/uk.json';

vi.mock('@/components/ui/sonner-runtime', () => {
  throw new Error('chunk failed to load');
});

afterEach(cleanup);

const mount = () =>
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      messages,
      children: createElement(Toaster),
    }),
  );

describe('Toaster with a runtime chunk that fails to load [UI foundation F7]', () => {
  it('shows the message in a plain live region, without an unhandled rejection or a crash', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    mount();

    await act(async () => {
      toast.error('Недостатньо прав для цієї дії.', {
        description: 'Зверніться до адміністратора.',
      });
    });

    const region = await screen.findByRole('status');
    expect(region.textContent).toContain('Недостатньо прав для цієї дії.');
    expect(region.textContent).toContain('Зверніться до адміністратора.');
    expect(screen.queryByTestId('runtime')).toBeNull();
    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
  });

  it('shows a later result and runs its action once, then closes', async () => {
    mount();
    await act(async () => {
      toast.success('Перше');
    });
    const onAction = vi.fn();
    await act(async () => {
      toast.error('Не вдалося', { action: { label: 'Повторити', onAction } });
    });

    const region = await screen.findByRole('status');
    expect(region.textContent).toContain('Не вдалося');
    expect(region.textContent).not.toContain('Перше');
    fireEvent.click(screen.getByRole('button', { name: 'Повторити' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
