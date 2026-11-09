import { describe, expect, it } from 'vitest';
import {
  hasVacancyFilters,
  isVacancyCursor,
  parseVacancyPageFilters,
  parseVacancyPageState,
  vacancyApiFilters,
  vacancyPageSearch,
  vacancyPageUrlSearch,
  vacancyPresetSearch,
  vacancyVerticalPreset,
  withVacancyFilters,
  withVacancyPage,
  withVacancySelection,
} from '@/lib/vacancy-filters';
import { vacancyListQuerySchema } from '@/lib/schemas/vacancy';

const VERTICAL = '11111111-1111-4111-8111-111111111111';
const VACANCY = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const VERTICALS = [
  { id: VERTICAL, name: 'Гемблінг' },
  { id: OTHER, name: 'Крипто' },
];
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

describe('explicit «Усі» (vertical=all) [D83]', () => {
  it('parses vertical=all as an explicit choice that is not a vertical filter', () => {
    const state = parse('vertical=all&status=OPEN');
    expect(state.allVerticals).toBe(true);
    expect(state.filters).toEqual({ status: 'OPEN', limit: 25 });
    expect(hasVacancyFilters(state)).toBe(true);
    expect(hasVacancyFilters(parse('vertical=all'))).toBe(false);
    expect(parse('').allVerticals).toBeUndefined();
    expect(parse(`vertical=${VERTICAL}`).allVerticals).toBeUndefined();
  });

  it('round-trips through the URL and survives paging, selection and other filter changes', () => {
    const state = parse('vertical=all');
    expect(vacancyPageUrlSearch(state)).toBe('vertical=all');
    expect(vacancyPageUrlSearch(withVacancyFilters(state, { q: 'Face' }))).toBe(
      'q=Face&vertical=all',
    );
    expect(vacancyPageUrlSearch(withVacancyFilters(state, {}))).toBe(
      'vertical=all',
    );
    expect(vacancyPageUrlSearch(withVacancyPage(state, '7', 'older'))).toBe(
      'cursor=7&direction=older&vertical=all',
    );
    expect(
      vacancyPageUrlSearch(withVacancySelection(state, VACANCY)),
    ).toContain('vertical=all');
  });

  it('choosing a vertical replaces all, and choosing all replaces a vertical', () => {
    expect(
      vacancyPageUrlSearch(
        withVacancyFilters(parse('vertical=all&cursor=4'), {
          vertical: VERTICAL,
        }),
      ),
    ).toBe(`vertical=${VERTICAL}`);
    expect(
      vacancyPageUrlSearch(
        withVacancyFilters(parse(`vertical=${VERTICAL}&status=OPEN`), {
          vertical: 'all',
        }),
      ),
    ).toBe('status=OPEN&vertical=all');
  });

  it.each([
    ['a malformed vertical', 'vertical=garbage'],
    ['an empty vertical', 'vertical='],
    ['a repeated vertical', `vertical=${VERTICAL}&vertical=${OTHER}`],
  ])(
    '%s counts as explicit «Усі» and keeps vertical=all in follow-up URLs',
    (_name, query) => {
      const state = parse(query);
      expect(state.allVerticals).toBe(true);
      expect(state.filters.vertical).toBeUndefined();
      expect(
        vacancyPageUrlSearch(withVacancySelection(state, VACANCY)),
      ).toContain('vertical=all');
      expect(
        vacancyPageUrlSearch(withVacancyPage(state, '5', 'older')),
      ).toContain('vertical=all');
      expect(
        vacancyPageUrlSearch(withVacancyFilters(state, { status: 'OPEN' })),
      ).toContain('vertical=all');
    },
  );

  it('clearing to undefined leaves a bare URL', () => {
    expect(
      vacancyPageUrlSearch(
        withVacancyFilters(parse('vertical=all'), { vertical: undefined }),
      ),
    ).toBe('');
  });
});

