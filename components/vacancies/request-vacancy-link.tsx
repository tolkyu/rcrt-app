'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/** A real link like `CreateVacancyLink`; outline where the user also has the full create action (D35). */
export function RequestVacancyLink({
  className,
  secondary = false,
}: {
  className?: string;
  secondary?: boolean;
}) {
  const t = useTranslations('vacancies');
  return (
    <Button
      asChild
      variant={secondary ? 'outline' : 'default'}
      className={className}
    >
      <Link href="/vacancies/request">
        <Plus aria-hidden="true" />
        {t('requestLink')}
      </Link>
    </Button>
  );
}
