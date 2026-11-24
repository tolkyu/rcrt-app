import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { MfaSetupForm } from '@/components/auth/mfa-setup-form';
import { requirePageSession } from '@/server/auth/page-guard';
import { safeNextPath } from '@/server/auth/safe-redirect';
import { authDependencies } from '@/server/services/auth/app';
import { mfaStatus } from '@/server/services/auth/mfa';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.mfa');
  return { title: t('setupMetaTitle') };
}

export default async function MfaSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next, '');
  const ctx = await requirePageSession({ allowMfaPending: true });
  const status = await mfaStatus(authDependencies, ctx);
  // With a device already enrolled, a new one may only be added from an aal2 session (T4-F03).
  if (status.factors.length > 0 && status.aal !== 'aal2')
    redirect(
      next ? `/mfa/verify?next=${encodeURIComponent(next)}` : '/mfa/verify',
    );
  if (!status.canAddFactor) redirect(next || '/');
  const mode =
    status.factors.length > 0
      ? 'backup'
      : status.required
        ? 'required'
        : 'optional';
  return (
    <MfaSetupForm
      mode={mode}
      next={next || null}
      canSkip={mode === 'required' && status.hasOtherGrants}
    />
  );
}
