import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      data-slot="card"
      className={cn(
        'border-border bg-surface text-foreground rounded-xl border shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1 px-5 pt-5 md:px-6 md:pt-6', className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="card-title"
      className={cn('text-heading-lg text-foreground', className)}
      {...props}
    >
      {children}
    </h2>
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-5 py-5 md:px-6 md:pb-6', className)}
      {...props}
    />
  );
}
