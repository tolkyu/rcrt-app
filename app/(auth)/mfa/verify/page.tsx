import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { MfaVerifyForm } from '@/components/auth/mfa-verify-form';
import { requirePageSession } from '@/server/auth/page-guard';
import { safeNextPath } from '@/server/auth/safe-redirect';
import { authDependencies } from '@/server/services/auth/app';
import { mfaStatus } from '@/server/services/auth/mfa';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.mfa');
  return { title: t('verifyMetaTitle') };
}

export default async function MfaVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next, '');
  const ctx = await requirePageSession({ allowMfaPending: true });
  if (ctx.identity.aal === 'aal2') redirect(next || '/');
  const status = await mfaStatus(authDependencies, ctx);
  if (status.factors.length === 0)
    redirect(
      next ? `/mfa/setup?next=${encodeURIComponent(next)}` : '/mfa/setup',
    );
  return (
    <MfaVerifyForm
      factors={status.factors}
      next={next || null}
      canSkip={status.required && status.hasOtherGrants}
    />
  );
}
