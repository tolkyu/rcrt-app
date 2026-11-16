import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { FormPageFooter, FormPageHeading } from './form-page-frame';
import { Skeleton } from './skeleton';

/** `min-w` and not `w`: an empty flex item has no content width, so only a minimum makes the phone footer wrap like the real buttons. */
const BUTTON_WIDTHS = ['min-w-24', 'min-w-36', 'min-w-40'] as const;

type FieldKind = 'input' | 'textarea' | 'segmented';
/** `hint` reserves the one-line helper text under the control, as the real field has it. */
export type FormSkeletonField = FieldKind | { kind: FieldKind; hint?: boolean };
/** `'group'` draws a group heading bar; an array is one grid row (side by side from md, stacked below). */
export type FormSkeletonRow =
  'group' | FormSkeletonField | readonly FormSkeletonField[];

const CONTROL_CLASS: Record<FieldKind, string> = {
  input: 'h-11 w-full rounded-lg md:h-10',
  textarea: 'h-[calc(3lh+1.5rem+2px)] w-full rounded-lg text-base md:text-sm',
  // Radio group chrome: 1 px border + 4 px padding around a 44 / 40 px segment.
  segmented: 'h-[3.375rem] w-full rounded-xl md:h-[3.125rem]',
};

/** Static class names: Tailwind cannot generate a class from an interpolated column count. */
const COLUMNS: Readonly<Record<number, string | undefined>> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
};

const isGridRow = (row: FormSkeletonRow): row is readonly FormSkeletonField[] =>
  Array.isArray(row);

function FieldSkeleton({ field }: { field: FormSkeletonField }) {
  const { kind, hint } =
    typeof field === 'string' ? { kind: field, hint: false } : field;
  return (
    <div
      data-slot="form-field-skeleton"
      aria-hidden="true"
      className="flex min-w-0 flex-col"
    >
      <div className="mb-1.5 flex h-5 items-center">
        <Skeleton className="h-3.5 w-32" />
      </div>
      <Skeleton data-slot="control-skeleton" className={CONTROL_CLASS[kind]} />
      {hint && (
        <div
          data-slot="form-hint-skeleton"
          className="mt-1.5 flex h-4 items-center"
        >
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>
      )}
    </div>
  );
}

function GroupSkeleton() {
  return (
    <div
      data-slot="form-group-skeleton"
      aria-hidden="true"
      className="border-border border-b pb-2"
    >
      <div className="flex h-6 items-center">
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

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
  fields: readonly FormSkeletonRow[];
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
        {fields.map((row, index) => {
          if (row === 'group') return <GroupSkeleton key={index} />;
          if (!isGridRow(row)) return <FieldSkeleton key={index} field={row} />;
          return (
            <div
              key={index}
              className={cn('grid items-start gap-6', COLUMNS[row.length])}
            >
              {row.map((field, cell) => (
                <FieldSkeleton key={cell} field={field} />
              ))}
            </div>
          );
        })}
        <FormPageFooter>
          {BUTTON_WIDTHS.map((width) => (
            <Skeleton
              key={width}
              className={cn('h-11 rounded-lg md:h-10', width)}
            />
          ))}
        </FormPageFooter>
      </div>
    </>
  );
}
