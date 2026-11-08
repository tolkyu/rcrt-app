import { useSyncExternalStore } from 'react';
import { parseVacancyPageState, vacancyPageUrlSearch } from './vacancy-filters';

const STORAGE_KEY = 'vacancies:list-search';

/** Remembers the list view of this tab so a card's back link returns to the same filters and page. */
export function rememberVacancyList(search: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, search);
  } catch {
    // Storage can be blocked; the back link then opens the unfiltered list.
  }
}

/** The stored value is re-parsed, so only known, valid list parameters can reach the link. */
export function savedVacancyListSearch(): string {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored
      ? vacancyPageUrlSearch(parseVacancyPageState(new URLSearchParams(stored)))
      : '';
  } catch {
    return '';
  }
}

export const vacancyListHref = (search: string): string =>
  search ? `/vacancies?${search}` : '/vacancies';

const subscribe = () => () => undefined;

/** The server snapshot is the plain list, so hydration never mismatches. */
export function useVacancyListHref(): string {
  return vacancyListHref(
    useSyncExternalStore(subscribe, savedVacancyListSearch, () => ''),
  );
}
