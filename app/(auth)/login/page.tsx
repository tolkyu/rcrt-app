import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/auth/login-form';
import { googleSignInEnabled } from '@/server/auth/config';
import { safeNextPath } from '@/server/auth/safe-redirect';

const REASONS = [
  'link_invalid',
  'google_mismatch',
  'google_failed',
  'deactivated',
  'signed_out',
] as const;
type Reason = (typeof REASONS)[number];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');
  return { title: t('metaTitle') };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  const params = await searchParams;
  const reason = REASONS.find((value) => value === params.reason) ?? null;
  return (
    <LoginForm
      googleEnabled={googleSignInEnabled()}
      reason={reason satisfies Reason | null}
      next={safeNextPath(params.next, '') || null}
    />
  );
}
