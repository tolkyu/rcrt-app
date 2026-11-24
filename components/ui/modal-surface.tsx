import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const widths = {
  sm: 'md:w-[min(28rem,calc(100vw-2rem))]',
  md: 'md:w-[min(36rem,calc(100vw-2rem))]',
  lg: 'md:w-[min(48rem,calc(100vw-2rem))]',
} as const;

export type ModalSize = keyof typeof widths;

/** Overlay fades with its panel; the dark scrim is heavier so the surface still separates (design-system §8.2). */
export const overlayClass =
  'motion-fade z-dialog fixed inset-0 bg-black/40 dark:bg-black/60';

/** Bottom sheet that slides in below 768 px, centred scale-in from 768 px (design-system §8.2); a caller class wins a width conflict. */
export const modalClass = (size: ModalSize, className?: string) =>
  cn(
    'border-border bg-surface z-dialog fixed flex flex-col gap-4 border p-6 shadow-lg',
    'inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))] max-md:motion-sheet-up',
    'md:motion-modal md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:pb-6',
    widths[size],
    className,
  );

/** Mobile: full-width stacked, primary last (thumb zone); desktop: right-aligned row (wireframe settings-admin §1.9). */
export function ModalFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 md:flex-row md:flex-wrap md:justify-end [&>button]:h-auto [&>button]:min-h-12 [&>button]:py-2 [&>button]:text-center [&>button]:[overflow-wrap:anywhere] [&>button]:whitespace-normal md:[&>button]:min-h-10',
        className,
      )}
      {...props}
    />
  );
}
