'use client';

import { useId, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export const selectClass =
  'border-input bg-surface text-foreground h-11 w-full rounded-lg border px-3 text-base md:h-10 md:text-sm';

/** Labelled native select shared by the list filters (native keeps the mobile picker and keyboard behaviour). */
export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
      >
        {children}
      </select>
    </div>
  );
}
