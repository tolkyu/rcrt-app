import type { AriaAttributes, FocusEventHandler } from 'react';
import { normalizeApostrophes } from '@/lib/apostrophes';

export interface ComboboxOption {
  /** `''` is reserved for «no selection». */
  value: string;
  label: string;
  /** Secondary line, e.g. «Гемблінг · П0»; it is searched too, so duplicate names can be told apart. */
  description?: string;
  /** Shows the initials of `label` in an avatar. */
  avatar?: boolean;
  disabled?: boolean;
  /** Display only («неактивний» badge); set `disabled` as well to forbid choosing the option. */
  inactive?: boolean;
}

type ComboboxAriaProps = Pick<
  AriaAttributes,
  | 'aria-label'
  | 'aria-labelledby'
  | 'aria-describedby'
  | 'aria-invalid'
  | 'aria-required'
>;

interface ComboboxBaseProps extends ComboboxAriaProps {
  /** `''` means nothing is selected. */
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** Shown when nothing matches; defaults to «Нічого не знайдено». */
  emptyText?: string;
  /** The option behind `value` when it may be absent from the current results (async mode). */
  selectedOption?: ComboboxOption;
  id?: string;
  name?: string;
  disabled?: boolean;
  /** Shows a clear button while a value is selected; the native fallback has none. */
  clearable?: boolean;
  className?: string;
  onBlur?: FocusEventHandler<HTMLElement>;
}

export type ComboboxProps = ComboboxBaseProps &
  (
    | {
        /** Local mode: the complete list (up to 200), filtered in the browser. */
        options: readonly ComboboxOption[];
        onSearch?: never;
      }
    | {
        /**
         * Async mode: called on open and 200 ms after the last keystroke; `signal` aborts a superseded request.
         * Results are not cached across opens. When what is searched changes (e.g. the vertical), remount the field with a new `key`.
         */
        onSearch: (
          query: string,
          signal: AbortSignal,
        ) => Promise<readonly ComboboxOption[]>;
        options?: never;
      }
  );

export type ComboboxStatus = 'loading' | 'ready' | 'error';

export const SEARCH_DEBOUNCE_MS = 200;

export const normalizeSearch = (text: string) =>
  normalizeApostrophes(text.normalize('NFC')).toLocaleLowerCase('uk').trim();

/** Every word of the query must occur in the label or the secondary line. */
export function filterOptions(
  options: readonly ComboboxOption[],
  query: string,
): readonly ComboboxOption[] {
  const words = normalizeSearch(query).split(/\s+/u).filter(Boolean);
  if (words.length === 0) return options;
  return options.filter((option) => {
    const haystack = normalizeSearch(
      option.description
        ? `${option.label} ${option.description}`
        : option.label,
    );
    return words.every((word) => haystack.includes(word));
  });
}

/** Arrow keys skip disabled options and stop at the ends (no wrap); `-1` when nothing can be reached. */
export function nextEnabled(
  options: readonly ComboboxOption[],
  from: number,
  step: 1 | -1,
): number {
  for (
    let index = from + step;
    index >= 0 && index < options.length;
    index += step
  )
    if (!options[index]?.disabled) return index;
  return from >= 0 && from < options.length ? from : -1;
}

/** The field's `<label>` text without the required mark (`aria-hidden` star and its screen-reader twin), so the list is named like the field. */
export function fieldLabelText(input: HTMLInputElement | null) {
  const label = input?.labels?.[0]?.cloneNode(true);
  if (!(label instanceof HTMLElement)) return undefined;
  label
    .querySelectorAll('[aria-hidden="true"], .sr-only')
    .forEach((node) => node.remove());
  return label.textContent?.trim() || undefined;
}
