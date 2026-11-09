import type { VacancyListQuery } from './schemas/vacancy';
import {
  ALL_VERTICALS,
  resolveVerticalFilter,
  type VerticalOption,
} from './vertical-filter';

export const VACANCY_STATUSES = [
  'DRAFT',
  'OPEN',
  'ON_HOLD',
  'FILLED',
  'CANCELLED',
] as const;
export const VACANCY_PRIORITIES = ['NORMAL', 'URGENT'] as const;
export const VACANCY_PAGE_SIZES = [25, 50, 100] as const;
export const VACANCY_SEARCH_MAX = 120;
export const VACANCY_SEARCH_MIN = 3;
/** PostgreSQL rejects NUL in text parameters (SQLSTATE 22021), which would surface as a 500. */
export const hasNoNul = (value: string): boolean => !value.includes('\u0000');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BIGINT = '9223372036854775807';

export function isVacancyCursor(value: string): boolean {
  return (
    /^[1-9]\d{0,18}$/.test(value) &&
    (value.length < MAX_BIGINT.length || value <= MAX_BIGINT)
  );
}

type SearchSource =
  Readonly<Record<string, string | string[] | undefined>> | URLSearchParams;

function one(source: SearchSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) {
    const values = source.getAll(key);
    return values.length === 1 ? values[0] : undefined;
  }
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

/** Page URLs drop malformed values; the public API independently rejects them. */
export function parseVacancyPageFilters(
  source: SearchSource,
): VacancyListQuery {
  const q = one(source, 'q')?.trim();
  const vertical = one(source, 'vertical');
  const status = VACANCY_STATUSES.find(
    (value) => value === one(source, 'status'),
  );
  const priority = VACANCY_PRIORITIES.find(
    (value) => value === one(source, 'priority'),
  );
  const rawCursor = one(source, 'cursor');
  const cursor =
    rawCursor && isVacancyCursor(rawCursor) ? rawCursor : undefined;
  const limit =
    VACANCY_PAGE_SIZES.find(
      (value) => String(value) === one(source, 'limit'),
    ) ?? 25;
  return {
    ...(q &&
    q.length >= VACANCY_SEARCH_MIN &&
    q.length <= VACANCY_SEARCH_MAX &&
    hasNoNul(q)
      ? { q }
      : {}),
    ...(vertical && UUID.test(vertical)
      ? { vertical: vertical.toLowerCase() }
      : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(cursor ? { cursor } : {}),
    ...(cursor && one(source, 'direction') === 'newer'
      ? { direction: 'newer' as const }
      : {}),
    limit,
  };
}

export function vacancyPageSearch(filters: VacancyListQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || (key === 'direction' && !filters.cursor))
      continue;
    if (key === 'limit' && value === 25) continue;
    params.set(key, String(value));
  }
  return params;
}

export const vacancyApiFilters = (
  filters: VacancyListQuery,
): VacancyListQuery => parseVacancyPageFilters(vacancyPageSearch(filters));

/** The page shows search, vertical and status only; the URL `vacancy` parameter selects the preview row. */
export interface VacancyPageState {
  readonly filters: VacancyListQuery;
  readonly selected?: string;
  /** `vertical=all` in the URL: «Усі» chosen explicitly, which a header-vertical preset must not override. */
  readonly allVerticals?: true;
}

export const VACANCY_SELECTED_PARAM = 'vacancy';

const hasParam = (source: SearchSource, key: string): boolean =>
  source instanceof URLSearchParams
    ? source.has(key)
    : source[key] !== undefined;

export function parseVacancyPageState(source: SearchSource): VacancyPageState {
  const filters: VacancyListQuery = parseVacancyPageFilters(source);
  delete filters.priority;
  const selected = one(source, VACANCY_SELECTED_PARAM);
  return {
    filters,
    ...(selected && UUID.test(selected)
      ? { selected: selected.toLowerCase() }
      : {}),
    // A present but unusable `vertical` (garbage, empty, repeated) still counts as explicit, so follow-up URLs carry `vertical=all`.
    ...(hasParam(source, 'vertical') && !filters.vertical
      ? { allVerticals: true as const }
      : {}),
  };
}

