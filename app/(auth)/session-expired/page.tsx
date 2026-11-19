import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SessionExpired } from '@/components/auth/session-expired';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.sessionExpired');
  return { title: t('metaTitle') };
}

export default function SessionExpiredPage() {
  return <SessionExpired />;
}
