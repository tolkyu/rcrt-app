import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOrReload } from '@/lib/load-or-reload';

const store = new Map<string, string>();
const reload = vi.fn();

beforeEach(() => {
  store.clear();
  reload.mockReset();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  vi.stubGlobal('window', { location: { reload } });
});
afterEach(() => vi.unstubAllGlobals());

const failing = () => Promise.reject(new Error('ChunkLoadError'));
const expectPending = async (promise: Promise<unknown>) => {
  const settled = vi.fn();
  void promise.then(settled, settled);
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
};

describe('On-demand chunk loading after a deploy [SEC-AAF-01, PERF-04]', () => {
  it('reloads once on the first failure and stays pending while the page reloads', async () => {
    await expectPending(loadOrReload(failing, () => 1_000_000));
    expect(reload).toHaveBeenCalledOnce();
    expect(store.get('chunk-reload-at')).toBe('1000000');
  });

  it('rejects to the error boundary on a second failure within 30 s instead of reloading again', async () => {
    void loadOrReload(failing, () => 1_000_000);
    await Promise.resolve();
    await expect(loadOrReload(failing, () => 1_029_999)).rejects.toThrow(
      'ChunkLoadError',
    );
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads again once the 30 s window has passed', async () => {
    store.set('chunk-reload-at', '1000000');
    await expectPending(loadOrReload(failing, () => 1_030_000));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('keeps the reload window after an unrelated chunk succeeds', async () => {
    await expectPending(loadOrReload(failing, () => 1_000_000));
    await expect(loadOrReload(() => Promise.resolve('chunk'))).resolves.toBe(
      'chunk',
    );
    expect(store.get('chunk-reload-at')).toBe('1000000');
    await expect(loadOrReload(failing, () => 1_010_000)).rejects.toThrow(
      'ChunkLoadError',
    );
    expect(reload).toHaveBeenCalledOnce();
  });

  it('rethrows without reloading when sessionStorage is unavailable', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    await expect(loadOrReload(failing)).rejects.toThrow('ChunkLoadError');
    expect(reload).not.toHaveBeenCalled();
  });

  it('rethrows without reloading when storage can be read but cannot be written', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    await expect(loadOrReload(failing)).rejects.toThrow('ChunkLoadError');
    expect(reload).not.toHaveBeenCalled();
  });
});
