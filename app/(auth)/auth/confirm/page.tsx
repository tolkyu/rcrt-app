import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ConfirmForm } from '@/components/auth/confirm-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.confirm');
  return { title: t('metaTitle') };
}

/** Never consumes the link on GET; the token is read client-side from the fragment (DG-07, T4-C05). */
export default function ConfirmPage() {
  return <ConfirmForm />;
}
