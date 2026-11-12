'use client';

import {
  cloneElement,
  type ComponentProps,
  useId,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type MouseEvent,
  type MouseEventHandler,
  type ReactElement,
} from 'react';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';
import { Tooltip, type TooltipTriggerProps } from './tooltip';

type ActionProps = TooltipTriggerProps & {
  className?: string;
  'aria-describedby'?: string;
  'aria-disabled'?: ComponentProps<'button'>['aria-disabled'];
  onClick?: MouseEventHandler<HTMLElement>;
  onAuxClick?: MouseEventHandler<HTMLElement>;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  onKeyUp?: KeyboardEventHandler<HTMLElement>;
};

const block = (event: MouseEvent<HTMLElement>) => {
  event.preventDefault();
  event.stopPropagation();
};

// Enter fires click on keydown and Space on keyup, so both are cancelled; other keys reach the child.
const guardKey =
  (next?: KeyboardEventHandler<HTMLElement>) =>
  (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
    else next?.(event);
  };

/**
 * A disabled action stays focusable (`aria-disabled`, not `disabled`) so its reason is reachable:
 * the reason is announced through `aria-describedby`, shown as a tooltip on hover/focus and as
 * visible helper text where hover does not exist.
 *
 * The child must be a Button (not a link or a menu trigger) rendered as a DOM or client element, so
 * `cloneElement` can override its handlers; pass `className="w-full"` here for a full-width mobile button.
 */
export function DisabledReason({
  reason,
  disabled = true,
  reserveSpace = false,
  className,
  children,
}: {
  reason: string;
  disabled?: boolean;
  /** Keeps the touch-visible reason's line (and gap) while the action is enabled, so the layout around it does not jump. */
  reserveSpace?: boolean;
  className?: string;
  children: ReactElement<ActionProps>;
}) {
  // `useId` can diverge between SSR and hydration in dev, so the id pair exists only after hydration.
  const hydrated = useHydrated();
  const generatedId = useId();
  const reasonId = hydrated ? generatedId : undefined;
  const props = children.props;
  const action = disabled
    ? cloneElement(children, {
        'aria-disabled': true,
        'aria-describedby':
          [props['aria-describedby'], reasonId].filter(Boolean).join(' ') ||
          undefined,
        className: cn(props.className, 'cursor-not-allowed'),
        onClick: block,
        onAuxClick: block,
        onKeyDown: guardKey(props.onKeyDown),
        onKeyUp: guardKey(props.onKeyUp),
      })
    : children;
  return (
    <span
      className={cn(
        'inline-flex max-w-full flex-col items-start gap-1.5',
        className,
      )}
    >
      <Tooltip content={reason} disabled={!disabled} decorative>
        {action}
      </Tooltip>
      {disabled ? (
        <span
          id={reasonId}
          className="[@media(hover:none)]:text-muted-foreground-strong sr-only [@media(hover:none)]:not-sr-only [@media(hover:none)]:text-xs"
        >
          {reason}
        </span>
      ) : (
        reserveSpace && (
          <span
            aria-hidden="true"
            className="invisible hidden text-xs [@media(hover:none)]:block"
          >
            &nbsp;
          </span>
        )
      )}
    </span>
  );
}
