import type { AriaAttributes, FocusEventHandler } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

type SelectAriaProps = Pick<
  AriaAttributes,
  | 'aria-label'
  | 'aria-labelledby'
  | 'aria-describedby'
  | 'aria-invalid'
  | 'aria-required'
>;

/**
 * The trigger element is replaced when the list chunk loads, so a retained ref goes stale:
 * to focus the field programmatically use `document.getElementById(id)?.focus()`.
 */
export interface SelectFieldProps extends SelectAriaProps {
  options: readonly SelectOption[];
  /** `''` selects the option whose value is `''` (e.g. «Усі»); without such an option it shows the placeholder. */
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  onBlur?: FocusEventHandler<HTMLElement>;
}

export type SelectOpenedBy = 'keyboard' | 'pointer';

/** Radix Select rejects `''` as an item value (it is reserved for the placeholder), so «no value» travels as this sentinel. */
export const EMPTY_VALUE = '__select_empty__';

/** Value of the disabled row shown when there are no options. */
export const NO_OPTIONS_VALUE = '__select_none__';

export const toInternalValue = (value: string) =>
  value === '' ? EMPTY_VALUE : value;

export const fromInternalValue = (value: string) =>
  value === EMPTY_VALUE ? '' : value;

export const findOption = (options: readonly SelectOption[], value: string) =>
  options.find((option) => option.value === value);

/** A value that is not among the options (e.g. a vertical the user lost access to) must never render as an empty field. */
export const isStaleValue = (options: readonly SelectOption[], value: string) =>
  value !== '' && !findOption(options, value);

export const triggerClass =
  'border-input bg-surface text-foreground data-placeholder:text-muted-foreground disabled:bg-surface-muted disabled:text-muted-foreground-strong aria-invalid:border-error flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 text-start text-base transition-colors duration-120 disabled:cursor-not-allowed md:h-10 md:text-sm';

export const valueClass = 'min-w-0 flex-1 truncate';
