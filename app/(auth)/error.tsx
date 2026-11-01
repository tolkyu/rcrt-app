'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { AuthCard, FormMessage } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';

export default function AuthError({ reset }: { reset: () => void }) {
  const t = useTranslations('auth');
  return (
    <AuthCard title={t('brand')}>
      <FormMessage tone="error">{t('genericError')}</FormMessage>
      <Button variant="secondary" onClick={reset}>
        {t('retry')}
      </Button>
      <Link href="/login" className="text-sm font-medium text-link underline-offset-4 hover:underline">
        {t('backToLogin')}
      </Link>
    </AuthCard>
  );
}
