'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect } from 'react';
import { apiRequest } from '@/lib/api-client';
import { redirectResponseSchema } from '@/lib/schemas/auth';
import { AuthCard } from './auth-card';

/** Clears the leftover session cookies of an ended session; the server already refuses it. */
export function SessionExpired() {
  const t = useTranslations('auth');
  useEffect(() => {
    apiRequest('/auth/logout', {
      method: 'POST',
      schema: redirectResponseSchema,
    }).catch(() => undefined);
  }, []);
  return (
    <AuthCard
      title={t('sessionExpired.title')}
      description={t('sessionExpired.body')}
    >
      <Link
        href="/login"
        className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-12 items-center justify-center rounded-lg px-5 text-base font-medium"
      >
        {t('sessionExpired.action')}
      </Link>
    </AuthCard>
  );
}
