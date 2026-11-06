import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthAdmin } from '@/server/auth/admin';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Auth lifecycle request deadline [SEC-ACT-05, ADR-011]', () => {
  it.each([true, false])(
    'aborts a hung ban=%s request after 10 seconds',
    async (banned) => {
      vi.useFakeTimers();
      vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
      vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'fixture-publishable');
      vi.stubEnv('SUPABASE_SECRET_KEY', 'fixture-secret');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const timeout = vi
        .spyOn(AbortSignal, 'timeout')
        .mockImplementation((ms) => {
          const controller = new AbortController();
          setTimeout(
            () =>
              controller.abort(
                new DOMException('Deadline exceeded', 'TimeoutError'),
              ),
            ms,
          );
          return controller.signal;
        });
      const fetchMock = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init!.signal!.addEventListener(
              'abort',
              () => reject(init!.signal!.reason),
              { once: true },
            );
          }),
      );
      vi.stubGlobal('fetch', fetchMock);
      let settled = false;
      const pending = createAuthAdmin()
        .setBanned('37211bf7-c7ef-4099-aa9d-d4fd3da8eb9d', banned)
        .then((result) => {
          settled = true;
          return result;
        });
      await vi.advanceTimersByTimeAsync(9_999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);
      expect(timeout).toHaveBeenCalledWith(10_000);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toContain(
        '/auth/v1/admin/users/37211bf7-c7ef-4099-aa9d-d4fd3da8eb9d',
      );
      expect(JSON.parse(init!.body as string)).toEqual({
        ban_duration: banned ? '876000h' : 'none',
      });
      await vi.advanceTimersByTimeAsync(1);
      expect(init!.signal!.aborted).toBe(true);
      await expect(pending).resolves.toBe(false);
    },
  );
});
