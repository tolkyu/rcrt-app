'use client';

import {
  cloneElement,
  lazy,
  startTransition,
  Suspense,
  useRef,
  useState,
  type FocusEventHandler,
  type PointerEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react';
import { LoadBoundary } from './load-boundary';
import type { FocusIntent, TooltipSide } from './tooltip-content';

const loadContent = () => import('./tooltip-content');
const TooltipContent = lazy(loadContent);

export interface TooltipTriggerProps {
  onPointerEnter?: PointerEventHandler<HTMLElement>;
  onPointerLeave?: PointerEventHandler<HTMLElement>;
  onPointerDown?: PointerEventHandler<HTMLElement>;
  onFocus?: FocusEventHandler<HTMLElement>;
}

export interface TooltipProps {
  content: ReactNode;
  side?: TooltipSide;
  /** Keeps the trigger as is and shows no tooltip (e.g. DisabledReason while the action is available). */
  disabled?: boolean;
  /** Hides the bubble from assistive technology because the trigger already carries the text (DisabledReason). */
  decorative?: boolean;
  /** One focusable element that forwards its ref and DOM props (a Button, a link). */
  children: ReactElement<TooltipTriggerProps>;
}

function focusIntentOf(element: HTMLElement): FocusIntent {
  if (document.activeElement !== element) return 'none';
  return element.matches(':focus-visible') ? 'keyboard' : 'pointer';
}

/**
 * The trigger renders at once; the Radix chunk loads on hover or keyboard focus (PERF-04) and then
 * replaces it. A pressed pointer, a touch pointer and a failed chunk all keep the plain trigger.
 * Touch devices get no bubble: an icon-only trigger must carry its label in `aria-label`, and any
 * other explanation belongs in visible text (see DisabledReason).
 */
export function Tooltip({
  content,
  side = 'top',
  disabled = false,
  decorative = false,
  children,
}: TooltipProps) {
  const [intent, setIntent] = useState<{
    focus: FocusIntent;
    hover: boolean;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const pressed = useRef(false);
  const hovering = useRef(false);

  const request = (element: HTMLElement) => {
    if (disabled || failed) return;
    pressed.current = false;
    loadContent().then(
      () => {
        // A swap between pointerdown and pointerup would swallow the click.
        // Focus may have moved on while the chunk loaded, so the intent is read at swap time.
        if (!pressed.current)
          startTransition(() =>
            setIntent({
              focus: focusIntentOf(element),
              hover: hovering.current,
            }),
          );
      },
      () => setFailed(true),
    );
  };

  const props = children.props;
  // The handlers read refs only when an event fires; the rule cannot see that through cloneElement.
  // eslint-disable-next-line react-hooks/refs
  const trigger = cloneElement(children, {
    onPointerEnter: (event) => {
      props.onPointerEnter?.(event);
      if (event.pointerType === 'touch') return;
      hovering.current = true;
      request(event.currentTarget);
    },
    onPointerLeave: (event) => {
      props.onPointerLeave?.(event);
      hovering.current = false;
    },
    onPointerDown: (event) => {
      props.onPointerDown?.(event);
      pressed.current = true;
    },
    onFocus: (event) => {
      props.onFocus?.(event);
      if (event.currentTarget.matches(':focus-visible'))
        request(event.currentTarget);
    },
  });

  return (
    <LoadBoundary
      fallback={trigger}
      onError={() => {
        setIntent(null);
        setFailed(true);
      }}
    >
      <Suspense fallback={trigger}>
        {intent ? (
          <TooltipContent
            content={content}
            side={side}
            disabled={disabled}
            decorative={decorative}
            focus={intent.focus}
            hover={intent.hover}
          >
            {children}
          </TooltipContent>
        ) : (
          trigger
        )}
      </Suspense>
    </LoadBoundary>
  );
}
