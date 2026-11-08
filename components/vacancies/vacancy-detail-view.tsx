'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { SectionError } from '@/components/states/section-error';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { vacancyDetailQuery } from '@/lib/queries/vacancies';
import { useVacancyListHref } from '@/lib/vacancy-list-memory';
import { cn } from '@/lib/utils';
import { VacancyOverview } from './vacancy-overview';

function BackLink({ className }: { className?: string }) {
  const t = useTranslations('vacancies.detail');
  const href = useVacancyListHref();
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'md' }),
        'h-11 text-sm',
        className,
      )}
    >
      <ArrowLeft aria-hidden="true" />
      {t('back')}
    </Link>
  );
}

/** Full-width card for direct links and mobile; the data was prefetched by the segment layout. */
export function VacancyDetailView({ id }: { id: string }) {
  const t = useTranslations('vacancies');
  const query = useQuery(vacancyDetailQuery(id));
  const vacancy = query.data;
  return (
    <>
      <BackLink className="mb-2 -ml-3" />
      {vacancy && (
        <>
          <PageHeader title={vacancy.title} />
          <Card className="max-w-3xl">
            <VacancyOverview vacancy={vacancy} />
          </Card>
        </>
      )}
      {!vacancy &&
        query.error instanceof ApiError &&
        query.error.status === 404 && (
          <Card>
            <EmptyState
              icon={SearchX}
              title={t('detail.notFoundTitle')}
              description={t('detail.notFoundDescription')}
            />
          </Card>
        )}
      {!vacancy &&
        query.isError &&
        !(query.error instanceof ApiError && query.error.status === 404) && (
          <Card>
            <SectionError
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          </Card>
        )}
      {!vacancy && query.isPending && (
        <div role="status" className="skeleton-delayed">
          <span className="sr-only">{t('previewLoading')}</span>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-6 h-96 max-w-3xl rounded-xl" />
        </div>
      )}
    </>
  );
}
