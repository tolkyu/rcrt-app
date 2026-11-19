import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-[scale,background-color,color,box-shadow] duration-(--duration-press) ease-out motion-safe:not-aria-disabled:active:not-focus-visible:scale-[0.97] disabled:pointer-events-none disabled:bg-surface-muted disabled:text-[#94a3b8] aria-disabled:bg-surface-muted aria-disabled:text-[#94a3b8] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover active:bg-primary-active',
        secondary: 'bg-primary-subtle text-link hover:bg-primary-subtle/80',
        outline:
          'border border-border bg-surface text-foreground hover:bg-surface-muted',
        ghost: 'text-foreground hover:bg-surface-muted',
        destructive:
          'bg-destructive text-white shadow-sm hover:bg-destructive/90',
        'destructive-soft':
          'bg-destructive-subtle text-error-text hover:bg-destructive-subtle/80',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-sm',
        md: 'h-10 rounded-lg px-4 text-sm',
        lg: 'h-12 rounded-lg px-5 text-base',
        icon: 'size-10 rounded-md',
        'icon-sm': 'size-8 rounded-md',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  );
}

export { buttonVariants };
