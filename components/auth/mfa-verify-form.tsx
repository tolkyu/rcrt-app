'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { AuthCard } from './auth-card';
import { TotpCodeForm } from './totp-code-form';

export function MfaVerifyForm({
  factors,
  next,
  canSkip,
}: {
  factors: { id: string; name: string | null }[];
  next: string | null;
  canSkip: boolean;
}) {
  const t = useTranslations('auth');
  const [factorId, setFactorId] = useState(factors[0]!.id);
  return (
    <AuthCard title={t('mfa.verifyTitle')} description={t('mfa.verifyIntro')}>
      <TotpCodeForm factorId={factorId} next={next}>
        {factors.length > 1 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="totp-factor">{t('mfa.factorLabel')}</Label>
            <select
              id="totp-factor"
              value={factorId}
              onChange={(event) => setFactorId(event.target.value)}
              className="border-input bg-surface text-foreground h-11 rounded-lg border px-3 text-base md:h-10 md:text-sm"
            >
              {factors.map((factor, index) => (
                <option key={factor.id} value={factor.id}>
                  {factor.name ?? t('mfa.factorFallback', { index: index + 1 })}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </TotpCodeForm>
      <p className="text-muted-foreground text-xs">{t('mfa.lostDevice')}</p>
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