describe('header vertical preset for «Вакансії» [D83]', () => {
  const preset = (query: string, stored: string | undefined) =>
    vacancyVerticalPreset(new URLSearchParams(query), stored, VERTICALS);

  it('applies the stored vertical only when the URL has no vertical parameter', () => {
    expect(preset('', OTHER)).toBe(OTHER);
    expect(preset('status=OPEN&q=Face', OTHER)).toBe(OTHER);
  });

  it.each([
    ['an explicit vertical', `vertical=${VERTICAL}`],
    ['an explicit «all»', 'vertical=all'],
    ['a malformed vertical', 'vertical=gambling'],
    ['an empty vertical', 'vertical='],
    ['a repeated vertical', `vertical=${VERTICAL}&vertical=${OTHER}`],
  ])('never overrides %s', (_name, query) => {
    expect(preset(query, OTHER)).toBeUndefined();
  });

  it.each([
    ['no cookie', undefined],
    ['an empty cookie', ''],
    ['the «all» cookie', 'all'],
    ['a vertical outside my scope', '44444444-4444-4444-8444-444444444444'],
    ['garbage', 'x;y'],
  ])('ignores %s', (_name, stored) => {
    expect(preset('', stored)).toBeUndefined();
  });

  it('applies to users with several verticals only', () => {
    expect(
      vacancyVerticalPreset({}, VERTICAL, VERTICALS.slice(0, 1)),
    ).toBeUndefined();
    expect(vacancyVerticalPreset({}, VERTICAL, [])).toBeUndefined();
  });

  it('reads the plain search-parameter objects of the RSC page', () => {
    expect(vacancyVerticalPreset({}, OTHER, VERTICALS)).toBe(OTHER);
    expect(vacancyVerticalPreset({ vertical: 'all' }, OTHER, VERTICALS)).toBe(
      undefined,
    );
    expect(
      vacancyVerticalPreset({ vertical: [VERTICAL, OTHER] }, OTHER, VERTICALS),
    ).toBeUndefined();
    expect(vacancyVerticalPreset({ status: 'OPEN' }, OTHER, VERTICALS)).toBe(
      OTHER,
    );
    expect(vacancyVerticalPreset({}, 'all', VERTICALS)).toBeUndefined();
  });

  it('a deep-linked vacancy is already specific, so it is not redirected; an invalid one does not count', () => {
    expect(preset(`vacancy=${VACANCY}`, OTHER)).toBeUndefined();
    expect(preset(`status=OPEN&vacancy=${VACANCY.toUpperCase()}`, OTHER)).toBe(
      undefined,
    );
    expect(
      vacancyVerticalPreset({ vacancy: VACANCY }, OTHER, VERTICALS),
    ).toBeUndefined();
    expect(preset('vacancy=garbage', OTHER)).toBe(OTHER);
    expect(preset(`vacancy=${VACANCY}&vacancy=${VACANCY}`, OTHER)).toBe(OTHER);
  });
});

describe('vacancyPresetSearch redirect target [D83]', () => {
  it('keeps search, status and page size but drops cursor and selection', () => {
    expect(
      vacancyPresetSearch(
        new URLSearchParams(
          `q=Face&status=OPEN&limit=50&cursor=9&direction=newer&vacancy=${VACANCY}`,
        ),
        OTHER,
      ),
    ).toBe(`q=Face&vertical=${OTHER}&status=OPEN&limit=50`);
  });

  it('works for a bare URL and for the plain objects of the RSC page', () => {
    expect(vacancyPresetSearch({}, OTHER)).toBe(`vertical=${OTHER}`);
    expect(vacancyPresetSearch({ status: 'DRAFT' }, OTHER)).toBe(
      `vertical=${OTHER}&status=DRAFT`,
    );
  });

  it('never emits vertical=all or a malformed vertical', () => {
    expect(vacancyPresetSearch({ status: 'OPEN' }, 'all')).toBe('status=OPEN');
    expect(vacancyPresetSearch({}, 'garbage')).toBe('');
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
