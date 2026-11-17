'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/** Result count line and the newer/older cursor buttons under the list. */
export function VacanciesPager({
  count,
  refreshing,
  prevCursor,
  nextCursor,
  onPage,
}: {
  count: number;
  refreshing: boolean;
  prevCursor: string | null;
  nextCursor: string | null;
  onPage: (cursor: string, direction: 'older' | 'newer') => void;
}) {
  const t = useTranslations('vacancies');
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-muted-foreground text-sm">
        {refreshing
          ? t('refreshing')
          : count > 0
            ? t('shown', { count })
            : null}
      </p>
      {(prevCursor || nextCursor) && (
        <nav aria-label={t('paging')} className="flex gap-2">
          <Button
            variant="outline"
            className="h-11"
            disabled={!prevCursor || refreshing}
            onClick={() => prevCursor && onPage(prevCursor, 'newer')}
          >
            <ChevronLeft aria-hidden="true" />
            {t('newer')}
          </Button>
          <Button
            variant="outline"
            className="h-11"
            disabled={!nextCursor || refreshing}
            onClick={() => nextCursor && onPage(nextCursor, 'older')}
          >
            {t('older')}
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}
