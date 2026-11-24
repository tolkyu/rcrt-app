'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  findOption,
  triggerClass,
  type SelectFieldProps,
} from './select-shared';

/** Fallback when a lazy popup chunk fails to load: a native `<select>` with the same value, aria and focus contract. */
export function NativeSelect({
  options,
  value,
  onValueChange,
  placeholder,
  className,
  refocus,
  ...rest
}: Omit<SelectFieldProps, 'name'> & { refocus: boolean }) {
  const t = useTranslations('common');
  const selected = findOption(options, value);
  const focusOnMount = useCallback(
    (node: HTMLSelectElement | null) => {
      if (node && refocus) node.focus();
    },
    [refocus],
  );
  return (
    <select
      {...rest}
      ref={focusOnMount}
      value={selected ? selected.value : ''}
      onChange={(event) => onValueChange(event.target.value)}
      className={cn(triggerClass, className)}
    >
      {!selected && (
        <option value="" disabled hidden>
          {placeholder}
        </option>
      )}
      {options.length === 0 && <option disabled>{t('selectEmpty')}</option>}
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}
