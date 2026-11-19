import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, apiRequest } from '@/lib/api-client';

const okSchema = z.object({ ok: z.boolean() });

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const json = (body: unknown, status = 200, type = 'application/json') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': type },
  });
const problem = (body: unknown, status: number) =>
  json(body, status, 'application/problem+json');
const sent = (fetchMock: ReturnType<typeof stubFetch>) => {
  const [url, init] = fetchMock.mock.calls[0]!;
  return { url, init: init!, headers: init!.headers as Record<string, string> };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest: same-origin /api/v1 client [FND-5, T4-B03]', () => {
  it('GET sends no body, no CSRF header and no activity header by default', async () => {
    const fetchMock = stubFetch(json({ ok: true }));
    await expect(apiRequest('/me', { schema: okSchema })).resolves.toEqual({
      ok: true,
    });
    const { url, init, headers } = sent(fetchMock);
    expect(url).toBe('/api/v1/me');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBeUndefined();
    expect(headers).toEqual({ Accept: 'application/json' });
  });

  it('background refetches send X-Activity: background so they do not extend the idle timer', async () => {
    const fetchMock = stubFetch(json({ ok: true }));
    await apiRequest('/auth/sessions', { schema: okSchema, background: true });
    expect(sent(fetchMock).headers).toEqual({
      Accept: 'application/json',
      'X-Activity': 'background',
    });
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'] as const)(
    '%s sends JSON with the CSRF transport header',
    async (method) => {
      const fetchMock = stubFetch(json({ ok: true }));
      await apiRequest('/me', {
        method,
        body: { fullName: 'Марія Шевченко' },
        schema: okSchema,
      });
      const { init, headers } = sent(fetchMock);
      expect(init.method).toBe(method);
      expect(headers).toEqual({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Protection': '1',
      });
      expect(init.body).toBe(JSON.stringify({ fullName: 'Марія Шевченко' }));
    },
  );

  it('a mutation without a body sends an empty JSON object', async () => {
    const fetchMock = stubFetch(json({ ok: true }));
    await apiRequest('/auth/sessions/end-others', {
      method: 'POST',
      schema: okSchema,
    });
    expect(sent(fetchMock).init.body).toBe('{}');
  });

  it('forwards the abort signal', async () => {
    const fetchMock = stubFetch(json({ ok: true }));
    const controller = new AbortController();
    await apiRequest('/me', { schema: okSchema, signal: controller.signal });
    expect(sent(fetchMock).init.signal).toBe(controller.signal);
  });

  it('accepts a lazily imported schema', async () => {
    stubFetch(json({ ok: false }));
    await expect(
      apiRequest('/me', { schema: async () => okSchema }),
    ).resolves.toEqual({ ok: false });
  });

  it('rejects a success payload that does not match the schema', async () => {
    stubFetch(json({ ok: 'yes' }));
    await expect(
      apiRequest('/me', { schema: okSchema }),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe('apiRequest: problem+json → ApiError', () => {
  it('maps status, code and field errors', async () => {
    stubFetch(
      problem(
        {
          type: 'urn:hris:problem:validation-failed',
          status: 400,
          code: 'VALIDATION_FAILED',
          errors: [{ path: 'body.fullName', code: 'too_big' }],
        },
        400,
      ),
    );
    const error = await apiRequest('/me', {
      method: 'PATCH',
      body: { fullName: 'x'.repeat(121) },
      schema: okSchema,
    }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: 'ApiError',
      message: 'VALIDATION_FAILED',
      status: 400,
      code: 'VALIDATION_FAILED',
      fieldErrors: [{ path: 'body.fullName', code: 'too_big' }],
    });
  });

  it('defaults field errors to an empty list', async () => {
    stubFetch(problem({ status: 401, code: 'SESSION_EXPIRED' }, 401));
    await expect(apiRequest('/me', { schema: okSchema })).rejects.toMatchObject(
      {
        status: 401,
        code: 'SESSION_EXPIRED',
        fieldErrors: [],
        details: {},
      },
    );
  });

  it('passes conflict details through [D42, U3]', async () => {
    stubFetch(
      problem(
        { status: 409, code: 'USER_DEACTIVATED', details: { userId: 'u-1' } },
        409,
      ),
    );
    await expect(
      apiRequest('/invites', { method: 'POST', schema: okSchema }),
    ).rejects.toMatchObject({
      code: 'USER_DEACTIVATED',
      details: { userId: 'u-1' },
    });
  });

  it.each([
    [
      'a non-JSON body',
      new Response('<html>Bad gateway</html>', { status: 502 }),
    ],
    ['JSON without a code', json({ message: 'boom' }, 500)],
    ['a non-string code', json({ code: 42 }, 503)],
    ['an empty body', new Response(null, { status: 504 })],
  ])('falls back to INTERNAL for %s', async (_case, response) => {
    stubFetch(response);
    await expect(apiRequest('/me', { schema: okSchema })).rejects.toMatchObject(
      {
        status: response.status,
        code: 'INTERNAL',
        fieldErrors: [],
      },
    );
  });
});
