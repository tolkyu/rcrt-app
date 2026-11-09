'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/** 2FA step-up notice with a way back to `next` after verification. */
export function MfaRequiredAlert({
  message,
  next,
}: {
  message: string;
  next: string;
}) {
  const t = useTranslations('settings.common');
  return (
    <div
      role="alert"
      className="border-warning bg-warning/10 mb-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-foreground text-sm">{message}</p>
      <Button asChild variant="outline" className="h-11 shrink-0">
        <Link href={`/mfa/verify?next=${encodeURIComponent(next)}`}>
          {t('mfaVerify')}
        </Link>
      </Button>
    </div>
  );
}
