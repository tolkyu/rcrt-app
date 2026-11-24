import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadVacancyContent } from '@/app/(app)/vacancies/_lib/vacancy-content';
import { ApiError } from '@/lib/api-client';
import { vacancyContentQuery } from '@/lib/queries/vacancy-content';
import { vacancyContentReadSchema } from '@/lib/schemas/vacancy-content';
import { ForbiddenError, NotFoundError } from '@/server/http/errors';
import { getVacancyContent } from '@/server/services/vacancy-content';
import { requireSession } from '@/app/(app)/_lib/session';

const cacheState = vi.hoisted(() => ({ clear: () => {} }));
vi.mock('@/app/(app)/_lib/session', () => ({
  requireSession: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/server/services/vacancy-content', () => ({
  getVacancyContent: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  cache: <R>(read: (id: string) => R) => {
    const seen = new Map<string, R>();
    cacheState.clear = () => seen.clear();
    return (id: string) => {
      const old = seen.get(id);
      if (old !== undefined) return old;
      const next = read(id);
      seen.set(id, next);
      return next;
    };
  },
}));
const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const content = vacancyContentReadSchema.parse({
  id: ID,
  version: 3,
  updatedAt: '2026-11-19T08:00:00Z',
  descriptionDoc: null,
  requirementsDoc: { type: 'doc', content: [{ type: 'paragraph' }] },
  status: 'OPEN',
  canEditContent: false,
});
beforeEach(() => {
  vi.clearAllMocks();
  cacheState.clear();
  vi.mocked(getVacancyContent).mockResolvedValue(content);
});
afterEach(() => vi.unstubAllGlobals());

describe('document query options [ADR-019]', () => {
  it('uses a canonical content key, fresh reads, immediate garbage collection and no placeholders', () => {
    const options = vacancyContentQuery(ID.toUpperCase());
    expect(options).toMatchObject({
      queryKey: ['vacancy', ID, 'content'],
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    });
    expect(options).not.toHaveProperty('placeholderData');
    expect(options).not.toHaveProperty('initialData');
  });
  it('validates the read DTO and carries background same-origin credentials and AbortSignal', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(content));
    vi.stubGlobal('fetch', fetcher);
    const client = new QueryClient();
    try {
      expect(
        await client.fetchQuery(vacancyContentQuery(ID.toUpperCase())),
      ).toEqual(content);
      expect(fetcher).toHaveBeenCalledWith(
        `/api/v1/vacancies/${ID}/content`,
        expect.objectContaining({
          method: 'GET',
          credentials: 'same-origin',
          signal: expect.any(AbortSignal),
          headers: { Accept: 'application/json', 'X-Activity': 'background' },
        }),
      );
    } finally {
      client.clear();
    }
  });
  it('rejects a PATCH-shaped response rather than fabricating status/eligibility', async () => {
    const patchResponse = {
      id: content.id,
      version: content.version,
      updatedAt: content.updatedAt,
      descriptionDoc: content.descriptionDoc,
      requirementsDoc: content.requirementsDoc,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(patchResponse)),
    );
    const client = new QueryClient();
    try {
      await expect(
        client.fetchQuery({ ...vacancyContentQuery(ID), retry: false }),
      ).rejects.toMatchObject({ name: 'ZodError' });
    } finally {
      client.clear();
    }
  });
  it.each([403, 404, 429])('does not retry HTTP %s', (status) => {
    const retry = vacancyContentQuery(ID).retry;
    if (typeof retry !== 'function') throw new Error('Expected retry policy');
    expect(retry(0, new ApiError(status, 'DENIED'))).toBe(false);
  });
  it('retries a session 401 once and never MFA_REQUIRED', () => {
    const retry = vacancyContentQuery(ID).retry;
    if (typeof retry !== 'function') throw new Error('Expected retry policy');
    const lost = new ApiError(401, 'SESSION_EXPIRED');
    expect(retry(0, lost)).toBe(true);
    expect(retry(1, lost)).toBe(false);
    expect(retry(0, new ApiError(401, 'MFA_REQUIRED'))).toBe(false);
  });
  it('bounds retryable server/network failures', () => {
    const retry = vacancyContentQuery(ID).retry;
    if (typeof retry !== 'function') throw new Error('Expected retry policy');
    expect(retry(0, new ApiError(500, 'INTERNAL'))).toBe(true);
    expect(retry(1, new TypeError('offline'))).toBe(true);
    expect(retry(2, new ApiError(500, 'INTERNAL'))).toBe(false);
  });
});

describe('request-scoped content loader [ADR-019]', () => {
  it('shares one authorized read across canonical id variants', async () => {
    const results = await Promise.all([
      loadVacancyContent(ID.toUpperCase()),
      loadVacancyContent(ID),
    ]);
    expect(results).toEqual([content, content]);
    expect(requireSession).toHaveBeenCalledOnce();
    expect(getVacancyContent).toHaveBeenCalledExactlyOnceWith({}, ID);
  });
  it('maps only NotFound to null', async () => {
    vi.mocked(getVacancyContent).mockRejectedValueOnce(new NotFoundError());
    expect(await loadVacancyContent(ID)).toBeNull();
    const denied = new ForbiddenError();
    vi.mocked(getVacancyContent).mockRejectedValueOnce(denied);
    await expect(loadVacancyContent('another-id')).rejects.toBe(denied);
  });
  it('does not turn session failures into an absent vacancy', async () => {
    const denied = new ApiError(401, 'SESSION_EXPIRED');
    vi.mocked(requireSession).mockRejectedValueOnce(denied);
    await expect(loadVacancyContent(ID)).rejects.toBe(denied);
    expect(getVacancyContent).not.toHaveBeenCalled();
  });
});
