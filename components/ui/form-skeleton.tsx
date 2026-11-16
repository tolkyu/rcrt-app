import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { FormPageFooter, FormPageHeading } from './form-page-frame';
import { Skeleton } from './skeleton';

/** `min-w` and not `w`: an empty flex item has no content width, so only a minimum makes the phone footer wrap like the real buttons. */
const BUTTON_WIDTHS = ['min-w-24', 'min-w-36', 'min-w-40'] as const;

/** Loading twin of `FormPageLayout` (G20): real heading, final-height field boxes and the same footer wrapping. */
export function FormSkeleton({
  title,
  subtitle,
  back,
  fields,
}: {
  title: string;
  subtitle?: string;
  back: { href: string; label: string };
  fields: readonly ('input' | 'textarea')[];
}) {
  const t = useTranslations('states');
  return (
    <>
      <FormPageHeading title={title} subtitle={subtitle} back={back} />
      <div
        role="status"
        data-slot="form-skeleton"
        className="skeleton-delayed flex flex-col gap-6"
      >
        <span className="sr-only">{t('loading')}</span>
        {fields.map((kind, index) => (
          <div
            key={index}
            data-slot="form-field-skeleton"
            aria-hidden="true"
            className="flex flex-col"
          >
            <div className="mb-1.5 flex h-5 items-center">
              <Skeleton className="h-3.5 w-32" />
            </div>
            <Skeleton
              data-slot="control-skeleton"
              className={
                kind === 'input'
                  ? 'h-11 w-full rounded-lg md:h-10'
                  : 'h-[calc(3lh+1.5rem+2px)] w-full rounded-lg text-base md:text-sm'
              }
            />
          </div>
        ))}
        <FormPageFooter>
          {BUTTON_WIDTHS.map((width) => (
            <Skeleton key={width} className={cn('h-10 rounded-lg', width)} />
          ))}
        </FormPageFooter>
      </div>
    </>
  );
}
