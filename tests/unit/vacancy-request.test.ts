import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { plainTextToDoc } from '@/lib/plain-text-doc';
import { richTextDocSchema } from '@/lib/schemas/rich-text';
import { requestVacancySchema } from '@/lib/schemas/vacancy-request';
import {
  VACANCY_REQUEST_COMMENT_MAX,
  VACANCY_REQUEST_COMMENT_MAX_LINES,
} from '@/lib/vacancy-limits';
import { emptyRequest } from '@/lib/vacancy-request-form';
import { parseRequest, requestFailure } from '@/lib/vacancy-request-submit';

const POSITION = '3f1e2d3c-4b5a-4968-8776-655443322110';
const values = (changes: Partial<typeof emptyRequest> = {}) => ({
  ...emptyRequest,
  positionId: POSITION,
  ...changes,
});

describe('parseRequest [STORY-VAC-03-3]', () => {
  it.each([
    [
      'defaults',
      {},
      { positionId: POSITION, headcount: 1, priority: 'NORMAL', comment: '' },
    ],
    [
      'urgent with a comment',
      { priority: 'URGENT', comment: ' Досвід\r\nFacebook Ads ' },
      { priority: 'URGENT', comment: 'Досвід\nFacebook Ads' },
    ],
    ['upper headcount', { headcount: '100' }, { headcount: 100 }],
  ] as const)('%s is accepted and normalised', (_name, changes, expected) => {
    expect(parseRequest(values(changes))).toMatchObject({
      ok: true,
      body: expected,
    });
  });

  it.each([
    ['no position', { positionId: '' }, { positionId: 'positionRequired' }],
    ['zero headcount', { headcount: '0' }, { headcount: 'headcountRange' }],
    ['over the limit', { headcount: '101' }, { headcount: 'headcountRange' }],
    ['fraction', { headcount: '1.5' }, { headcount: 'headcountRange' }],
    ['text', { headcount: 'два' }, { headcount: 'headcountRange' }],
    ['blank headcount', { headcount: '' }, { headcount: 'headcountRange' }],
    [
      'unknown urgency',
      { priority: 'ASAP' as never },
      { priority: 'priorityInvalid' },
    ],
    [
      'long comment',
      { comment: 'а'.repeat(VACANCY_REQUEST_COMMENT_MAX + 1) },
      { comment: 'commentLong' },
    ],
    [
      'control characters',
      { comment: 'a\u0000b' },
      { comment: 'commentInvalid' },
    ],
    [
      'too many lines',
      { comment: 'а\n'.repeat(VACANCY_REQUEST_COMMENT_MAX_LINES) + 'б' },
      { comment: 'commentLines' },
    ],
  ] as const)('%s is refused with its own code', (_name, changes, errors) => {
    expect(parseRequest(values(changes))).toEqual({ ok: false, errors });
  });

  it('counts the comment limit in code points after normalisation', () => {
    const emoji = '😀'.repeat(VACANCY_REQUEST_COMMENT_MAX);
    expect(parseRequest(values({ comment: emoji })).ok).toBe(true);
    expect(parseRequest(values({ comment: `${emoji}😀` })).ok).toBe(false);
  });

  it('keeps markup as text and never rejects angle brackets', () => {
    expect(parseRequest(values({ comment: '<b>x</b>' }))).toMatchObject({
      ok: true,
      body: { comment: '<b>x</b>' },
    });
  });

  it.each([
    ['verticalId', { verticalId: POSITION }],
    ['teamLeadId', { teamLeadId: POSITION }],
    ['status', { status: 'DRAFT' }],
    ['recruiterIds', { recruiterIds: [POSITION] }],
  ])('refuses the client-chosen %s as an unknown key', (_name, extra) => {
    expect(
      requestVacancySchema.safeParse({ positionId: POSITION, ...extra })
        .success,
    ).toBe(false);
  });

  it.each([
    ['headcount as text', { headcount: '2' }],
    ['zero headcount', { headcount: 0 }],
    ['headcount above the limit', { headcount: 101 }],
    ['fractional headcount', { headcount: 1.5 }],
    ['unknown priority', { priority: 'ASAP' }],
    ['a position id that is not a uuid', { positionId: 'not-a-uuid' }],
    [
      'a comment above the limit',
      { comment: 'а'.repeat(VACANCY_REQUEST_COMMENT_MAX + 1) },
    ],
    ['a bidi control in the comment', { comment: 'a‮b' }],
  ])('refuses %s', (_name, change) => {
    expect(
      requestVacancySchema.safeParse({ positionId: POSITION, ...change })
        .success,
    ).toBe(false);
  });
});

