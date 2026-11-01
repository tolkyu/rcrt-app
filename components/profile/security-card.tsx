'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from '@/lib/toast';
import { SectionError } from '@/components/states/section-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '@/lib/api-client';
import { myMfaQuery, mySessionsQuery } from '@/lib/queries/me';
import { queryKeys } from '@/lib/query-keys';
import { type MfaStatus, type SessionList } from '@/lib/schemas/auth';
import { DATE_TIME } from '@/lib/format';
import { describeDevice } from '@/lib/user-agent';
import { cn } from '@/lib/utils';

interface MfaView {
  readonly tone: 'ok' | 'warn' | 'neutral';
  readonly textKey:
    'mfaVerified' | 'mfaRequired' | 'mfaEnabled' | 'mfaOptional';
  readonly action: {
    readonly href: '/mfa/setup' | '/mfa/verify';
    readonly key: 'mfaAddBackup' | 'mfaVerify' | 'mfaSetup';
    readonly primary: boolean;
  } | null;
}

/** What «Профіль» says about 2FA: confirmed session, pending Admin/Finance grants, enabled, or optional. */
function mfaView(status: MfaStatus): MfaView {
  if (status.aal === 'aal2') {
    return {
      tone: 'ok',
      textKey: 'mfaVerified',
      action: status.canAddFactor
        ? { href: '/mfa/setup', key: 'mfaAddBackup', primary: false }
        : null,
    };
  }
  if (status.required) {
    return {
      tone: 'warn',
      textKey: 'mfaRequired',
      action: { href: '/mfa/verify', key: 'mfaVerify', primary: true },
    };
  }
  if (status.factors.length > 0) {
    return { tone: 'ok', textKey: 'mfaEnabled', action: null };
  }
  return {
    tone: 'neutral',
    textKey: 'mfaOptional',
    action: { href: '/mfa/setup', key: 'mfaSetup', primary: false },
  };
}

const TONE_ICON = {
  ok: ShieldCheck,
  warn: ShieldAlert,
  neutral: ShieldQuestion,
} as const;
const TONE_CLASS = {
  ok: 'text-success-text',
  warn: 'text-warning-text',
  neutral: 'text-muted-foreground-strong',
} as const;

function MfaPanel() {
  const t = useTranslations('profile');
  const mfa = useQuery(myMfaQuery());
  if (mfa.isPending) {
    return <Skeleton className="skeleton-delayed h-14 w-full" />;
  }
  if (mfa.isError) {
    return (
      <SectionError
        onRetry={() => void mfa.refetch()}
        retrying={mfa.isFetching}
      />
    );
  }
  const view = mfaView(mfa.data);
  const Icon = TONE_ICON[view.tone];
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <span className="bg-surface-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Icon
          className={cn('size-5', TONE_CLASS[view.tone])}
          aria-hidden="true"
        />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-foreground text-sm font-semibold">
          {t('mfaTitle')}
        </h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {view.textKey === 'mfaEnabled'
            ? t('mfaEnabled', { count: mfa.data.factors.length })
            : t(view.textKey)}
        </p>
      </div>
      {view.action && (
        <Link
          href={view.action.href}
          className={cn(
            buttonVariants({
              variant: view.action.primary ? 'default' : 'outline',
            }),
            'h-11 md:h-10',
          )}
        >
          {t(view.action.key)}
        </Link>
      )}
    </div>
  );
}

function SessionRow({ session }: { session: SessionList['items'][number] }) {
  const t = useTranslations('profile');
  const format = useFormatter();
  const device = describeDevice(session.userAgent);
  return (
    <li className="border-border flex items-start gap-3 rounded-lg border p-3">
      <span className="bg-surface-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Laptop
          className="text-muted-foreground-strong size-5"
          aria-hidden="true"
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground text-sm font-semibold">
            {device ? t('device', device) : t('unknownDevice')}
          </span>
          {session.current && (
            <span className="bg-primary-subtle text-link rounded-full px-2 py-0.5 text-xs font-medium">
              {t('sessionsCurrent')}
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {t(`methods.${session.method}`)}
        </p>
        <p className="text-muted-foreground mt-1 text-xs tabular-nums">
          {t('sessionStarted', {
            at: format.dateTime(new Date(session.startedAt), DATE_TIME),
          })}
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {t('sessionLastSeen', {
            at: format.dateTime(new Date(session.lastSeenAt), DATE_TIME),
          })}
        </p>
      </div>
    </li>
  );
}

function SessionsPanel() {
  const t = useTranslations('profile');
  const queryClient = useQueryClient();
  const sessions = useQuery(mySessionsQuery());
  const endOthers = useMutation({
    mutationFn: () =>
      apiRequest('/auth/sessions/end-others', {
        method: 'POST',
        body: {},
        schema: async () =>
          (await import('@/lib/schemas/auth')).endOtherSessionsResponseSchema,
      }),
    onSuccess: ({ count }) => toast.success(t('endedOthers', { count })),
    onError: () => toast.error(t('endOthersFailed')),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.mySessions() }),
  });

  return (
    <section aria-labelledby="sessions-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="sessions-title"
          className="text-foreground text-sm font-semibold"
        >
          {t('sessionsTitle')}
        </h3>
        {sessions.data && sessions.data.items.some((item) => !item.current) && (
          <Button
            variant="destructive-soft"
            size="sm"
            className="h-11 md:h-8"
            disabled={endOthers.isPending}
            onClick={() => endOthers.mutate()}
          >
            {endOthers.isPending ? t('endingOthers') : t('endOthers')}
          </Button>
        )}
      </div>
      {sessions.isPending ? (
        <Skeleton className="skeleton-delayed h-24 w-full" />
      ) : sessions.isError ? (
        <SectionError
          onRetry={() => void sessions.refetch()}
          retrying={sessions.isFetching}
        />
      ) : sessions.data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('sessionsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.data.items.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** «Безпека входу»: 2FA state and own sessions, both served by the auth API (SEC-AUTH-3/4). */
export function SecurityCard() {
  const t = useTranslations('profile');
  return (
    <Card className="lg:col-span-7">
      <CardHeader>
        <CardTitle>{t('securityTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <MfaPanel />
        <SessionsPanel />
      </CardContent>
    </Card>
  );
}
