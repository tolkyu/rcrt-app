'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiRequest } from '@/lib/api-client';
import {
  magicLinkResponseSchema,
  oauthStartResponseSchema,
} from '@/lib/schemas/auth';
import { AuthCard, FormMessage } from './auth-card';
import { rememberNextPath } from './next-path';

type Reason =
  | 'link_invalid'
  | 'google_mismatch'
  | 'google_failed'
  | 'deactivated'
  | 'signed_out';

const formSchema = z.object({
  email: z.string().trim().min(1, 'required').pipe(z.email('invalid')),
});
type FormValues = z.infer<typeof formSchema>;

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
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
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
        schema: magicLinkResponseSchema,
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
        schema: oauthStartResponseSchema,
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
            {googlePending ? t('login.googleStarting') : t('login.google')}
          </Button>
        </>
      ) : null}
    </AuthCard>
  );
}
