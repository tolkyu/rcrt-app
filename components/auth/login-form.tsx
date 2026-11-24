'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiRequest } from '@/lib/api-client';
import { AuthCard, FormMessage } from './auth-card';
import { GoogleMark } from './google-mark';
import { loginFallback } from './fallback-validation';
import { lazyValidation, useWarmOnIdle } from './lazy-resolver';
import type { LoginValues } from './login-validation';
import { rememberNextPath } from './next-path';

type Reason =
  | 'link_invalid'
  | 'google_mismatch'
  | 'google_failed'
  | 'deactivated'
  | 'signed_out';

const loadValidation = () => import('./login-validation');
const { resolver, warm } = lazyValidation<LoginValues>(
  async () => (await loadValidation()).loginResolver,
  loginFallback,
);
const magicLinkSchema = async () =>
  (await loadValidation()).magicLinkResponseSchema;
const oauthStartSchema = async () =>
  (await loadValidation()).oauthStartResponseSchema;

export function LoginForm({
  googleEnabled,
  reason,
  next,
}: {
  googleEnabled: boolean;
  reason: Reason | null;
  next: string | null;
}) {
  const t = useTranslations('auth');
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [googlePending, setGooglePending] = useState(false);
  useWarmOnIdle(warm);
  const form = useForm<LoginValues>({
    resolver,
    defaultValues: { email: '' },
  });
  const emailError = form.formState.errors.email?.message;

  const describe = (error: unknown) =>
    error instanceof ApiError && error.status === 429
      ? t('rateLimited')
      : error instanceof ApiError && error.code === 'AUTH_EMAIL_DELIVERY_FAILED'
        ? t('login.sendFailed')
        : t('genericError');

  const submit = form.handleSubmit(async ({ email }) => {
    setFailure(null);
    rememberNextPath(next);
    try {
      await apiRequest('/auth/magic-link', {
        method: 'POST',
        body: { email },
        schema: magicLinkSchema,
      });
      setSent(true);
    } catch (error) {
      setFailure(describe(error));
    }
  });

  const startGoogle = async () => {
    setFailure(null);
    setGooglePending(true);
    try {
      const { url } = await apiRequest('/auth/google', {
        method: 'POST',
        schema: oauthStartSchema,
      });
      window.location.assign(url);
    } catch (error) {
      setGooglePending(false);
      setFailure(describe(error));
    }
  };

  if (sent) {
    return (
      <AuthCard title={t('login.sentTitle')} description={t('login.sentBody')}>
        <Button
          variant="outline"
          onClick={() => {
            setSent(false);
            form.reset();
          }}
        >
          {t('login.sentAnother')}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('login.title')} description={t('login.subtitle')}>
      {reason ? (
        <FormMessage tone={reason === 'signed_out' ? 'info' : 'error'}>
          {t(`login.reasons.${reason}`)}
        </FormMessage>
      ) : null}
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="login-email">{t('login.emailLabel')}</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={t('login.emailPlaceholder')}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? 'login-email-error' : undefined}
            onFocus={warm}
            {...form.register('email')}
          />
          {emailError ? (
            <p id="login-email-error" className="text-error-text text-sm">
              {emailError === 'required'
                ? t('login.emailRequired')
                : t('login.emailInvalid')}
            </p>
          ) : null}
        </div>
        {failure ? <FormMessage tone="error">{failure}</FormMessage> : null}
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? t('login.submitting')
            : t('login.submit')}
        </Button>
      </form>
      {googleEnabled ? (
        <>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" aria-hidden="true" />
            {t('login.divider')}
            <span className="bg-border h-px flex-1" aria-hidden="true" />
          </div>
          <Button
            variant="outline"
            size="lg"
            onClick={startGoogle}
            disabled={googlePending}
          >
            <GoogleMark />
            {googlePending ? t('login.googleStarting') : t('login.google')}
          </Button>
        </>
      ) : null}
    </AuthCard>
  );
}
