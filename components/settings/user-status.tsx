'use client';

import { AlertTriangle, Check, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { UserListItem } from '@/lib/schemas/user';
import { cn } from '@/lib/utils';

const STATUS_DOT = {
  ACTIVE: 'bg-success',
  INVITED: 'bg-primary',
  INVITE_EXPIRED: 'bg-warning',
  REVOKED: 'bg-muted-foreground',
  DEACTIVATED: 'border-muted-foreground border border-dashed',
} as const satisfies Record<UserListItem['status'], string>;

export function StatusChip({
  user,
}: {
  user: Pick<UserListItem, 'status' | 'inviteExpiresAt'>;
}) {
  const t = useTranslations('settings.users');
  return (
    <span className="inline-flex flex-col">
      <span className="text-foreground inline-flex items-center gap-2 text-sm">
        <span
          aria-hidden="true"
          className={cn(
            'size-2 shrink-0 rounded-full',
            STATUS_DOT[user.status],
          )}
        />
        {t(`status.${user.status}`)}
      </span>
      {user.status === 'INVITED' && user.inviteExpiresAt && (
        <span className="text-muted-foreground pl-4 text-xs tabular-nums">
          {t('inviteUntil', { at: new Date(user.inviteExpiresAt) })}
        </span>
      )}
    </span>
  );
}

export function MfaStatus({ mfa }: { mfa: UserListItem['mfa'] }) {
  const t = useTranslations('settings.users.mfa');
  switch (mfa.state) {
    case 'ENABLED':
      return (
        <span className="text-success-text inline-flex items-center gap-1 whitespace-nowrap">
          <Check className="size-4" aria-hidden="true" />
          {t('enabled', { count: mfa.factors })}
        </span>
      );
    case 'REQUIRED_MISSING':
      return (
        <span className="text-warning-text inline-flex items-center gap-1">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {t('requiredMissing')}
        </span>
      );
    case 'LOCKED':
      return mfa.lockedUntil ? (
        <span className="text-error-text inline-flex items-center gap-1 whitespace-nowrap">
          <Lock className="size-4" aria-hidden="true" />
          {t('locked', { at: new Date(mfa.lockedUntil) })}
        </span>
      ) : null;
    case 'OFF':
      return (
        <span className="text-muted-foreground whitespace-nowrap">
          {t('off')}
        </span>
      );
    case 'NONE':
      return <span className="text-muted-foreground">{t('none')}</span>;
  }
}
