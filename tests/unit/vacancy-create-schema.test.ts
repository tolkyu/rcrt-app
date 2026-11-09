import { describe, expect, it } from 'vitest';
import { IDEMPOTENCY_TTL_MS, idempotencyKeySchema } from '@/lib/idempotency';
import { richTextDocSchema } from '@/lib/schemas/rich-text';
import {
  createVacancySchema,
  VACANCY_HEADCOUNT_MAX,
  VACANCY_TITLE_MAX,
} from '@/lib/schemas/vacancy';
import { requestHash } from '@/server/security/idempotency';

const vertical = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const position = '3f1e2d3c-4b5a-4968-8776-655443322110';
const publish = {
  mode: 'PUBLISH',
  verticalId: vertical,
  positionId: position,
  title: 'Медіабаєр — Facebook',
} as const;
const draft = {
  mode: 'DRAFT',
  verticalId: vertical,
  title: 'Чернетка',
} as const;
const issues = (input: unknown) => {
  const result = createVacancySchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((i) => `${i.path.join('.')}:${i.code}`);
};
const valid = (input: unknown) => createVacancySchema.safeParse(input).success;

describe('create vacancy contract [VAC-01, D89]', () => {
  it('accepts a minimal OPEN vacancy and normalises the title', () => {
    const parsed = createVacancySchema.parse({
      ...publish,
      title: '  Медіабаєр    Facebook ',
    });
    expect(parsed.title).toBe('Медіабаєр Facebook');
    expect(parsed.verticalId).toBe(vertical);
  });

  it('needs only vertical and title for a draft, and no opening date field exists', () => {
    expect(valid(draft)).toBe(true);
    expect(issues({ ...draft, openedAt: '2026-11-10T08:00:00Z' })).toContain(
      ':unrecognized_keys',
    );
  });

  it('requires the position for OPEN only', () => {
    expect(issues({ ...publish, positionId: undefined })).toContain(
      'positionId:invalid_type',
    );
    expect(valid({ ...draft, positionId: null })).toBe(true);
  });

  it.each([
    ['unknown mode', { ...publish, mode: 'APPROVE' }],
    ['no mode', { verticalId: vertical, title: 'Назва' }],
    ['status smuggled in', { ...publish, status: 'FILLED' }],
    ['source smuggled in', { ...publish, source: 'TELEGRAM_BOT' }],
    ['bonus field', { ...publish, bonusAmountMinor: '100' }],
    ['recruiter-initiated flag', { ...publish, recruiterInitiated: false }],
  ])('refuses %s', (_name, input) => {
    expect(valid(input)).toBe(false);
  });

  it.each([
    ['one character', 'Я'],
    ['blank', '   '],
    ['NUL', 'Назва\u0000'],
    ['zero-width space', 'Мед​іабаєр'],
    ['bidi override', '‮Назва'],
    ['too long', 'Я'.repeat(VACANCY_TITLE_MAX + 1)],
  ])('refuses a title with %s', (_name, title) => {
    expect(valid({ ...publish, title })).toBe(false);
  });

  it.each([
    [29, false],
    [30, true],
    [90, true],
    [91, false],
    [60.5, false],
  ])('probation %s days is valid: %s', (probationDays, expected) => {
    expect(valid({ ...publish, probationDays })).toBe(expected);
  });

  it.each([
    [0, false],
    [1, true],
    [VACANCY_HEADCOUNT_MAX, true],
    [VACANCY_HEADCOUNT_MAX + 1, false],
    [1.5, false],
  ])('headcount %s is valid: %s', (headcount, expected) => {
    expect(valid({ ...publish, headcount })).toBe(expected);
  });

  describe('salary range', () => {
    const salary = (extra: Record<string, unknown>) => ({
      ...publish,
      ...extra,
    });

    it('needs a currency whenever a bound is set, and only then', () => {
      expect(issues(salary({ salaryMinMinor: '100' }))).toEqual([
        'salaryCurrency:custom',
      ]);
      expect(issues(salary({ salaryCurrency: 'USD' }))).toEqual([
        'salaryCurrency:custom',
      ]);
      expect(
        valid(salary({ salaryMinMinor: '100', salaryCurrency: 'USD' })),
      ).toBe(true);
    });

    it('keeps minimum at or below maximum, compared as integers', () => {
      expect(
        issues(
          salary({
            salaryMinMinor: '900000000000000',
            salaryMaxMinor: '90000000000000',
            salaryCurrency: 'UAH',
          }),
        ),
      ).toEqual(['salaryMaxMinor:custom']);
      expect(
        valid(
          salary({
            salaryMinMinor: '100',
            salaryMaxMinor: '100',
            salaryCurrency: 'UAH',
          }),
        ),
      ).toBe(true);
    });

    it.each(['-1', '01', '1.5', '1e3', '', '1000000000000000', 'abc'])(
      'refuses the amount %j',
      (amount) => {
        expect(
          valid(salary({ salaryMinMinor: amount, salaryCurrency: 'USD' })),
        ).toBe(false);
      },
    );

    it.each(['usd', 'US', 'USDT', '123'])(
      'refuses the currency %j',
      (currency) => {
        expect(
          valid(salary({ salaryMinMinor: '1', salaryCurrency: currency })),
        ).toBe(false);
      },
    );
  });

  it('accepts null for optional fields so a form can clear them', () => {
    expect(
      valid({
        ...publish,
        teamLeadId: null,
        seniority: null,
        workFormat: null,
        employmentType: null,
        location: null,
        salaryMinMinor: null,
        salaryMaxMinor: null,
        salaryCurrency: null,
        descriptionDoc: null,
        requirementsDoc: null,
      }),
    ).toBe(true);
  });
});

