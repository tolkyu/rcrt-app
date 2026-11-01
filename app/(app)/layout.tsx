import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppProviders } from '@/components/providers/app-providers';
import { AppShell } from '@/components/shell/app-shell';
import { visibleNavItems } from '@/lib/nav';
import { PREFERENCE_COOKIES } from '@/lib/preference-cookie';
import { queryKeys } from '@/lib/query-keys';
import { parseTheme } from '@/lib/theme';
import { resolveVerticalFilter } from '@/lib/vertical-filter';
import { hasAnyGrant } from '@/server/authz/can';
import { getQueryClient } from '@/server/query/query-client';
import { getMe } from '@/server/services/me';
import { listVisibleVerticals } from '@/server/services/vertical';
import { requireSession } from './_lib/session';

/** Client components below the shell read only these namespaces (perf plan §7: per-namespace messages). */
const CLIENT_NAMESPACES = [
  'common',
  'shell',
  'nav',
  'theme',
  'states',
  'profile',
] as const;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSession();
  const queryClient = getQueryClient();
  const [cookieStore, messages, verticals] = await Promise.all([
    cookies(),
    getMessages(),
    hasAnyGrant(ctx.auth, 'vertical.read')
      ? listVisibleVerticals(ctx).then((result) => result.items)
      : Promise.resolve([]),
    queryClient.prefetchQuery({
      queryKey: queryKeys.me(),
      queryFn: () => getMe(ctx),
    }),
  ]);
  const navIds = visibleNavItems(new Set(ctx.auth.grants.keys())).map(
    (item) => item.id,
  );
  const clientMessages = Object.fromEntries(
    CLIENT_NAMESPACES.map((namespace) => [namespace, messages[namespace]]),
  );

  return (
    <NextIntlClientProvider
      locale="uk"
      timeZone="Europe/Kyiv"
      messages={clientMessages}
    >
      <AppProviders
        theme={parseTheme(cookieStore.get(PREFERENCE_COOKIES.theme)?.value)}
      >
        <HydrationBoundary state={dehydrate(queryClient)}>
          <AppShell
            navIds={navIds}
            verticals={verticals}
            verticalFilter={resolveVerticalFilter(
              cookieStore.get(PREFERENCE_COOKIES.vertical)?.value,
              verticals,
            )}
            initialCollapsed={
              cookieStore.get(PREFERENCE_COOKIES.sidebar)?.value === 'collapsed'
            }
          >
            {children}
          </AppShell>
        </HydrationBoundary>
      </AppProviders>
    </NextIntlClientProvider>
  );
}
