import { dehydrate, hashKey, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileView } from '@/components/profile/profile-view';
import { PageHeader } from '@/components/shell/page-header';
import { LOGIN_HISTORY_PAGE, queryKeys } from '@/lib/query-keys';
import { getQueryClient } from '@/server/query/query-client';
import { authDependencies } from '@/server/services/auth/app';
import { mfaStatus } from '@/server/services/auth/mfa';
import {
  listMyLoginHistory,
  listMySessions,
} from '@/server/services/auth/session';
import { requireSession } from '../_lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile');
  return { title: t('metaTitle') };
}

/** «Профіль» for every signed-in user (ROLE-05-6); `me` is already hydrated by the shell layout. */
export default async function ProfilePage() {
  const [ctx, t] = await Promise.all([
    requireSession(),
    getTranslations('profile'),
  ]);
  const queryClient = getQueryClient();
  const keys = [
    queryKeys.mySessions(),
    queryKeys.myMfa(),
    queryKeys.myLoginHistory(),
  ];
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.mySessions(),
      queryFn: () => listMySessions(ctx),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.myMfa(),
      queryFn: () => mfaStatus(authDependencies, ctx),
    }),
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.myLoginHistory(),
      initialPageParam: null as string | null,
      queryFn: () => listMyLoginHistory(ctx, { limit: LOGIN_HISTORY_PAGE }),
    }),
  ]);
  const own = new Set(keys.map((key) => hashKey(key)));
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <HydrationBoundary
        state={dehydrate(queryClient, {
          shouldDehydrateQuery: (query) =>
            own.has(query.queryHash) && query.state.status === 'success',
        })}
      >
        <ProfileView />
      </HydrationBoundary>
    </>
  );
}
