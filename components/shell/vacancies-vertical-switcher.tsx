'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import {
  parseVacancyPageState,
  withVacancyFilters,
} from '@/lib/vacancy-filters';
import { navigateVacancies } from '@/lib/vacancy-navigation';
import {
  resolveVerticalFilter,
  type VerticalOption,
} from '@/lib/vertical-filter';
import { VerticalSwitcher } from './vertical-switcher';

/** On «Вакансії» the switcher mirrors the URL filter and writes to it, so it can never disagree with the page's own «Вертикаль» control (D83). */
export function VacanciesVerticalSwitcher({
  verticals,
  onChange,
}: {
  verticals: readonly VerticalOption[];
  onChange: (value: string) => void;
}) {
  const searchKey = useSearchParams().toString();
  const filterVertical = useMemo(
    () =>
      parseVacancyPageState(new URLSearchParams(searchKey)).filters.vertical,
    [searchKey],
  );
  return (
    <VerticalSwitcher
      verticals={verticals}
      value={resolveVerticalFilter(filterVertical, verticals)}
      onChange={(next) => {
        onChange(next);
        navigateVacancies(
          (current) => withVacancyFilters(current, { vertical: next }),
          'replaceState',
        );
      }}
    />
  );
}
