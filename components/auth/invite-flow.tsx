'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, apiRequest } from '@/lib/api-client';
import {
  inviteInspectResponseSchema,
  oauthStartResponseSchema,
  redirectResponseSchema,
  type InviteInspection,
} from '@/lib/schemas/auth';
import { useRoleLabel } from './use-role-label';
import { AuthCard, FormMessage, Spinner } from './auth-card';
import { useFragmentToken } from './use-fragment-token';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

type View =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'error'; retry: () => void }
  | {
      kind: 'valid';
      token: string;
      invite: Extract<InviteInspection, { state: 'VALID' }>;
    };

export function InviteFlow({ googleEnabled }: { googleEnabled: boolean }) {
  const t = useTranslations('auth');
  const roleLabel = useRoleLabel();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [pending, setPending] = useState<'accept' | 'google' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const credential = useFragmentToken('t', TOKEN);

  useEffect(() => {
    const token = credential.token;
    if (!credential.ready || !token) return;
    let active = true;
    const inspect = async () => {
      try {
        const invite = await apiRequest('/auth/invites/inspect', {
          method: 'POST',
          body: { token },
          schema: inviteInspectResponseSchema,
        });
        if (!active) return;
        setView(
          invite.state === 'VALID'
            ? { kind: 'valid', token, invite }
            : { kind: 'invalid' },
        );
      } catch {
        if (active)
          setView({
            kind: 'error',
            retry: () => {
              setView({ kind: 'loading' });
              void inspect();
            },
          });
      }
    };
    void inspect();
    return () => {
      active = false;
    };
  }, [credential.ready, credential.token]);

  const failed = (error: unknown) => {
    setPending(null);
    if (error instanceof ApiError && error.code === 'INVITE_INVALID')
      setView({ kind: 'invalid' });
    else
      setFailure(
        error instanceof ApiError && error.status === 429
          ? t('rateLimited')
          : t('genericError'),
      );
  };

  const accept = async (token: string) => {
    setFailure(null);
    setPending('accept');
    try {
      const { redirectTo } = await apiRequest('/auth/invites/accept', {
        method: 'POST',
        body: { token },
        schema: redirectResponseSchema,
      });
      window.location.replace(redirectTo);
    } catch (error) {
      failed(error);
    }
  };

  const acceptWithGoogle = async (token: string) => {
    setFailure(null);
    setPending('google');
    try {
      const { url } = await apiRequest('/auth/invites/google', {
        method: 'POST',
        body: { token },
        schema: oauthStartResponseSchema,
      });
      window.location.assign(url);
    } catch (error) {
      failed(error);
    }
  };

  if (!credential.ready)
    return (
      <AuthCard title={t('invite.title')}>
        <Spinner label={t('invite.checking')} />
      </AuthCard>
    );
  if (!credential.token || view.kind === 'missing' || view.kind === 'invalid')
    return (
      <AuthCard title={t('invite.invalidTitle')}>
        <FormMessage tone="error">
          {!credential.token || view.kind === 'missing'
            ? t('invite.missing')
            : t('invite.invalid')}
        </FormMessage>
      </AuthCard>
    );
  if (view.kind === 'error')
    return (
      <AuthCard title={t('invite.title')}>
        <FormMessage tone="error">{t('genericError')}</FormMessage>
        <Button variant="secondary" onClick={view.retry}>
          {t('retry')}
        </Button>
      </AuthCard>
    );

  if (view.kind === 'loading')
    return (
      <AuthCard title={t('invite.title')}>
        <Spinner label={t('invite.checking')} />
      </AuthCard>
    );

  const { invite, token } = view;
  return (
    <AuthCard title={t('invite.title')} description={t('invite.intro')}>
      <dl className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{t('invite.nameLabel')}</dt>
          <dd className="text-foreground font-medium">{invite.fullName}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{t('invite.emailLabel')}</dt>
          <dd className="text-foreground font-medium [overflow-wrap:anywhere]">
            {invite.email}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t('invite.rolesLabel')}</dt>
          <dd>
            <ul className="flex flex-wrap gap-2">
              {invite.roles.map(({ role, vertical }) => (
                <li
                  key={`${role}-${vertical ?? ''}`}
                  className="bg-primary-subtle text-link rounded-full px-3 py-1 text-xs font-medium"
                >
                  {roleLabel(role, vertical)}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      {failure ? <FormMessage tone="error">{failure}</FormMessage> : null}
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          onClick={() => accept(token)}
          disabled={pending !== null}
        >
          {pending === 'accept' ? t('invite.accepting') : t('invite.accept')}
        </Button>
        {googleEnabled ? (
          <>
            <Button
              variant="outline"
              size="lg"
              onClick={() => acceptWithGoogle(token)}
              disabled={pending !== null}
            >
              {pending === 'google'
                ? t('login.googleStarting')
                : t('invite.acceptGoogle')}
            </Button>
            <p className="text-muted-foreground text-xs">
              {t('invite.googleHint')}
            </p>
          </>
        ) : null}
      </div>
    </AuthCard>
  );
}
