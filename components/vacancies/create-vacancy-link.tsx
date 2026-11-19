'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/** A real link (new tab, instant client navigation); never disabled, the 50-draft limit only blocks saving a draft inside the form. */
export function CreateVacancyLink({ className }: { className?: string }) {
  const t = useTranslations('vacancies.draft');
  return (
    <Button asChild className={className}>
      <Link href="/vacancies/new">
        <Plus aria-hidden="true" />
        {t('create')}
      </Link>
    </Button>
  );
}
