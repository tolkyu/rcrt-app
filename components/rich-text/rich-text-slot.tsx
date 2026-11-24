'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RICH_TEXT_FIELD_HEIGHT } from './rich-text-height';

/** Loading state of an editor slot, at the final field height so nothing moves when the editor arrives. */
export function RichTextSkeleton() {
  const t = useTranslations('richText');
  return (
    <div
      role="status"
      className={cn('bg-surface-muted rounded-lg p-4', RICH_TEXT_FIELD_HEIGHT)}
    >
      {t('loading')}
    </div>
  );
}

/** A failed editor chunk, same height as the editor; `onRetry` asks for the chunk again. */
export function RichTextLoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('richText');
  return (
    <div
      role="alert"
      className={cn(
        'border-input rounded-lg border p-4',
        RICH_TEXT_FIELD_HEIGHT,
      )}
    >
      <p>{t('loadFailed')}</p>
      <Button variant="outline" className="mt-3 h-11 md:h-10" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  );
}
