import { describe, expect, it } from 'vitest';
import { requestMeta } from '@/server/context/request-context';
import {
  ConflictError,
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from '@/server/http/errors';
import { mapError } from '@/server/http/map-error';
import { PROBLEM_CONTENT_TYPE } from '@/server/http/problem';

const requestId = '00000000-0000-4000-8000-000000000001';
const postgresError = (code: string, message: string) =>
  Object.assign(new Error(message), { name: 'PostgresError', code });

describe('Domain errors → RFC 9457 problem+json [API, ADR-006]', () => {
  it.each([
    [
      new ValidationError([{ path: 'body.name', code: 'too_small' }]),
      400,
      'VALIDATION_FAILED',
    ],
    [new UnauthenticatedError('SESSION_EXPIRED'), 401, 'SESSION_EXPIRED'],
    [new UnauthenticatedError('MFA_REQUIRED'), 401, 'MFA_REQUIRED'],
    [new ForbiddenError('CSRF_FORBIDDEN'), 403, 'CSRF_FORBIDDEN'],
    [
      new ForbiddenError('SELF_BENEFIT_FORBIDDEN'),
      403,
      'SELF_BENEFIT_FORBIDDEN',
    ],
    [new NotFoundError(), 404, 'NOT_FOUND'],
    [new ConflictError('STALE_STATE'), 409, 'STALE_STATE'],
    [new InvalidTransitionError('TL_NOT_ACCEPTED'), 409, 'TL_NOT_ACCEPTED'],
    [new RateLimitedError(30), 429, 'RATE_LIMITED'],
  ])('%s → %i %s', async (error, status, code) => {
    const response = mapError(error, requestId)!;
    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toBe(PROBLEM_CONTENT_TYPE);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      status,
      code,
      requestId,
      type: expect.stringMatching(/^urn:hris:problem:/),
    });
  });

  it('includes field paths for validation errors and Retry-After for rate limits', async () => {
    const validation = mapError(
      new ValidationError([{ path: 'query.limit', code: 'too_big' }]),
      requestId,
    )!;
    expect((await validation.json()).errors).toEqual([
      { path: 'query.limit', code: 'too_big' },
    ]);
    expect(
      mapError(new RateLimitedError(42), requestId)!.headers.get('retry-after'),
    ).toBe('42');
  });

  it('maps database invariants by SQLSTATE without echoing driver messages', async () => {
    const trigger = mapError(
      postgresError('P0001', 'PROBATION_EXTENSION_FORBIDDEN'),
      requestId,
    )!;
    expect(trigger.status).toBe(409);
    expect((await trigger.json()).code).toBe('PROBATION_EXTENSION_FORBIDDEN');
    const wrapped = Object.assign(
      new Error('Failed query: insert … params: secret@example.com'),
      {
        cause: postgresError(
          '23505',
          'duplicate key value violates unique constraint',
        ),
      },
    );
    const duplicate = mapError(wrapped, requestId)!;
    const text = await duplicate.text();
    expect(duplicate.status).toBe(409);
    expect(text).toContain('ALREADY_EXISTS');
    expect(text).not.toContain('secret@example.com');
  });

  it('leaves unexpected errors to the 500 path', () => {
    expect(mapError(new Error('boom'), requestId)).toBeNull();
    expect(
      mapError(postgresError('P0001', 'free text from a trigger'), requestId),
    ).toBeNull();
  });
});

describe('Request metadata', () => {
  it('keeps only well-formed IP, user agent and mutation id', () => {
    const meta = requestMeta(
      new Headers({
        'x-forwarded-for': '203.0.113.7, 10.0.0.1',
        'user-agent': 'Mozilla/5.0',
        'x-mutation-id': '6f1c2d34-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
      }),
    );
    expect(meta).toMatchObject({
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
      mutationId: '6f1c2d34-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    });
    expect(meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      requestMeta(
        new Headers({ 'x-forwarded-for': 'not-an-ip', 'x-mutation-id': 'x' }),
      ),
    ).toMatchObject({
      ip: null,
      mutationId: null,
      userAgent: null,
    });
  });
});
