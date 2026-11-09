import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PositionsView } from '@/components/positions/positions-view';
import { PREFERENCE_COOKIES } from '@/lib/preference-cookie';
import { MANAGER_POSITIONS, positionsQuery } from '@/lib/queries/positions';
import { resolveVerticalFilter } from '@/lib/vertical-filter';
import { can, hasAnyGrant } from '@/server/authz/can';
import type { VerticalId } from '@/server/authz/types';
import { describeError, logger } from '@/server/observability/logger';
import { getQueryClient } from '@/server/query/query-client';
import { listPositionCatalog } from '@/server/services/position';
import { requirePrivilegedSession } from '../../_lib/session';
import { getVisibleVerticals } from '../../_lib/verticals';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('positions');
  return { title: t('metaTitle') };
}

/** «Довідник посад» (VAC-01, D76, ADR-013): 404 without `position.manage`; the Admin's withheld grants send aal1 to TOTP first. */
export default async function PositionsPage() {
  const ctx = await requirePrivilegedSession();
  if (!hasAnyGrant(ctx.auth, 'position.manage')) notFound();
  const queryClient = getQueryClient();
  const [cookieStore, visible] = await Promise.all([
    cookies(),
    getVisibleVerticals(),
    listPositionCatalog(ctx, MANAGER_POSITIONS).then(
      (list) =>
        queryClient.setQueryData(
          positionsQuery(MANAGER_POSITIONS).queryKey,
          list,
        ),
      (error: unknown) =>
        // The client query retries and shows the error state; the log carries no names or ids.
        logger.error(
          { err: describeError(error) },
          'position list prefetch failed',
        ),
    ),
  ]);
  const managed = visible.items.filter((entry) =>
    can(ctx.auth, 'position.manage', {
      type: 'vertical',
      id: entry.id as VerticalId,
    }),
  );
  return (
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          query.queryKey[0] === 'positions' && query.state.status === 'success',
      })}
    >
      <PositionsView
        managedVerticals={managed}
        defaultVertical={resolveVerticalFilter(
          cookieStore.get(PREFERENCE_COOKIES.vertical)?.value,
          managed,
        )}
      />
    </HydrationBoundary>
  );
}
