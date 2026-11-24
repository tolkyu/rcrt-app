import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Up to two initials from a display name; users have no photos (A-04 covers candidates only). */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('uk'))
    .join('');
}

export function Avatar({
  name,
  className,
  ...props
}: ComponentProps<'span'> & { name: string }) {
  return (
    <span
      data-slot="avatar"
      aria-hidden="true"
      className={cn(
        'bg-primary-subtle text-link inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold select-none',
        className,
      )}
      {...props}
    >
      {initials(name)}
    </span>
  );
}
