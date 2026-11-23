import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import {
  contentFailure,
  submitVacancyContent,
} from '@/lib/vacancy-content-submit';

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
afterEach(() => vi.unstubAllGlobals());
describe('content request boundary [ADR-020]', () => {
  it('validates before fetch and sends exactly the dirty fields plus expectedVersion', async () => {
    const reply = {
      id: ID,
      version: 2,
      updatedAt: '2026-11-19T08:00:00Z',
      descriptionDoc: null,
      requirementsDoc: null,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(reply));
    vi.stubGlobal('fetch', fetcher);
    expect(
      await submitVacancyContent(ID, {
        expectedVersion: 1,
        descriptionDoc: null,
      }),
    ).toEqual(reply);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/vacancies/${ID}/content`,
      expect.objectContaining({
        method: 'PATCH',
        body: '{"expectedVersion":1,"descriptionDoc":null}',
        credentials: 'same-origin',
        headers: expect.objectContaining({ 'X-CSRF-Protection': '1' }),
      }),
    );
  });
  it('overposting or an empty patch rejects before any network operation', async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);
    const overposted = {
      expectedVersion: 1,
      descriptionDoc: null,
      status: 'CANCELLED',
    };
    await expect(submitVacancyContent(ID, overposted)).rejects.toMatchObject({
      name: 'ZodError',
    });
    await expect(
      submitVacancyContent(ID, { expectedVersion: 1 }),
    ).rejects.toMatchObject({ name: 'ZodError' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [409, 'STALE_STATE', 'stale'],
    [409, 'VACANCY_CONTENT_LOCKED', 'closed'],
    [403, 'FORBIDDEN', 'forbidden'],
    [429, 'RATE_LIMITED', 'rateLimited'],
    [500, 'INTERNAL', 'server'],
  ])('classifies %s %s without raw content', (status, code, kind) =>
    expect(contentFailure(new ApiError(Number(status), String(code)))).toEqual({
      kind,
    }),
  );
  it('keeps field codes and an inherited payload limit without exposing an input value', () => {
    expect(
      contentFailure(
        new ApiError(400, 'VALIDATION', [
          { path: 'body.descriptionDoc', code: 'too_large' },
        ]),
      ),
    ).toEqual({
      kind: 'fields',
      errors: [{ path: 'body.descriptionDoc', code: 'too_large' }],
    });
    expect(contentFailure(new ApiError(413, 'BODY_TOO_LARGE'))).toEqual({
      kind: 'fields',
      errors: [{ path: 'body', code: 'too_large' }],
    });
    expect(contentFailure(new TypeError('offline'))).toEqual({
      kind: 'network',
    });
  });
  it('rejects a GET-shaped success rather than treating it as the shorter PATCH DTO', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          id: ID,
          version: 2,
          updatedAt: '2026-11-19T08:00:00Z',
          descriptionDoc: null,
          requirementsDoc: null,
          status: 'OPEN',
          canEditContent: true,
        }),
      ),
    );
    await expect(
      submitVacancyContent(ID, { expectedVersion: 1, descriptionDoc: null }),
    ).rejects.toMatchObject({ name: 'ZodError' });
  });
});
