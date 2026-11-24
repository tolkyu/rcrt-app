'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { SectionError } from '@/components/states/section-error';
import { BackLink } from '@/components/ui/back-link';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import { isVacancyClosed } from '@/lib/vacancy-closed';
import { useVacancyListHref } from '@/lib/vacancy-list-memory';
import { LostClaimCardNotice } from './lost-claim-card-notice';
import { TeamSkeleton } from './team-skeleton';
import { useVacancyContentAccess } from './use-vacancy-content-access';
import { VacancyContentPanel } from './vacancy-content-panel';
import { VacancyOverview } from './vacancy-overview';

/** Full-width card for direct links and mobile; the data was prefetched by the segment layout. */
export function VacancyDetailView({
  id,
  canAuthorDrafts,
}: {
  id: string;
  canAuthorDrafts: boolean;
}) {
  const t = useTranslations('vacancies');
  const router = useRouter();
  const listHref = useVacancyListHref();
  const queryClient = useQueryClient();
  const access = useVacancyContentAccess(id);
  const { state } = access;
  // A content 404/403 proves the whole card unreadable: no stale metadata or actions stay behind it (ADR-020).
  const denied = state.kind === 'unavailable' ? state.reason : null;
  const query = useQuery({
    ...vacancyDetailQuery(id),
    enabled: !denied && !isVacancyClosed(queryClient, id),
  });
  const vacancy = denied ? undefined : query.data;
  const missing =
    denied === 'notFound' ||
    (!vacancy && query.error instanceof ApiError && query.error.status === 404);
  return (
    <>
      <BackLink href={listHref} label={t('detail.back')} className="mb-2" />
      {vacancy && (
        <>
          <PageHeader title={vacancy.title} />
          <Card className="max-w-3xl">
            <VacancyOverview
              vacancy={vacancy}
              canAuthorDrafts={canAuthorDrafts}
              onClaimLost={() => router.replace(listHref)}
              content={
                <VacancyContentPanel
                  id={id}
                  state={state}
                  onRetry={() => {
                    access.revalidate().catch(() => undefined);
                  }}
                />
              }
            />
          </Card>
        </>
      )}
      {missing && (
        <Card>
          <EmptyState
            icon={SearchX}
            title={t('detail.notFoundTitle')}
            description={t('detail.notFoundDescription')}
          />
          <LostClaimCardNotice />
        </Card>
      )}
      {!vacancy && !denied && !missing && query.isError && (
        <Card>
          <SectionError
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        </Card>
      )}
      {(denied === 'session' || (!denied && !vacancy && query.isPending)) && (
        <div role="status" className="skeleton-delayed">
          <span className="sr-only">{t('previewLoading')}</span>
          <Skeleton className="h-8 w-64" />
          <Card className="mt-6 flex max-w-3xl flex-col gap-5 p-4 md:p-5">
            <Skeleton className="h-6 w-24" />
            <TeamSkeleton />
            <Skeleton className="h-64 w-full" />
          </Card>
        </div>
      )}
    </>
  );
}
