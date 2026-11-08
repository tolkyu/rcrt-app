import { describe, expect, it } from 'vitest';
import {
  hasVacancyFilters,
  isVacancyCursor,
  parseVacancyPageFilters,
  parseVacancyPageState,
  vacancyApiFilters,
  vacancyPageSearch,
  vacancyPageUrlSearch,
  withVacancyFilters,
  withVacancyPage,
  withVacancySelection,
} from '@/lib/vacancy-filters';
import { vacancyListQuerySchema } from '@/lib/schemas/vacancy';

const VERTICAL = '11111111-1111-4111-8111-111111111111';
const VACANCY = '22222222-2222-4222-8222-222222222222';
const parse = (query: string) =>
  parseVacancyPageState(new URLSearchParams(query));

describe('isVacancyCursor [STORY-VAC-04-1]', () => {
  it.each(['1', '42', '9223372036854775807'])('accepts %s', (value) =>
    expect(isVacancyCursor(value)).toBe(true),
  );
  it.each(['0', '-1', '01', '1.5', 'abc', '9223372036854775808', ''])(
    'rejects %j',
    (value) => expect(isVacancyCursor(value)).toBe(false),
  );
});

describe('parseVacancyPageFilters drops malformed URL values instead of failing the page', () => {
  it('keeps valid filters and defaults the page size', () => {
    expect(
      parseVacancyPageFilters(
        new URLSearchParams(
          `q=%20Медіабаєр%20&vertical=${VERTICAL.toUpperCase()}&status=OPEN&priority=URGENT`,
        ),
      ),
    ).toEqual({
      q: 'Медіабаєр',
      vertical: VERTICAL,
      status: 'OPEN',
      priority: 'URGENT',
      limit: 25,
    });
  });

  it.each([
    ['too short search', 'q=a'],
    ['two-character search', 'q=%D0%BC%D0%B5'],
    ['two-character search after trimming', 'q=%20ab%20'],
    ['unknown status', 'status=ARCHIVED'],
    ['not a UUID', 'vertical=gambling'],
    ['unknown priority', 'priority=HIGH'],
    ['bad cursor', 'cursor=abc'],
    ['direction without cursor', 'direction=newer'],
    ['repeated parameter', 'status=OPEN&status=DRAFT'],
    ['unsupported page size', 'limit=1000'],
    ['NUL in the search', 'q=ab%00cd'],
  ])('%s', (_name, query) => {
    expect(parseVacancyPageFilters(new URLSearchParams(query))).toEqual({
      limit: 25,
    });
  });

  it('keeps the cursor direction only with a valid cursor and accepts a supported page size', () => {
    expect(
      parseVacancyPageFilters(
        new URLSearchParams('cursor=7&direction=newer&limit=50'),
      ),
    ).toEqual({ cursor: '7', direction: 'newer', limit: 50 });
  });

  it.each(['abc', 'v-1', ' V-12 ', 'абв'])(
    'keeps a search of at least three characters after trimming: %j [Q-162]',
    (q) => {
      expect(parseVacancyPageFilters(new URLSearchParams({ q }))).toEqual({
        q: q.trim(),
        limit: 25,
      });
    },
  );

  it('reads plain search-parameter objects as the RSC page receives them', () => {
    expect(
      parseVacancyPageFilters({ q: 'V-0001', status: ['OPEN', 'DRAFT'] }),
    ).toEqual({ q: 'V-0001', limit: 25 });
  });
});

describe('API filters and page URL stay in sync', () => {
  it('omits the default page size and a direction without cursor', () => {
    expect(
      vacancyPageSearch({ q: 'абв', status: 'OPEN', limit: 25 }).toString(),
    ).toBe('q=%D0%B0%D0%B1%D0%B2&status=OPEN');
    expect(
      vacancyPageSearch({
        cursor: '5',
        direction: 'older',
        limit: 50,
      }).toString(),
    ).toBe('cursor=5&direction=older&limit=50');
  });

  it('normalizes API filters through the same parser as the page', () => {
    expect(vacancyApiFilters({ q: ' x ', status: 'OPEN' })).toEqual({
      status: 'OPEN',
      limit: 25,
    });
  });
});

