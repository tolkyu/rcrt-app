'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, LogOut } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { SectionError } from '@/components/states/section-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DATE_TIME } from '@/lib/format';
import { myLoginHistoryQuery } from '@/lib/queries/me';
import { describeDevice } from '@/lib/user-agent';

/** Own recent sign-ins (D25, AUD-3), cursor-paginated by the auth API. */
export function LoginHistoryCard() {
  const t = useTranslations('profile');
  const format = useFormatter();
  const history = useInfiniteQuery(myLoginHistoryQuery());
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Card className="lg:col-span-12">
      <CardHeader>
        <CardTitle>{t('historyTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {history.isPending ? (
          <div className="skeleton-delayed flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : history.isError ? (
          <SectionError
            onRetry={() => void history.refetch()}
            retrying={history.isFetching}
          />
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('historyEmpty')}</p>
        ) : (
          <>
            <ul className="divide-border divide-y">
              {items.map((item) => {
                const ok = item.result === 'SUCCESS';
                const loggedOut =
                  item.action === 'logged_out' ||
                  item.action === 'session_revoked';
                const Icon = loggedOut ? LogOut : ok ? CircleCheck : CircleX;
                const found = describeDevice(item.userAgent);
                const device = found ? t('device', found) : t('unknownDevice');
                return (
                  <li key={item.id} className="flex items-start gap-3 py-3">
                    <Icon
                      className={
                        loggedOut
                          ? 'text-muted-foreground mt-0.5 size-4 shrink-0'
                          : ok
                            ? 'text-success-text mt-0.5 size-4 shrink-0'
                            : 'text-error-text mt-0.5 size-4 shrink-0'
                      }
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground text-sm font-medium">
                        {t(`historyEvents.${item.action}`)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {item.ip
                          ? t.rich('historyDeviceIp', {
                              device,
                              ip: item.ip,
                              ipChunk: (chunks) => (
                                <span className="whitespace-nowrap">
                                  {chunks}
                                </span>
                              ),
                            })
                          : device}
                      </p>
                    </div>
                    <time
                      dateTime={item.occurredAt}
                      className="text-muted-foreground shrink-0 text-xs tabular-nums"
                    >
                      {format.dateTime(new Date(item.occurredAt), DATE_TIME)}
                    </time>
                  </li>
                );
              })}
            </ul>
            {history.hasNextPage && (
              <Button
                variant="outline"
                className="mt-3 h-11 w-full md:h-10 md:w-auto"
                disabled={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                {t('historyMore')}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
