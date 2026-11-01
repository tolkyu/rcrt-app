'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiRequest } from '@/lib/api-client';
import { redirectResponseSchema } from '@/lib/schemas/auth';
import { FormMessage } from './auth-card';

const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

/** Shared 6-digit code step for enrolment and sign-in challenges; failures are counted server-side. */
export function TotpCodeForm({
  factorId,
  next,
  children,
}: {
  factorId: string;
  next: string | null;
  children?: ReactNode;
}) {
  const t = useTranslations('auth');
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<{ code: string }>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });
  const invalid = Boolean(form.formState.errors.code);

  const submit = form.handleSubmit(async ({ code }) => {
    setFailure(null);
    try {
      const { redirectTo } = await apiRequest('/auth/mfa/verify', {
        method: 'POST',
        body: { factorId, code, ...(next ? { next } : {}) },
        schema: redirectResponseSchema,
      });
      window.location.replace(redirectTo);
    } catch (error) {
      form.resetField('code');
      form.setFocus('code');
      setFailure(
        error instanceof ApiError && error.status === 429
          ? t('mfa.locked')
          : error instanceof ApiError && error.code === 'MFA_CODE_INVALID'
            ? t('mfa.invalidCode')
            : t('genericError'),
      );
    }
  });

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {children}
      <div className="flex flex-col gap-2">
        <Label htmlFor="totp-code">{t('mfa.codeLabel')}</Label>
        <Input
          id="totp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="tracking-[0.3em] tabular-nums"
          aria-invalid={invalid ? true : undefined}
          aria-describedby="totp-code-hint"
          {...form.register('code')}
        />
        <p
          id="totp-code-hint"
          className={
            invalid
              ? 'text-error-text text-sm'
              : 'text-muted-foreground text-xs'
          }
        >
          {invalid ? t('mfa.codeInvalidFormat') : t('mfa.codeHint')}
        </p>
      </div>
      {failure ? <FormMessage tone="error">{failure}</FormMessage> : null}
      <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t('mfa.submitting') : t('mfa.submit')}
      </Button>
    </form>
  );
}