describe('parseVacancyPageState [VAC-04, UI-09]', () => {
  it('ignores the priority filter, which the page has no control for', () => {
    expect(parse('priority=URGENT&status=OPEN').filters).toEqual({
      status: 'OPEN',
      limit: 25,
    });
  });

  it('accepts only a UUID as the selected preview row and lower-cases it', () => {
    expect(parse(`vacancy=${VACANCY.toUpperCase()}`).selected).toBe(VACANCY);
    expect(parse('vacancy=1').selected).toBeUndefined();
    expect(
      parse(`vacancy=${VACANCY}&vacancy=${VACANCY}`).selected,
    ).toBeUndefined();
  });

  it('round-trips through the URL', () => {
    const state = parse(
      `q=Face&vertical=${VERTICAL}&status=ON_HOLD&vacancy=${VACANCY}`,
    );
    expect(parse(vacancyPageUrlSearch(state))).toEqual(state);
  });
});

describe('URL transitions', () => {
  const base = parse(
    `q=Face&status=OPEN&cursor=9&direction=older&vacancy=${VACANCY}`,
  );

  it('a changed filter resets the cursor and the selection', () => {
    const next = withVacancyFilters(base, { status: 'DRAFT' });
    expect(next).toEqual({
      filters: { q: 'Face', status: 'DRAFT', limit: 25 },
    });
    expect(vacancyPageUrlSearch(next)).toBe('q=Face&status=DRAFT');
  });

  it('clears one filter with undefined and all of them with an empty patch of undefineds', () => {
    expect(
      withVacancyFilters(base, { q: undefined }).filters.q,
    ).toBeUndefined();
    const cleared = withVacancyFilters(base, {
      q: undefined,
      vertical: undefined,
      status: undefined,
    });
    expect(hasVacancyFilters(cleared)).toBe(false);
    expect(vacancyPageUrlSearch(cleared)).toBe('');
  });

  it('an empty patch only drops the cursor and selection (stale cursor recovery)', () => {
    expect(vacancyPageUrlSearch(withVacancyFilters(base, {}))).toBe(
      'q=Face&status=OPEN',
    );
  });

  it('paging keeps filters, sets the cursor with its direction and drops the selection', () => {
    const next = withVacancyPage(parse('status=OPEN'), '12', 'newer');
    expect(vacancyPageUrlSearch(next)).toBe(
      'status=OPEN&cursor=12&direction=newer',
    );
    expect(withVacancyPage(base, '3', 'older').selected).toBeUndefined();
  });

  it('selecting a row keeps filters and cursor', () => {
    const next = withVacancySelection(parse('status=OPEN&cursor=9'), VACANCY);
    expect(vacancyPageUrlSearch(next)).toBe(
      `status=OPEN&cursor=9&vacancy=${VACANCY}`,
    );
    expect(withVacancySelection(next, undefined).selected).toBeUndefined();
  });

  it('keeps a non-default page size across filter changes', () => {
    expect(
      vacancyPageUrlSearch(
        withVacancyFilters(parse('limit=50'), { status: 'OPEN' }),
      ),
    ).toBe('status=OPEN&limit=50');
  });
});

describe('search minimum is three characters [Q-162]', () => {
  it.each(['a', 'аб', ' ab ', '  '])(
    'the API schema rejects %j with a too_small issue on q',
    (q) => {
      const result = vacancyListQuerySchema.safeParse({ q });
      expect(result.success).toBe(false);
      expect(
        !result.success &&
          result.error.issues.map((issue) => [issue.path, issue.code]),
      ).toEqual([[['q'], 'too_small']]);
    },
  );

  it.each(['abc', 'V-1', 'v-0001', ' абв '])(
    'the API schema accepts %j, including a short vacancy number',
    (q) => {
      expect(vacancyListQuerySchema.parse({ q }).q).toBe(q.trim());
    },
  );
});

describe('search text with a NUL character [SEC-VAC-02]', () => {
  it('is rejected by the API schema as a validation error, not left to fail in PostgreSQL', () => {
    const result = vacancyListQuerySchema.safeParse({ q: 'ab\u0000cd' });
    expect(result.success).toBe(false);
    expect(
      !result.success && result.error.issues.map((issue) => issue.path),
    ).toEqual([['q']]);
  });

  it('still accepts ordinary text, including SQL pattern characters', () => {
    expect(vacancyListQuerySchema.parse({ q: '100%_\\' }).q).toBe('100%_\\');
  });
});
