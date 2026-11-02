import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PrioritiesView } from '@/components/settings/priorities-view';
import { priorityKeys } from '@/lib/queries/team-lead-priority';
import { hasAnyGrant } from '@/server/authz/can';
import { uuidOf } from '@/server/http/params';
import { getQueryClient } from '@/server/query/query-client';
import {
  getVerticalTeamLeadPriorities,
  listTeamLeadPriorityVerticals,
} from '@/server/services/team-lead-priority';
import { requirePrivilegedSession } from '../../_lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.priorities');
  return { title: t('metaTitle') };
}

/** «Налаштування → Пріоритети тімлідів» (STORY-ROLE-01-3): Admin with aal2; the tab lives in `?vertical=`. */
export default async function SettingsPrioritiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [ctx, params] = await Promise.all([
    requirePrivilegedSession(),
    searchParams,
  ]);
  if (!hasAnyGrant(ctx.auth, 'settings.priorities.manage')) notFound();
  const requested =
    typeof params.vertical === 'string'
      ? (uuidOf(params.vertical) ?? undefined)
      : undefined;
  const queryClient = getQueryClient();
  const prefetch = (verticalId: string) =>
    queryClient.prefetchQuery({
      queryKey: priorityKeys.vertical(verticalId),
      queryFn: () => getVerticalTeamLeadPriorities(ctx, verticalId),
    });
  // The requested tab loads alongside the tab list; only a missing/unknown id costs a second round-trip.
  const [verticals] = await Promise.all([
    listTeamLeadPriorityVerticals(ctx),
    requested ? prefetch(requested) : null,
  ]);
  queryClient.setQueryData(priorityKeys.verticals(), verticals);
  const selected =
    verticals.items.find((item) => item.id === requested) ?? verticals.items[0];
  if (selected && selected.id !== requested) await prefetch(selected.id);
  return (
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          query.queryKey[0] === 'settings' && query.state.status === 'success',
      })}
    >
      <PrioritiesView />
    </HydrationBoundary>
  );
}
