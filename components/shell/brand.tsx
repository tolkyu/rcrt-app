import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function BrandMark({ withWordmark = true }: { withWordmark?: boolean }) {
  const t = useTranslations('common');
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="bg-brand flex size-8 shrink-0 items-center justify-center rounded-md text-base font-bold text-white"
      >
        {t('logoLetter')}
      </span>
      <span
        className={cn(
          'text-heading-lg text-foreground truncate font-bold tracking-tight',
          !withWordmark && 'sr-only',
        )}
      >
        {t('appName')}
      </span>
    </span>
  );
}
