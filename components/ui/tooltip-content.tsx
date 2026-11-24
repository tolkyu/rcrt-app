'use client';

import { Tooltip as TooltipPrimitive } from 'radix-ui';
import {
  cloneElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/lib/utils';
import { useRestoreFocus } from './use-restore-focus';

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';
export type FocusIntent = 'keyboard' | 'pointer' | 'none';

const DELAY_MS = 400;
const SKIP_MS = 300;

/** Radix keeps skip-delay state per provider; tooltips load one by one, so the shared window lives here. */
let skipping = false;
let skipTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function setSkipping(next: boolean) {
  skipping = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function startSkipWindow() {
  clearTimeout(skipTimer);
  setSkipping(true);
  skipTimer = setTimeout(() => setSkipping(false), SKIP_MS);
}

export interface TooltipContentProps {
  content: ReactNode;
  side: TooltipSide;
  disabled: boolean;
  /** Keeps the text out of the accessibility tree when the trigger already carries it (DisabledReason). */
  decorative: boolean;
  focus: FocusIntent;
  /** The pointer is still over the trigger that this chunk replaced. */
  hover: boolean;
  /** Set by the static trigger when it held focus as it was removed. */
  focusHeld: RefObject<boolean>;
  children: ReactElement<HTMLAttributes<HTMLElement>>;
}

export default function TooltipContent({
  content,
  side,
  disabled,
  decorative,
  focus,
  hover,
  focusHeld,
  children,
}: TooltipContentProps) {
  const [open, setOpen] = useState(focus === 'keyboard');
  const [instant, setInstant] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const skip = useSyncExternalStore(
    subscribe,
    () => skipping,
    () => false,
  );

  const restoreFocus = useRestoreFocus(focus !== 'none', focusHeld);
  const attach = useCallback(
    (node: HTMLElement | null) => {
      trigger.current = node;
      restoreFocus(node);
    },
    [restoreFocus],
  );

  // The pointer is already over the replaced trigger, so Radix gets the pointermove it opens on (delay, pointerleave and skip semantics stay Radix's).
  // Deferred a task so a development double-mount (which resets Radix's timer) dispatches once.
  useEffect(() => {
    const node = trigger.current;
    if (!hover || !node) return;
    const timer = setTimeout(() => {
      node.dispatchEvent(
        typeof PointerEvent === 'function'
          ? new PointerEvent('pointermove', {
              bubbles: true,
              pointerType: 'mouse',
            })
          : new MouseEvent('pointermove', { bubbles: true }),
      );
    }, 0);
    // A real pointerleave before the task runs must not be followed by a synthetic move that opens it.
    const cancel = () => clearTimeout(timer);
    node.addEventListener('pointerleave', cancel);
    return () => {
      cancel();
      node.removeEventListener('pointerleave', cancel);
    };
  }, [hover]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setInstant(skipping);
    else startSkipWindow();
  };

  // The named bubble describes the trigger while open; the child's whole aria-describedby (its reason id) is dropped so the reason is not read twice.
  const described =
    decorative && open
      ? cloneElement(children, { 'aria-describedby': undefined })
      : children;

  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root
        open={open}
        onOpenChange={onOpenChange}
        delayDuration={skip ? 0 : DELAY_MS}
      >
        <TooltipPrimitive.Trigger asChild ref={attach}>
          {described}
        </TooltipPrimitive.Trigger>
        {!disabled && (
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              side={side}
              sideOffset={6}
              collisionPadding={8}
              aria-label={
                decorative && typeof content === 'string' ? content : undefined
              }
              data-instant={instant ? '' : undefined}
              className={cn(
                'motion-tooltip border-border bg-tooltip text-tooltip-foreground z-popover max-w-xs rounded-md border px-2.5 py-1.5 text-xs break-words shadow-md',
                decorative && '[@media(hover:none)]:hidden',
              )}
            >
              {decorative ? <span aria-hidden="true">{content}</span> : content}
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        )}
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
