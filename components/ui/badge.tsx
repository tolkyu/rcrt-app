import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex shrink-0 items-center rounded-full border border-transparent font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-muted text-muted-foreground-strong',
        success: 'bg-success-subtle text-success-text',
        warning: 'bg-warning-subtle text-warning-text',
        info: 'bg-info-subtle text-info-text',
        danger: 'bg-destructive-subtle text-error-text',
        brand: 'bg-primary-subtle text-link',
      },
      size: {
        sm: 'gap-1 px-2 py-0.5 text-xs',
        md: 'gap-1.5 px-2.5 py-1 text-xs',
      },
      outline: { true: 'bg-transparent', false: '' },
      dashed: { true: 'border-dashed', false: '' },
    },
    compoundVariants: [
      { outline: true, tone: 'neutral', className: 'border-input' },
      { outline: true, tone: 'success', className: 'border-success' },
      { outline: true, tone: 'warning', className: 'border-warning' },
      { outline: true, tone: 'info', className: 'border-info' },
      { outline: true, tone: 'danger', className: 'border-destructive' },
      { outline: true, tone: 'brand', className: 'border-brand' },
      { dashed: true, outline: false, className: 'border-input' },
    ],
    defaultVariants: {
      tone: 'neutral',
      size: 'md',
      outline: false,
      dashed: false,
    },
  },
);

export type BadgeProps = Omit<ComponentProps<'span'>, 'children'> &
  VariantProps<typeof badgeVariants> & {
    children: string;
    icon?: LucideIcon;
    dot?: boolean;
    /** Clamps long values (tags, names) to one line; the full text moves to `title`. */
    truncate?: boolean;
  };

/** Text is mandatory and always rendered: tone and icon are secondary signals, never the only one. */
export function Badge({
  tone,
  size,
  outline,
  dashed,
  icon: Icon,
  dot = false,
  truncate = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      title={truncate ? children : undefined}
      className={cn(
        badgeVariants({ tone, size, outline, dashed }),
        truncate && 'max-w-48',
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
      {dot && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-current"
        />
      )}
      {truncate ? <span className="truncate">{children}</span> : children}
    </span>
  );
}

export { badgeVariants };
