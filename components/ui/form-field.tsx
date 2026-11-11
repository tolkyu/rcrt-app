'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Counter } from './counter';
import { Label } from './label';

/** Spread onto the control: `<Input {...control} />`; with react-hook-form add `{...register(name)}` after it. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  'aria-labelledby'?: string;
}

const labelClass = 'text-foreground text-sm font-medium';

/**
 * Label, hint, error and counter around one control. `id` is explicit (never `useId`: a streamed page can hydrate a
 * different value and break `<label for>`). The error container is always mounted so the polite live region announces
 * text that appears later; render `error` only once it should be heard (after blur or submit).
 * Client component with a render-prop child: it cannot be used from a Server Component. `announce={false}` silences the live region (after a failed submit the summary speaks once) while keeping `aria-describedby`.
 * `layout`: `stacked` label above, `inline` label after a checkbox, `group` for radio groups and segmented controls.
 */
export function FormField({
  id,
  label,
  required,
  hint,
  error,
  counter,
  layout = 'stacked',
  announce = true,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  counter?: { count: number; max: number };
  layout?: 'stacked' | 'inline' | 'group';
  announce?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}) {
  const t = useTranslations('form');
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const counterId = `${id}-counter`;
  const describedBy =
    [error && errorId, hint && hintId, counter && counterId]
      .filter(Boolean)
      .join(' ') || undefined;
  const control = children({
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required ? true : undefined,
    'aria-labelledby': layout === 'group' ? labelId : undefined,
  });
  const text = (
    <>
      {label}
      {required && (
        <>
          {' '}
          <span aria-hidden="true" className="text-error-text">
            {t('requiredMark')}
          </span>
          <span className="sr-only">{t('required')}</span>
        </>
      )}
    </>
  );
  return (
    <div data-slot="form-field" className={cn('flex flex-col', className)}>
      {layout === 'inline' ? (
        <div className="flex min-h-11 items-center gap-3">
          {control}
          <Label htmlFor={id}>{text}</Label>
        </div>
      ) : (
        <>
          {layout === 'group' ? (
            <span id={labelId} className={cn(labelClass, 'mb-1.5')}>
              {text}
            </span>
          ) : (
            <Label htmlFor={id} className="mb-1.5">
              {text}
            </Label>
          )}
          {control}
        </>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div aria-live={announce ? 'polite' : 'off'}>
            {error && (
              <p id={errorId} className="text-error-text mt-1.5 text-sm">
                {error}
              </p>
            )}
          </div>
          {hint && (
            <p id={hintId} className="text-muted-foreground mt-1.5 text-xs">
              {hint}
            </p>
          )}
        </div>
        {counter && (
          <Counter
            id={counterId}
            count={counter.count}
            max={counter.max}
            className="mt-1.5 shrink-0"
          />
        )}
      </div>
    </div>
  );
}
