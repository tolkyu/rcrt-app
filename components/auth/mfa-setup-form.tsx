'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api-client';
import {
  mfaEnrollResponseSchema,
  type MfaEnrollment,
} from '@/lib/schemas/auth';
import { AuthCard, FormMessage, Spinner } from './auth-card';
import { TotpCodeForm } from './totp-code-form';

type Mode = 'required' | 'backup' | 'optional';
const TITLES = {
  required: 'setupTitle',
  backup: 'secondTitle',
  optional: 'optionalTitle',
} as const;
const INTROS = {
  required: 'setupIntro',
  backup: 'secondIntro',
  optional: 'optionalIntro',
} as const;

/** The QR code and secret exist only in this component's memory; nothing is stored or logged (T4-F08). */
export function MfaSetupForm({
  mode,
  next,
  canSkip,
}: {
  mode: Mode;
  next: string | null;
  canSkip: boolean;
}) {
  const t = useTranslations('auth');
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [failed, setFailed] = useState(false);

  const enroll = useCallback(async () => {
    setFailed(false);
    try {
      setEnrollment(
        await apiRequest('/auth/mfa/enroll', {
          method: 'POST',
          schema: mfaEnrollResponseSchema,
        }),
      );
    } catch {
      setFailed(true);
    }
  }, []);

  // Each enrolment replaces the previous unverified factor, so Strict Mode's double effect must not enrol twice.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void enroll();
  }, [enroll]);

  return (
    <AuthCard
      title={t(`mfa.${TITLES[mode]}`)}
      description={t(`mfa.${INTROS[mode]}`)}
    >
      {failed ? (
        <>
          <FormMessage tone="error">{t('mfa.enrollFailed')}</FormMessage>
          <Button variant="secondary" onClick={enroll}>
            {t('retry')}
          </Button>
        </>
      ) : !enrollment ? (
        <Spinner label={t('mfa.preparing')} />
      ) : (
        <TotpCodeForm factorId={enrollment.factorId} next={next}>
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR as an SVG data URI, which next/image cannot serve; white backing keeps it scannable in dark mode. */}
            <img
              src={enrollment.qrCode}
              alt={t('mfa.qrAlt')}
              width={192}
              height={192}
              className="border-border rounded-lg border bg-white p-2"
            />
            <div className="flex w-full flex-col gap-1 text-center">
              <span className="text-muted-foreground text-xs">
                {t('mfa.secretLabel')}
              </span>
              <code className="bg-surface-muted text-foreground rounded-md px-2 py-1 font-mono text-sm break-all select-all">
                {enrollment.secret}
              </code>
            </div>
          </div>
        </TotpCodeForm>
      )}
      {canSkip ? (
        <Link
          href="/"
          className="text-link text-sm font-medium underline-offset-4 hover:underline"
        >
          {t('mfa.skip')}
        </Link>
      ) : null}
    </AuthCard>
  );
}
