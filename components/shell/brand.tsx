import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function BrandMark({ withWordmark = true }: { withWordmark?: boolean }) {
  const t = useTranslations('common');
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="bg-brand-fill flex size-8 shrink-0 items-center justify-center rounded-md text-base font-bold text-white"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5 fill-current"
          aria-hidden="true"
        >
          <path d="M5 4h3v6.5h8V4h3v16h-3v-6.5H8V20H5z" />
        </svg>
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
