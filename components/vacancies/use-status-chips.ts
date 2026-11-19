'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { vacancyDraftCountQuery } from '@/lib/queries/vacancy-detail';
import type { VacancyListQuery } from '@/lib/schemas/vacancy';
import { VACANCY_FILTER_ORDER } from '@/lib/vacancy-filters';

/** Status chips of «Вакансії» with the author's draft count on «Чернетки», and whether the «Чернетки» empty state applies (spec §6.1). */
export function useStatusChips(
  canAuthorDrafts: boolean,
  filters: Pick<VacancyListQuery, 'status' | 'q'>,
) {
  const t = useTranslations('vacancies');
  const draftCount = useQuery({
    ...vacancyDraftCountQuery(),
    enabled: canAuthorDrafts,
  }).data?.count;
  const statusOptions = useMemo(
    () => [
      { value: '', label: t('all') },
      ...VACANCY_FILTER_ORDER.filter(
        (status) => canAuthorDrafts || status !== 'DRAFT',
      ).map((status) => ({
        value: status,
        label: t(`filterStatuses.${status}`),
        count: status === 'DRAFT' ? draftCount : undefined,
      })),
    ],
    [t, canAuthorDrafts, draftCount],
  );
  /** «Чернетки» is the author's own drawer: its empty state shows only when no draft exists at all; drafts hidden by a search or vertical are a filtered miss. */
  const draftsEmpty =
    filters.status === 'DRAFT' && !filters.q && draftCount === 0;
  return { statusOptions, draftsEmpty };
}
