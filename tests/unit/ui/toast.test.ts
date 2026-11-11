import { describe, expect, it, vi } from 'vitest';
import type * as ToastApi from '@/lib/toast';

type ToastModule = typeof ToastApi;

/** The queue and sink are module state, so every test starts from a fresh module. */
async function freshToast(): Promise<ToastModule> {
  vi.resetModules();
  return import('@/lib/toast');
}

describe('toast [UI foundation F7]', () => {
  it('keeps the message-only calls working and defaults the duration per tone', async () => {
    const { toast, connectToasts } = await freshToast();
    const received = vi.fn();
    connectToasts(received);

    toast.success('Збережено');
    toast.error('Помилка');

    expect(received).toHaveBeenNthCalledWith(1, {
      tone: 'success',
      title: 'Збережено',
      description: undefined,
      action: undefined,
      id: undefined,
      duration: 4000,
    });
    expect(received).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tone: 'error', duration: 8000 }),
    );
  });

  it.each([
    ['success', 4000],
    ['info', 5000],
    ['warning', 8000],
    ['error', 8000],
  ] as const)('uses %s with a %i ms default', async (tone, duration) => {
    const { toast, connectToasts } = await freshToast();
    const received = vi.fn();
    connectToasts(received);

    toast[tone]('Заголовок', { description: 'Опис' });

    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        tone,
        title: 'Заголовок',
        description: 'Опис',
        duration,
      }),
    );
  });

  it('keeps a toast with an action until it is closed, unless the caller sets a duration', async () => {
    const { toast, connectToasts } = await freshToast();
    const received = vi.fn();
    connectToasts(received);
    const onAction = vi.fn();

    toast.warning('Дані вже змінилися', {
      action: { label: 'Оновити', onAction },
    });
    toast.warning('Дані вже змінилися', {
      action: { label: 'Оновити', onAction },
      duration: 12_000,
    });

    expect(received.mock.calls[0]?.[0]).toMatchObject({
      duration: Infinity,
      action: { label: 'Оновити', onAction },
    });
    expect(received.mock.calls[1]?.[0]).toMatchObject({ duration: 12_000 });
  });

  it('queues toasts raised before the runtime loads, asks for the runtime once, and flushes in order', async () => {
    const { toast, toastRequested, subscribeToToasts, connectToasts } =
      await freshToast();
    const requested = vi.fn();
    subscribeToToasts(requested);
    expect(toastRequested()).toBe(false);

    toast.info('Перше');
    toast.error('Друге', { description: 'Опис' });

    expect(toastRequested()).toBe(true);
    expect(requested).toHaveBeenCalledTimes(2);

    const received = vi.fn();
    connectToasts(received);
    expect(received.mock.calls.map(([n]) => n.title)).toEqual([
      'Перше',
      'Друге',
    ]);

    received.mockClear();
    const late = vi.fn();
    connectToasts(late);
    expect(late).not.toHaveBeenCalled();
  });

  it('replaces a queued toast that has the same id instead of queueing a second one', async () => {
    const { toast, connectToasts } = await freshToast();
    toast.warning('Старе', { id: 'stale:vacancy:1' });
    toast.info('Інше');
    toast.warning('Нове', { id: 'stale:vacancy:1' });
    toast.warning('Інший запис', { id: 'stale:vacancy:2' });

    const received = vi.fn();
    connectToasts(received);

    expect(received.mock.calls.map(([n]) => [n.id, n.title])).toEqual([
      ['stale:vacancy:1', 'Нове'],
      [undefined, 'Інше'],
      ['stale:vacancy:2', 'Інший запис'],
    ]);
  });

  it('passes the id straight through once the runtime is connected, and queues again after it disconnects', async () => {
    const { toast, connectToasts, toastRequested } = await freshToast();
    const received = vi.fn();
    const disconnect = connectToasts(received);

    toast.warning('Дані вже змінилися', { id: 'stale:vacancy:1' });
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'stale:vacancy:1' }),
    );
    expect(toastRequested()).toBe(false);

    disconnect();
    toast.success('Після відключення');
    expect(received).toHaveBeenCalledTimes(1);
    expect(toastRequested()).toBe(true);
  });
});
