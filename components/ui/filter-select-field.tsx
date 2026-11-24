'use client';

import { Label } from '@/components/ui/label';
import { Select, type SelectOption } from '@/components/ui/select';

/** Labelled `Select` for the list filters; it replaces the native `FilterSelect` screen by screen (positions, settings keep the native one until the retrofit). */
export function FilterSelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  /** Explicit and stable: a `useId` value can differ between the server HTML and the client of a streamed page. */
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select
        id={id}
        value={value}
        onValueChange={onChange}
        options={options}
      />
    </div>
  );
}
