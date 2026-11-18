'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { SectionError } from '@/components/states/section-error';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { withVacancySelection } from '@/lib/vacancy-filters';
import { navigateVacancies } from '@/lib/vacancy-navigation';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import { TeamSkeleton } from './team-skeleton';
import { VacancyOverview } from './vacancy-overview';

/** Own request and error state, so a failing preview never takes the list down (VIS-01, UI-06). */
export function VacancyPreview({
  id,
  canAuthorDrafts,
}: {
  id: string;
  canAuthorDrafts: boolean;
}) {
  const t = useTranslations('vacancies');
  const query = useQuery(vacancyDetailQuery(id));
  if (query.data)
    return (
      <VacancyOverview
        vacancy={query.data}
        preview
        canAuthorDrafts={canAuthorDrafts}
        onClaimLost={() =>
          navigateVacancies(
            (current) => withVacancySelection(current, undefined),
            'replaceState',
          )
        }
      />
    );
  if (query.error instanceof ApiError && query.error.status === 404)
    return (
      <p role="status" className="text-muted-foreground p-5 text-sm">
        {t('previewNotFound')}
      </p>
    );
  if (query.isError)
    return (
      <SectionError
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  return (
    <div role="status" className="skeleton-delayed flex flex-col gap-4 p-5">
      <span className="sr-only">{t('previewLoading')}</span>
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-6 w-24" />
      <TeamSkeleton />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
