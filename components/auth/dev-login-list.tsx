'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { useRoleLabel } from './use-role-label';
import { AuthCard, FormMessage } from './auth-card';

const responseSchema = z.object({ redirectTo: z.string() });

export function DevLoginList({
  users,
}: {
  users: {
    email: string;
    fullName: string;
    roles: { role: string; vertical: string | null }[];
  }[];
}) {
  const t = useTranslations('auth');
  const roleLabel = useRoleLabel();
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const signIn = async (email: string) => {
    setPending(email);
    setFailed(false);
    const response = await fetch('/api/dev/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const parsed = response?.ok
      ? responseSchema.safeParse(await response.json())
      : null;
    if (parsed?.success) {
      window.location.replace(parsed.data.redirectTo);
      return;
    }
    setPending(null);
    setFailed(true);
  };

  return (
    <AuthCard title={t('devLogin.title')}>
      <FormMessage tone="info">{t('devLogin.warning')}</FormMessage>
      {failed ? (
        <FormMessage tone="error">{t('devLogin.failed')}</FormMessage>
      ) : null}
      {users.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('devLogin.empty')}</p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {users.map((user) => (
            <li
              key={user.email}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-foreground truncate text-sm font-medium">
                  {user.fullName}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
                <span className="text-muted-foreground-strong text-xs">
                  {user.roles
                    .map(({ role, vertical }) => roleLabel(role, vertical))
                    .join(', ')}
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending !== null}
                onClick={() => signIn(user.email)}
                aria-label={`${t('devLogin.signIn')}: ${user.fullName}`}
              >
                {pending === user.email
                  ? t('devLogin.signingIn')
                  : t('devLogin.signIn')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </AuthCard>
  );
}
