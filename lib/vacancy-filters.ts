import type { VacancyListQuery } from './schemas/vacancy';

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
}

export const VACANCY_SELECTED_PARAM = 'vacancy';

export function parseVacancyPageState(source: SearchSource): VacancyPageState {
  const filters: VacancyListQuery = parseVacancyPageFilters(source);
  delete filters.priority;
  const selected = one(source, VACANCY_SELECTED_PARAM);
  return {
    filters,
    ...(selected && UUID.test(selected)
      ? { selected: selected.toLowerCase() }
      : {}),
  };
}

export function vacancyPageUrlSearch(state: VacancyPageState): string {
  const params = vacancyPageSearch(state.filters);
  if (state.selected) params.set(VACANCY_SELECTED_PARAM, state.selected);
  return params.toString();
}

export type VacancyFilterPatch = Partial<
  Pick<VacancyListQuery, 'q' | 'vertical' | 'status'>
>;

/** A changed filter invalidates the cursor and the selection, because both belong to the previous result set. */
export function withVacancyFilters(
  state: VacancyPageState,
  patch: VacancyFilterPatch,
): VacancyPageState {
  const { q, vertical, status } = { ...state.filters, ...patch };
  return {
    filters: {
      ...(q ? { q } : {}),
      ...(vertical ? { vertical } : {}),
      ...(status ? { status } : {}),
      ...(state.filters.limit ? { limit: state.filters.limit } : {}),
    },
  };
}

export function withVacancyPage(
  state: VacancyPageState,
  cursor: string,
  direction: 'older' | 'newer',
): VacancyPageState {
  return { filters: { ...state.filters, cursor, direction } };
}

export const withVacancySelection = (
  state: VacancyPageState,
  selected: string | undefined,
): VacancyPageState => ({
  filters: state.filters,
  ...(selected ? { selected } : {}),
});

export const hasVacancyFilters = ({ filters }: VacancyPageState): boolean =>
  Boolean(filters.q || filters.vertical || filters.status);
