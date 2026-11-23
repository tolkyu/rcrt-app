import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { notFound, unstable_rethrow } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ContentLoadRetry } from '@/components/vacancies/vacancy-content-feedback';
import { vacancyContentClientMessages } from '@/lib/i18n/vacancy-content-messages';
import { queryKeys } from '@/lib/query-keys';
import { describeError, logger } from '@/server/observability/logger';
import { getQueryClient } from '@/server/query/query-client';
import { requireSession } from '../../../../_lib/session';
import { loadVacancyContent } from '../../../_lib/vacancy-content';
import { loadVacancy } from '../../../_lib/vacancy';

type Attempt<T> = { ok: true; value: T } | { ok: false };

const attempt = <T,>(read: Promise<T>, label: string): Promise<Attempt<T>> =>
  read.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => {
      unstable_rethrow(error);
      logger.error({ err: describeError(error) }, label);
      return { ok: false };
    },
  );

/** Decided above the loading boundary so a hidden or missing vacancy is an actual HTTP 404 (VIS-02); a transient failure becomes a retry state, never a writable empty document (ADR-020). */
export default async function ContentEditLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ vacancyId: string }>;
}) {
  const { vacancyId } = await params;
  const [, vacancy, content, messages] = await Promise.all([
    requireSession(),
    attempt(loadVacancy(vacancyId), 'vacancy content edit: card read failed'),
    attempt(
      loadVacancyContent(vacancyId),
      'vacancy content edit: content read failed',
    ),
    getMessages(),
  ]);
  if (
    (vacancy.ok && vacancy.value === null) ||
    (content.ok && content.value === null)
  )
    notFound();
  const provide = (node: ReactNode) => (
    <NextIntlClientProvider
      locale="uk"
      timeZone="Europe/Kyiv"
      messages={vacancyContentClientMessages(messages)}
    >
      {node}
    </NextIntlClientProvider>
  );
  if (!vacancy.ok || !content.ok || !vacancy.value || !content.value)
    return provide(<ContentLoadRetry />);
  const queryClient = getQueryClient();
  queryClient.setQueryData(queryKeys.vacancy(vacancy.value.id), vacancy.value);
  queryClient.setQueryData(
    queryKeys.vacancyContent(vacancy.value.id),
    content.value,
  );
  return provide(
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          query.queryKey[0] === 'vacancy' && query.state.status === 'success',
      })}
    >
      {children}
    </HydrationBoundary>,
  );
}