describe('requestFailure', () => {
  const fieldError = (path: string, code: string) => ({ path, code });
  it.each([
    [
      '401',
      new ApiError(401, 'UNAUTHENTICATED'),
      { kind: 'notice', notice: 'forbidden' },
    ],
    [
      '403',
      new ApiError(403, 'FORBIDDEN'),
      { kind: 'notice', notice: 'forbidden' },
    ],
    [
      '429',
      new ApiError(429, 'RATE_LIMITED'),
      { kind: 'notice', notice: 'rateLimited' },
    ],
    [
      '404',
      new ApiError(404, 'NOT_FOUND'),
      { kind: 'fields', errors: { positionId: 'positionUnavailable' } },
    ],
    [
      'inactive position',
      new ApiError(400, 'VALIDATION_FAILED', [
        fieldError('body.positionId', 'position_inactive'),
      ]),
      { kind: 'fields', errors: { positionId: 'positionUnavailable' } },
    ],
    [
      'malformed position',
      new ApiError(400, 'VALIDATION_FAILED', [
        fieldError('body.positionId', 'invalid_format'),
      ]),
      { kind: 'fields', errors: { positionId: 'positionRequired' } },
    ],
    [
      'headcount',
      new ApiError(400, 'VALIDATION_FAILED', [
        fieldError('body.headcount', 'too_big'),
      ]),
      { kind: 'fields', errors: { headcount: 'headcountRange' } },
    ],
    [
      'comment too long',
      new ApiError(400, 'VALIDATION_FAILED', [
        fieldError('body.comment', 'too_big'),
      ]),
      { kind: 'fields', errors: { comment: 'commentLong' } },
    ],
    [
      'comment characters',
      new ApiError(400, 'VALIDATION_FAILED', [
        fieldError('body.comment', 'custom'),
      ]),
      { kind: 'fields', errors: { comment: 'commentInvalid' } },
    ],
    [
      'key reuse',
      new ApiError(409, 'IDEMPOTENCY_KEY_REUSED'),
      { kind: 'keyReused' },
    ],
    [
      '5xx',
      new ApiError(500, 'INTERNAL'),
      { kind: 'notice', notice: 'failed' },
    ],
    [
      'unknown field error',
      new ApiError(400, 'VALIDATION_FAILED', [
        fieldError('body.other', 'custom'),
      ]),
      { kind: 'notice', notice: 'failed' },
    ],
    [
      'network',
      new TypeError('Failed to fetch'),
      { kind: 'notice', notice: 'network' },
    ],
  ])('%s', (_name, error, expected) => {
    expect(requestFailure(error)).toEqual(expected);
  });
});

describe('plainTextToDoc', () => {
  it.each([
    [
      'one line',
      'Досвід',
      [{ type: 'paragraph', content: [{ type: 'text', text: 'Досвід' }] }],
    ],
    [
      'lines stay separate paragraphs',
      'а\nб',
      [
        { type: 'paragraph', content: [{ type: 'text', text: 'а' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'б' }] },
      ],
    ],
    [
      'an empty line stays an empty paragraph',
      'а\n\nб',
      [
        { type: 'paragraph', content: [{ type: 'text', text: 'а' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'б' }] },
      ],
    ],
    [
      'markup is plain text',
      '<script>x</script>',
      [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '<script>x</script>' }],
        },
      ],
    ],
  ])('%s', (_name, text, content) => {
    expect(plainTextToDoc(text)).toEqual({ type: 'doc', content });
  });

  it('a single line of 5000 astral characters splits into valid text nodes and still passes the stored-doc schema', () => {
    const doc = plainTextToDoc('😀'.repeat(VACANCY_REQUEST_COMMENT_MAX));
    expect(richTextDocSchema.safeParse(doc).success).toBe(true);
  });

  it('the longest accepted comment is a valid stored doc', () => {
    const lines = Array.from(
      { length: VACANCY_REQUEST_COMMENT_MAX_LINES },
      () => 'я'.repeat(49),
    );
    expect(
      richTextDocSchema.safeParse(plainTextToDoc(lines.join('\n'))).success,
    ).toBe(true);
  });
});
