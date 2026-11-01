'use client';

import { CircleX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Inline section error with «Спробувати ще раз»; never shows technical details (UI-06). */
export function SectionError({
  onRetry,
  retrying = false,
  className,
}: {
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const t = useTranslations('states');
  const tCommon = useTranslations('common');
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 px-4 py-8 text-center',
        className,
      )}
    >
      <span className="bg-destructive-subtle flex size-12 items-center justify-center rounded-full">
        <CircleX className="text-error size-6" aria-hidden="true" />
      </span>
      <p className="text-foreground text-sm font-semibold">{t('errorTitle')}</p>
      <p className="text-muted-foreground max-w-sm text-sm">
        {t('errorDescription')}
      </p>
      <Button variant="secondary" onClick={onRetry} disabled={retrying}>
        {tCommon('retry')}
      </Button>
    </div>
  );
}
