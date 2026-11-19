import {
  parseVacancyPageState,
  vacancyPageUrlSearch,
  type VacancyPageState,
} from './vacancy-filters';

/** Reads the live URL so a debounced search never overwrites a filter chosen meanwhile. */
export function navigateVacancies(
  update: (current: VacancyPageState) => VacancyPageState,
  mode: 'pushState' | 'replaceState',
): void {
  const next = vacancyPageUrlSearch(
    update(parseVacancyPageState(new URLSearchParams(window.location.search))),
  );
  window.history[mode](null, '', next ? `?${next}` : window.location.pathname);
}
