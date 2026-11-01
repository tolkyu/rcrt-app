'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, apiRequest } from '@/lib/api-client';
import { redirectResponseSchema } from '@/lib/schemas/auth';
import { AuthCard, FormMessage, Spinner } from './auth-card';
import { takeNextPath } from './next-path';
import { useFragmentToken } from './use-fragment-token';

const TOKEN_HASH = /^(pkce_)?[a-f0-9]{56}$/;

type State = 'ready' | 'submitting' | 'invalid' | 'limited' | 'error';

export function ConfirmForm() {
  const t = useTranslations('auth');
  const [state, setState] = useState<State>('ready');
  const credential = useFragmentToken('token_hash', TOKEN_HASH, true);
  const tokenHash = credential.token;

  const confirm = async () => {
    if (!tokenHash) return;
    setState('submitting');
    try {
      const { redirectTo } = await apiRequest('/auth/confirm', {
        method: 'POST',
        body: { token_hash: tokenHash, next: takeNextPath() },
        schema: redirectResponseSchema,
      });
      window.location.replace(redirectTo);
    } catch (error) {
      setState(
        error instanceof ApiError && error.status === 429
          ? 'limited'
          : error instanceof ApiError && error.status === 401
            ? 'invalid'
            : 'error',
      );
    }
  };

  if (!credential.ready)
    return (
      <AuthCard title={t('confirm.title')}>
        <Spinner label={t('loading')} />
      </AuthCard>
    );

  if (!tokenHash || state === 'invalid') {
    return (
      <AuthCard title={t('confirm.title')}>
        <FormMessage tone="error">
          {!tokenHash ? t('confirm.missing') : t('confirm.invalid')}
        </FormMessage>
        <Link
          href="/login"
          className="text-link text-sm font-medium underline-offset-4 hover:underline"
        >
          {t('backToLogin')}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('confirm.title')} description={t('confirm.body')}>
      {state === 'error' || state === 'limited' ? (
        <FormMessage tone="error">
          {state === 'limited' ? t('rateLimited') : t('genericError')}
        </FormMessage>
      ) : null}
      <Button size="lg" onClick={confirm} disabled={state === 'submitting'}>
        {state === 'submitting' ? t('confirm.submitting') : t('confirm.submit')}
      </Button>
    </AuthCard>
  );
}