export function vacancyPageUrlSearch(state: VacancyPageState): string {
  const params = vacancyPageSearch(state.filters);
  if (state.allVerticals && !state.filters.vertical)
    params.set('vertical', ALL_VERTICALS);
  if (state.selected) params.set(VACANCY_SELECTED_PARAM, state.selected);
  return params.toString();
}

/** `vertical` is a vertical id, `ALL_VERTICALS` for the explicit «Усі», or undefined for no vertical in the URL. */
export type VacancyFilterPatch = Partial<
  Pick<VacancyListQuery, 'q' | 'status'>
> & {
  vertical?: string | undefined;
};

/** A changed filter invalidates the cursor and the selection, because both belong to the previous result set. */
export function withVacancyFilters(
  state: VacancyPageState,
  patch: VacancyFilterPatch,
): VacancyPageState {
  const { q, status } = { ...state.filters, ...patch };
  const vertical =
    'vertical' in patch
      ? patch.vertical
      : (state.filters.vertical ??
        (state.allVerticals ? ALL_VERTICALS : undefined));
  return {
    filters: {
      ...(q ? { q } : {}),
      ...(vertical && vertical !== ALL_VERTICALS ? { vertical } : {}),
      ...(status ? { status } : {}),
      ...(state.filters.limit ? { limit: state.filters.limit } : {}),
    },
    ...(vertical === ALL_VERTICALS ? { allVerticals: true as const } : {}),
  };
}

/** Only a bare URL falls back to the header vertical (D83): any `vertical`, even `all`, wins, and a deep-linked vacancy is already specific. */
const mayPresetVacancyVertical = (
  source: SearchSource,
  stored: string | null | undefined,
): boolean => {
  const selected = one(source, VACANCY_SELECTED_PARAM);
  return (
    Boolean(stored) &&
    stored !== ALL_VERTICALS &&
    !hasParam(source, 'vertical') &&
    !(selected && UUID.test(selected))
  );
};

/**
 * D83: the header vertical seeds the filter for users with several verticals. The page redirects once to an
 * explicit `?vertical=<id>`, so a shared bare link resolves to the recipient's own header vertical a single time
 * and every later reload, Back or copied URL says exactly what is filtered.
 */
export function vacancyVerticalPreset(
  source: SearchSource,
  stored: string | null | undefined,
  verticals: readonly VerticalOption[],
): string | undefined {
  if (!mayPresetVacancyVertical(source, stored) || verticals.length < 2)
    return undefined;
  const id = resolveVerticalFilter(stored, verticals);
  return id === ALL_VERTICALS ? undefined : id;
}

/** Redirect target of the preset: keeps search, status and page size, drops cursor and selection, and only ever carries a real vertical id. */
export function vacancyPresetSearch(
  source: SearchSource,
  preset: string,
): string {
  return vacancyPageUrlSearch(
    withVacancyFilters(parseVacancyPageState(source), {
      vertical: UUID.test(preset) ? preset.toLowerCase() : undefined,
    }),
  );
}

export function withVacancyPage(
  state: VacancyPageState,
  cursor: string,
  direction: 'older' | 'newer',
): VacancyPageState {
  return {
    filters: { ...state.filters, cursor, direction },
    ...(state.allVerticals ? { allVerticals: true as const } : {}),
  };
}

export const withVacancySelection = (
  state: VacancyPageState,
  selected: string | undefined,
): VacancyPageState => ({
  filters: state.filters,
  ...(selected ? { selected } : {}),
  ...(state.allVerticals ? { allVerticals: true as const } : {}),
});

export const hasVacancyFilters = ({ filters }: VacancyPageState): boolean =>
  Boolean(filters.q || filters.vertical || filters.status);
