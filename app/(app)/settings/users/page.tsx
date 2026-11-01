import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { UsersView } from '@/components/settings/users-view';
import { queryKeys } from '@/lib/query-keys';
import {
  parseUserSearch,
  userFilterValues,
  userSearchParams,
} from '@/lib/user-filters';
import { hasAnyGrant } from '@/server/authz/can';
import { getQueryClient } from '@/server/query/query-client';
import { listUserPage } from '@/server/services/user';
import { listSettingsVerticals } from '@/server/services/vertical';
import { requirePrivilegedSession } from '../../_lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.users');
  return { title: t('metaTitle') };
}

/** «Налаштування → Користувачі та ролі» (STORY-ROLE-05-4): Admin with aal2 only; list, search, filters. */
export default async function SettingsUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [ctx, params] = await Promise.all([
    requirePrivilegedSession(),
    searchParams,
  ]);
  if (!hasAnyGrant(ctx.auth, 'settings.users.manage')) notFound();
  const search = parseUserSearch(params);
  const filters = userFilterValues(search);
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.settingsUsers(filters),
      initialPageParam: null as string | null,
      queryFn: () => listUserPage(ctx, search),
    }),
    hasAnyGrant(ctx.auth, 'settings.verticals.manage') &&
      queryClient.prefetchQuery({
        queryKey: queryKeys.settingsVerticals(),
        queryFn: () => listSettingsVerticals(ctx),
      }),
  ]);
  return (
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          query.queryKey[0] === 'settings' && query.state.status === 'success',
      })}
    >
      <UsersView
        key={userSearchParams(search).toString()}
        currentUserId={ctx.auth.userId}
        canListVerticals={hasAnyGrant(ctx.auth, 'settings.verticals.manage')}
      />
    </HydrationBoundary>
  );
}
