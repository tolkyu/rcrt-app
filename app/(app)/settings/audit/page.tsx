import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuditView } from '@/components/settings/audit-view';
import {
  auditApiFilters,
  auditSearchParams,
  parseAuditSearch,
} from '@/lib/audit-filters';
import { AUDIT_SYSTEM_ACTOR } from '@/lib/audit-constants';
import { auditQuery } from '@/lib/queries/settings';
import { hasAnyGrant } from '@/server/authz/can';
import { getQueryClient } from '@/server/query/query-client';
import { getAuditActor, listAudit } from '@/server/services/audit';
import { requirePrivilegedSession } from '../../_lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.audit');
  return { title: t('metaTitle') };
}

/** «Налаштування → Журнал дій» (STORY-AUD-2): read-only, Admin with aal2 only (D25). */
export default async function SettingsAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [ctx, params] = await Promise.all([
    requirePrivilegedSession(),
    searchParams,
  ]);
  if (!hasAnyGrant(ctx.auth, 'audit.read')) notFound();
  const search = parseAuditSearch(params);
  const filters = auditApiFilters(search, ctx.clock.now());
  const queryClient = getQueryClient();
  const [, initialActor] = await Promise.all([
    queryClient.prefetchInfiniteQuery({
      queryKey: auditQuery(filters).queryKey,
      initialPageParam: null as string | null,
      queryFn: () => listAudit(ctx, filters),
    }),
    search.actorId && search.actorId !== AUDIT_SYSTEM_ACTOR
      ? getAuditActor(ctx, search.actorId)
      : null,
  ]);
  return (
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          query.queryKey[0] === 'settings' && query.state.status === 'success',
      })}
    >
      <AuditView
        key={auditSearchParams(search).toString()}
        initialSearch={search}
        initialFilters={filters}
        initialActor={initialActor}
      />
    </HydrationBoundary>
  );
}
