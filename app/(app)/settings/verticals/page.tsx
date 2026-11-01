import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { VerticalsView } from '@/components/settings/verticals-view';
import { queryKeys } from '@/lib/query-keys';
import { hasAnyGrant } from '@/server/authz/can';
import { getQueryClient } from '@/server/query/query-client';
import { listSettingsVerticals } from '@/server/services/vertical';
import { requirePrivilegedSession } from '../../_lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.verticals');
  return { title: t('metaTitle') };
}

/** «Налаштування → Вертикалі» (STORY-ROLE-03-1): list, create, rename; never deactivate or delete (D34). */
export default async function SettingsVerticalsPage() {
  const ctx = await requirePrivilegedSession();
  if (!hasAnyGrant(ctx.auth, 'settings.verticals.manage')) notFound();
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: queryKeys.settingsVerticals(),
    queryFn: () => listSettingsVerticals(ctx),
  });
  return (
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          query.queryKey[0] === 'settings' && query.state.status === 'success',
      })}
    >
      <VerticalsView />
    </HydrationBoundary>
  );
}
