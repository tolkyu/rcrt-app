import { useTranslations } from 'next-intl';
import type { MessageKey } from '@/lib/i18n/message-key';
import { cn } from '@/lib/utils';
import { FormPageFooter, FormPageHeading } from './form-page-frame';
import { FormRailLayout } from './form-rail';
import { Skeleton } from './skeleton';

/** `min-w` and not `w`: an empty flex item has no content width, so only a minimum makes the phone footer wrap like the real buttons. Widths are the measured natural widths of «Скасувати», «Зберегти чернетку», «Створити вакансію»: coarser steps wrap differently at 320 px. */
const BUTTON_WIDTHS = [
  'min-w-[6.16rem]',
  'min-w-[9.85rem]',
  'min-w-[9.86rem]',
] as const;

type FieldKind = 'input' | 'textarea' | 'segmented';
/** Real translated copy sizes wrapped hints without viewport-specific line-count guesses. */
export interface FormSkeletonTextHint {
  message: MessageKey;
  values?: Record<string, number>;
}
export type FormSkeletonHint = boolean | number | FormSkeletonTextHint;
/** `hint` reserves the helper text under the control as the real field wraps it; `true` is one line. */
export type FormSkeletonField =
  FieldKind | { kind: FieldKind; hint?: FormSkeletonHint };
/** Helper text without a field: `railHidden` for a line the rail replaces when it is shown. */
export interface FormSkeletonNote {
  note: FormSkeletonHint;
  railHidden?: boolean;
}
/** A fieldset: legend bar, three fields (two columns on a phone with the third below, three from md) and one shared hint. */
export interface FormSkeletonTrio {
  trio: readonly [FormSkeletonField, FormSkeletonField, FormSkeletonField];
  hint?: FormSkeletonHint;
}
/** `'group'` draws a group heading bar; an array is one grid row (side by side from md, stacked below). */
export type FormSkeletonRow =
  | 'group'
  | FormSkeletonField
  | readonly FormSkeletonField[]
  | FormSkeletonNote
  | FormSkeletonTrio;

const CONTROL_CLASS: Record<FieldKind, string> = {
  input: 'h-11 w-full rounded-lg md:h-10',
  textarea: 'h-[calc(3lh+1.5rem+2px)] w-full rounded-lg text-base md:text-sm',
  // Radio group chrome: 1 px border + 4 px padding around a 44 / 40 px segment.
  segmented: 'h-[3.375rem] w-full rounded-xl md:h-[3.125rem]',
};

/** Static class names: Tailwind cannot generate a class from an interpolated column count. */
const COLUMNS: Readonly<Record<number, string | undefined>> = {
  1: 'md:grid-cols-2',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
};

const isGridRow = (row: FormSkeletonRow): row is readonly FormSkeletonField[] =>
  Array.isArray(row);

const isNote = (row: FormSkeletonRow): row is FormSkeletonNote =>
  typeof row === 'object' && 'note' in row;

const isTrio = (row: FormSkeletonRow): row is FormSkeletonTrio =>
  typeof row === 'object' && 'trio' in row;

const hintLines = (
  hint: Exclude<FormSkeletonHint, FormSkeletonTextHint> | undefined,
) => (typeof hint === 'number' ? hint : hint ? 1 : 0);

/** Helper text lines as the real field wraps them; `margin` is the gap to the control above. */
function LinesSkeleton({
  hint,
  className,
}: {
  hint: FormSkeletonHint | undefined;
  className?: string;
}) {
  const t = useTranslations();
  if (typeof hint === 'object' && 'message' in hint) {
    return (
      <div
        data-slot="form-hint-skeleton"
        aria-hidden="true"
        className={cn('relative text-xs', className)}
      >
        <span className="invisible">{t(hint.message, hint.values)}</span>
        <Skeleton
          className="absolute inset-y-0 left-0 w-48 max-w-full rounded-none"
          style={{
            maskImage:
              'repeating-linear-gradient(to bottom, transparent 0 2px, #000 2px 14px, transparent 14px 16px)',
          }}
        />
      </div>
    );
  }
  const lines = hintLines(hint);
  if (lines === 0) return null;
  return (
    <div
      data-slot="form-hint-skeleton"
      className={cn('flex flex-col', className)}
    >
      {Array.from({ length: lines }, (_, line) => (
        <div
          key={line}
          data-slot="form-hint-line-skeleton"
          className="flex h-4 items-center"
        >
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>
      ))}
    </div>
  );
}

function LabelSkeleton() {
  return (
    <div className="mb-1.5 flex h-5 items-center">
      <Skeleton className="h-3.5 w-32" />
    </div>
  );
}

function FieldSkeleton({
  field,
  className,
}: {
  field: FormSkeletonField;
  className?: string;
}) {
  const { kind, hint } =
    typeof field === 'string' ? { kind: field, hint: false } : field;
  return (
    <div
      data-slot="form-field-skeleton"
      aria-hidden="true"
      className={cn('flex min-w-0 flex-col', className)}
    >
      <LabelSkeleton />
      <Skeleton data-slot="control-skeleton" className={CONTROL_CLASS[kind]} />
      <LinesSkeleton hint={hint} className="mt-1.5" />
    </div>
  );
}

function TrioSkeleton({ row }: { row: FormSkeletonTrio }) {
  return (
    <div data-slot="form-trio-skeleton" aria-hidden="true">
      <LabelSkeleton />
      <div className="grid grid-cols-2 items-start gap-6 md:grid-cols-3">
        {row.trio.map((field, cell) => (
          <FieldSkeleton
            key={cell}
            field={field}
            className={cell === 2 ? 'col-span-2 md:col-span-1' : undefined}
          />
        ))}
      </div>
      <LinesSkeleton hint={row.hint} className="mt-1.5" />
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
  rail,
}: {
  title: string;
  subtitle?: string;
  back: { href: string; label: string };
  fields: readonly FormSkeletonRow[];
  /** Reserves the side rail of a form page that has one (shown only where the real rail is). */
  rail?: boolean;
}) {
  const t = useTranslations('states');
  const rows = fields.map((row, index) => {
    if (row === 'group') return <GroupSkeleton key={index} />;
    if (isTrio(row)) return <TrioSkeleton key={index} row={row} />;
    if (isNote(row))
      return (
        <div
          key={index}
          data-slot="form-note-skeleton"
          aria-hidden="true"
          className={row.railHidden ? '@min-[67rem]:hidden' : undefined}
        >
          <LinesSkeleton hint={row.note} />
        </div>
      );
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
  });
  return (
    <>
      <FormPageHeading title={title} subtitle={subtitle} back={back} />
      <div
        role="status"
        data-slot="form-skeleton"
        className="skeleton-delayed flex flex-col gap-6"
      >
        <span className="sr-only">{t('loading')}</span>
        {rail ? (
          <FormRailLayout
            rail={<Skeleton className="h-72 w-full rounded-xl" />}
          >
            {rows}
          </FormRailLayout>
        ) : (
          rows
        )}
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
