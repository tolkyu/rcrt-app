'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { DisabledReason } from '@/components/ui/disabled-reason';

/** D63: an Admin grant is withheld until aal2, so the control stays visible and disabled with the way to verify (wireframe «V3» §4). */
export function StepUpAction({
  children,
}: {
  children: ComponentProps<typeof DisabledReason>['children'];
}) {
  const t = useTranslations('vacancies.stepUp');
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const next = search ? `${pathname}?${search}` : pathname;
  return (
    <span className="inline-flex max-w-full flex-wrap items-start gap-x-3 gap-y-1 max-md:w-full">
      <DisabledReason reason={t('reason')}>{children}</DisabledReason>
      <Link
        href={`/mfa/verify?next=${encodeURIComponent(next)}`}
        className="text-primary inline-flex min-h-11 items-center text-sm underline underline-offset-4"
      >
        {t('verify')}
      </Link>
    </span>
  );
}
