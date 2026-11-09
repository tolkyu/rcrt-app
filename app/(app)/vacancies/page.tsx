import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { VacanciesView } from '@/components/vacancies/vacancies-view';
import { Skeleton } from '@/components/ui/skeleton';
import { PREFERENCE_COOKIES } from '@/lib/preference-cookie';
import { vacanciesQuery, vacancyDetailQuery } from '@/lib/queries/vacancies';
import {
  parseVacancyPageState,
  vacancyPageUrlSearch,
  vacancyPresetSearch,
  vacancyVerticalPreset,
  withVacancyFilters,
} from '@/lib/vacancy-filters';
import { hasAnyGrant } from '@/server/authz/can';
import { NotFoundError } from '@/server/http/errors';
import { describeError, logger } from '@/server/observability/logger';
import { getQueryClient } from '@/server/query/query-client';
import { getVacancyDetail, listVacancyPage } from '@/server/services/vacancy';
import { requireSession } from '../_lib/session';
import { getVisibleVerticals } from '../_lib/verticals';

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vacancies');
  return { title: t('metaTitle') };
}

async function VacanciesFallback() {
  const t = await getTranslations('vacancies');
  const tStates = await getTranslations('states');
  return (
    <div role="status" className="skeleton-delayed">
      <span className="sr-only">{tStates('loading')}</span>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Skeleton className="mb-4 h-16 w-full" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

async function VacanciesContent({ params }: { params: SearchParams }) {
  const ctx = await requireSession();
  const state = parseVacancyPageState(params);
  const queryClient = getQueryClient();
  const prefetchDetail = (id: string) =>
    getVacancyDetail(ctx, id).then(
      (detail) => {
        queryClient.setQueryData(
          vacancyDetailQuery(detail.id).queryKey,
          detail,
        );
      },
      (error: unknown) => {
        if (error instanceof NotFoundError) return;
        logger.error(
          { err: describeError(error) },
          'vacancy preview prefetch failed',
        );
      },
    );
  const [outcome] = await Promise.all([
    listVacancyPage(ctx, state.filters).then(
      async (page) => {
        queryClient.setQueryData(vacanciesQuery(state.filters).queryKey, page);
        // Without `?vacancy=` the client previews the first row on wide screens; shipping it avoids a request after hydration.
        const first = page.items[0];
        if (first && !state.selected) await prefetchDetail(first.id);
        return page.items.length === 0 && state.filters.cursor
          ? ('orphanCursor' as const)
          : ('loaded' as const);
      },
      (error: unknown) => {
        // A role without vacancy access ends in the layout's 404; nothing to report here.
        if (error instanceof NotFoundError) return 'denied' as const;
        // The client query retries and shows the error state; the log carries no ids or PII.
        logger.error(
          { err: describeError(error) },
          'vacancy list prefetch failed',
        );
        return 'failed' as const;
      },
    ),
    state.selected && prefetchDetail(state.selected),
  ]);
  if (outcome === 'orphanCursor') {
    const search = vacancyPageUrlSearch(withVacancyFilters(state, {}));
    redirect(search ? `/vacancies?${search}` : '/vacancies');
  }
  return (
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          (query.queryKey[0] === 'vacancies' ||
            query.queryKey[0] === 'vacancy') &&
          query.state.status === 'success',
      })}
    >
      <VacanciesView
        canManagePositions={hasAnyGrant(ctx.auth, 'position.manage')}
      />
    </HydrationBoundary>
  );
}

/** «Вакансії» (STORY-VAC-04-1): scoped list prefetched on the server; the layout above already enforced `vacancy.read`. */
export default async function VacanciesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);
  const stored = cookieStore.get(PREFERENCE_COOKIES.vertical)?.value;
  const preset = vacancyVerticalPreset(
    params,
    stored,
    (await getVisibleVerticals()).items,
  );
  if (preset) redirect(`/vacancies?${vacancyPresetSearch(params, preset)}`);
  return (
    <Suspense fallback={<VacanciesFallback />}>
      <VacanciesContent params={params} />
    </Suspense>
  );
}
