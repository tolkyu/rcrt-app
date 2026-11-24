import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DevLoginList } from '@/components/auth/dev-login-list';
import { devLoginAvailable, listDevUsers } from '@/server/dev/dev-login';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.devLogin');
  return { title: t('metaTitle') };
}

/** DEV-1: exists only in `next dev` (`.dev.tsx` page extension), lists seeded @demo users only. */
export default async function DevLoginPage() {
  if (!devLoginAvailable()) notFound();
  return <DevLoginList users={await listDevUsers()} />;
}
