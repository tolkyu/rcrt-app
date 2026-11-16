import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  loginFallback,
  totpFallback,
} from '@/components/auth/fallback-validation';
import { lazyResolver, lazyValidation } from '@/components/auth/lazy-resolver';
import { apiRequest } from '@/lib/api-client';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lazy response schema fails closed (PERF-04, SEC F3)', () => {
  it('a schema chunk that cannot load rejects before any request is sent, so the server never acts', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ url: 'javascript:alert(1)' }));
    vi.stubGlobal('fetch', fetchMock);
    const failed = async (): Promise<z.ZodType<{ url: string }>> => {
      throw new Error('ChunkLoadError');
    };
    await expect(
      apiRequest('/auth/google', { method: 'POST', schema: failed }),
    ).rejects.toThrow('ChunkLoadError');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    '/auth/magic-link',
    '/auth/mfa/verify',
    '/auth/mfa/enroll',
    '/auth/logout',
  ])('%s sends nothing when its schema thunk rejects', async (path) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      apiRequest(path, {
        method: 'POST',
        body: {},
        schema: () => Promise.reject(new Error('ChunkLoadError')),
      }),
    ).rejects.toThrow('ChunkLoadError');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a thunk is resolved once per call, ahead of the request', async () => {
    const order: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async () => {
      order.push('fetch');
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/me', {
      schema: async () => {
        order.push('schema');
        return z.object({});
      },
    });
    expect(order).toEqual(['schema', 'fetch']);
  });

  it('a loaded schema still rejects a payload of the wrong shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ url: 42 })),
    );
    await expect(
      apiRequest('/auth/google', {
        method: 'POST',
        schema: async () => z.object({ url: z.url() }).strict(),
      }),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it('server problem responses stay ApiErrors and never reach the schema parse', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ code: 'RATE_LIMITED' }, 429)),
    );
    const load = vi.fn(async () => z.object({}));
    await expect(
      apiRequest('/auth/mfa/verify', { method: 'POST', schema: load }),
    ).rejects.toMatchObject({ status: 429 });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

const options = { fields: {}, shouldUseNativeValidation: false };
const codeFallback = totpFallback;

describe('lazyResolver', () => {
  it('delegates to the loaded resolver and keeps its errors', async () => {
    const errors = { code: { type: 'pattern', message: 'x' } };
    const fallback = vi.fn(codeFallback);
    const resolver = lazyResolver<{ code: string }>(
      async () => async () => ({ values: {}, errors }),
      fallback,
    );
    const result = await resolver({ code: 'abc' }, undefined, options);
    expect(result.errors).toEqual(errors);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('a failed chunk is checked by the fallback with the same field errors, not submitted blind', async () => {
    const resolver = lazyResolver<{ code: string }>(async () => {
      throw new Error('ChunkLoadError');
    }, codeFallback);
    const bad = await resolver({ code: 'abc' }, undefined, options);
    expect(bad.values).toEqual({});
    expect(bad.errors).toEqual({
      code: { type: 'pattern', message: 'invalid' },
    });
    const good = await resolver({ code: '123456' }, undefined, options);
    expect(good).toEqual({ values: { code: '123456' }, errors: {} });
  });

  it('a later call retries the load and uses the real resolver once it arrives', async () => {
    const real = vi.fn(async () => ({ values: { code: 'ok' }, errors: {} }));
    const load = vi
      .fn<() => Promise<typeof real>>()
      .mockRejectedValueOnce(new Error('ChunkLoadError'))
      .mockResolvedValue(real);
    const resolver = lazyResolver<{ code: string }>(load, codeFallback);
    expect(
      (await resolver({ code: 'abc' }, undefined, options)).errors,
    ).not.toEqual({});
    expect(
      (await resolver({ code: 'abc' }, undefined, options)).values,
    ).toEqual({ code: 'ok' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('warm starts the load and swallows a failure', async () => {
    const load = vi.fn().mockRejectedValue(new Error('ChunkLoadError'));
    const { warm } = lazyValidation<{ code: string }>(load, codeFallback);
    expect(() => warm()).not.toThrow();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('dependency-free fallbacks match the zod schemas on the field errors', () => {
  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['no-at-sign', 'invalid'],
    ['a b@c.d', 'invalid'],
  ])('login email %j -> %s', (email, message) => {
    expect(loginFallback({ email })).toEqual({
      values: {},
      errors: { email: { type: expect.any(String), message } },
    });
  });

  it('login trims a valid email like the schema does', () => {
    expect(loginFallback({ email: '  ivan@example.com ' })).toEqual({
      values: { email: 'ivan@example.com' },
      errors: {},
    });
  });

  it.each(['', '12345', '1234567', 'abcdef', '12 456'])(
    'totp code %j is refused',
    (code) => {
      expect(totpFallback({ code }).errors).toHaveProperty('code');
    },
  );

  it('totp accepts exactly six digits', () => {
    expect(totpFallback({ code: '480215' })).toEqual({
      values: { code: '480215' },
      errors: {},
    });
  });
});