describe('rich text documents [DG-13]', () => {
  const doc = (content: unknown[]) => ({ type: 'doc', content });
  const paragraph = (text: unknown, marks?: unknown[]) => ({
    type: 'paragraph',
    content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
  });
  const link = (href: string) => ({ type: 'link', attrs: { href } });

  it('accepts the supported nodes and marks', () => {
    expect(
      richTextDocSchema.safeParse(
        doc([
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Вимоги' }],
          },
          paragraph('Досвід', [
            { type: 'bold' },
            link('https://example.com/a?b=1'),
          ]),
          {
            type: 'bulletList',
            content: [
              { type: 'listItem', content: [paragraph('Facebook Ads')] },
            ],
          },
        ]),
      ).success,
    ).toBe(true);
  });

  it.each([
    ['javascript link', paragraph('x', [link('javascript:alert(1)')])],
    ['data link', paragraph('x', [link('data:text/html,<b>')])],
    ['http link', paragraph('x', [link('http://example.com')])],
    [
      'unknown node',
      { type: 'image', attrs: { src: 'https://example.com/a.png' } },
    ],
    ['unknown mark', paragraph('x', [{ type: 'highlight' }])],
    ['raw html node', { type: 'html', text: '<script>' }],
    ['heading level 6', { type: 'heading', attrs: { level: 6 }, content: [] }],
    ['control character', paragraph('a\u0000b')],
    ['empty text node', paragraph('')],
    ['unknown key on a node', { type: 'paragraph', style: 'x' }],
  ])('refuses %s', (_name, node) => {
    expect(richTextDocSchema.safeParse(doc([node])).success).toBe(false);
  });

  it('caps the stored size', () => {
    const big = Array.from({ length: 12 }, () => paragraph('я'.repeat(5000)));
    expect(richTextDocSchema.safeParse(doc(big)).success).toBe(false);
  });

  it('refuses an empty document and a wrong root', () => {
    expect(richTextDocSchema.safeParse(doc([])).success).toBe(false);
    expect(richTextDocSchema.safeParse({ type: 'paragraph' }).success).toBe(
      false,
    );
  });
});

describe('idempotency [VAC-01-1 AC6]', () => {
  it.each([
    'a'.repeat(16),
    '6f0c9e0a-9d0c-4c11-8f6c-2b4f0d2f1a11',
    'A_b-c'.repeat(12),
  ])('accepts the key %s', (key) => {
    expect(idempotencyKeySchema.safeParse(key).success).toBe(true);
  });

  it.each([
    '',
    'short',
    'a'.repeat(65),
    'has space 1234567890',
    'ключ-1234567890123',
    'a;b'.repeat(8),
  ])('refuses the key %j', (key) => {
    expect(idempotencyKeySchema.safeParse(key).success).toBe(false);
  });

  it('keeps replays for a day', () => {
    expect(IDEMPOTENCY_TTL_MS).toBe(86_400_000);
  });

  it('hashes the validated body independently of key order and omitted optionals', () => {
    const a = createVacancySchema.parse({ ...publish, headcount: 2 });
    const b = createVacancySchema.parse({
      headcount: 2,
      title: publish.title,
      positionId: position,
      verticalId: vertical,
      mode: 'PUBLISH',
    });
    expect(requestHash(a)).toBe(requestHash(b));
    expect(requestHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('tells different bodies apart', () => {
    const base = createVacancySchema.parse(publish);
    expect(requestHash(base)).not.toBe(
      requestHash(createVacancySchema.parse({ ...publish, headcount: 2 })),
    );
    expect(requestHash(base)).not.toBe(
      requestHash(
        createVacancySchema.parse({ ...publish, title: 'Інша назва' }),
      ),
    );
  });
});

describe('rich text links are parsed, not pattern-matched [SEC-VC-02, DG-13]', () => {
  const docWith = (href: string) => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'x',
            marks: [{ type: 'link', attrs: { href } }],
          },
        ],
      },
    ],
  });
  const hrefOf = (href: string) => {
    const parsed = richTextDocSchema.safeParse(docWith(href));
    return parsed.success
      ? (
          parsed.data.content[0] as {
            content: { marks: { attrs: { href: string } }[] }[];
          }
        ).content[0]!.marks[0]!.attrs.href
      : null;
  };

  it.each([
    ['NUL', 'https://example.com/a\u0000b'],
    ['a lone surrogate', 'https://example.com/\ud800'],
    ['a right-to-left override', 'https://example.com/‮evil'],
    ['javascript:', 'javascript:alert(1)'],
    ['JaVaScRiPt: with a tab', 'java\tscript:alert(1)'],
    ['credentials', 'https://user:pass@example.com/'],
    ['a user name only', 'https://admin@example.com/'],
    ['http', 'http://example.com'],
    ['data:', 'data:text/html,<b>'],
    ['no host', 'https://'],
    ['a space', 'https://example.com/a b'],
    ['an empty mailto', 'mailto:'],
    ['a relative path', '/internal'],
  ])('refuses %s', (_name, href) => {
    expect(hrefOf(href)).toBeNull();
  });

  it('stores the normalised href of an accepted link', () => {
    expect(hrefOf('HTTPS://Example.COM:443/Path?q=1')).toBe(
      'https://example.com/Path?q=1',
    );
    expect(hrefOf('mailto:hr@example.com')).toBe('mailto:hr@example.com');
  });
});
