'use client';

import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/** Header entry of «Вакансії» for holders of `position.manage`; the catalog page itself is the real gate. */
export function PositionsEntryLink() {
  const t = useTranslations('vacancies');
  return (
    <Button asChild variant="outline" className="h-11 md:h-10">
      <Link href="/vacancies/positions">
        <BookOpen aria-hidden="true" />
        {t('positionsEntry')}
      </Link>
    </Button>
  );
}
