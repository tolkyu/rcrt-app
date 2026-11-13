'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { cn } from '@/lib/utils';

export interface FilterChipOption {
  value: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface FilterChipsProps {
  options: readonly FilterChipOption[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

const countFormat = new Intl.NumberFormat('uk-UA');
const REVEAL_INSET = 20;

export function FilterChips({
  options,
  value,
  onValueChange,
  label,
  disabled = false,
  className,
}: FilterChipsProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [edges, setEdges] = useState({ start: false, end: false });
  const enabled = options.filter((option) => !option.disabled && !disabled);
  const tabValue =
    enabled.find((option) => option.value === value)?.value ??
    enabled[0]?.value;

  const measure = useCallback(() => {
    const row = scroller.current;
    if (!row) return;
    const start = row.scrollLeft > 1;
    const end = row.scrollWidth - row.clientWidth - row.scrollLeft > 1;
    setEdges((previous) =>
      previous.start === start && previous.end === end
        ? previous
        : { start, end },
    );
  }, []);

  const reveal = useCallback(
    (button: HTMLButtonElement | undefined) => {
      const row = scroller.current;
      if (!row) return;
      if (!button) {
        measure();
        return;
      }
      const viewport = row.getBoundingClientRect();
      const chip = button.getBoundingClientRect();
      const toStart = chip.left - viewport.left - REVEAL_INSET;
      const toEnd = chip.right - viewport.right + REVEAL_INSET;
      // Align the chip start with its snap point (scroll-px-5): a smaller nudge is pulled back by proximity snap, and a chip wider than the row still shows its start. Scroll this row only because scrollIntoView can also move the page.
      const delta = toStart < 0 || toEnd > 0 ? toStart : 0;
      if (delta) row.scrollLeft += delta;
      measure();
    },
    [measure],
  );

  useEffect(() => {
    const update = () => reveal(buttons.current.get(value));
    update();
    const observer = new ResizeObserver(update);
    if (scroller.current) observer.observe(scroller.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [value, reveal]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, current: string) {
    if (event.altKey || event.ctrlKey || event.metaKey || !enabled.length)
      return;
    const index = enabled.findIndex((option) => option.value === current);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % enabled.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + enabled.length) % enabled.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = enabled.length - 1;
        break;
      default:
        return;
    }
    const option = enabled[next];
    if (!option) return;
    event.preventDefault();
    const button = buttons.current.get(option.value);
    button?.focus({ preventScroll: true });
    reveal(button);
    if (option.value !== value) onValueChange(option.value);
  }

  if (!options.length) return null;

  return (
    <div
      ref={scroller}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || !enabled.length || undefined}
      // Chromium makes a scrollable row without focusable children a Tab stop.
      tabIndex={enabled.length ? undefined : -1}
      data-slot="filter-chips-scroll"
      data-overflow-start={edges.start}
      data-overflow-end={edges.end}
      onScroll={measure}
      className={cn(
        'max-w-full min-w-0 snap-x snap-proximity scroll-px-5 [scrollbar-width:none] overflow-x-auto overscroll-x-contain scroll-auto p-1 [&::-webkit-scrollbar]:hidden',
        className,
      )}
      style={{
        maskImage:
          edges.start || edges.end
            ? `linear-gradient(to right, ${edges.start ? 'transparent, black 16px' : 'black'}, ${edges.end ? 'black calc(100% - 16px), transparent' : 'black'})`
            : undefined,
      }}
    >
      <div ref={content} className="flex w-max gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          const count =
            option.count === undefined
              ? undefined
              : countFormat.format(option.count);
          return (
            <button
              key={option.value}
              ref={(node) => {
                if (node) buttons.current.set(option.value, node);
                else buttons.current.delete(option.value);
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={
                count === undefined ? option.label : `${option.label}, ${count}`
              }
              disabled={disabled || option.disabled}
              tabIndex={option.value === tabValue ? 0 : -1}
              onKeyDown={(event) => navigate(event, option.value)}
              onFocus={(event) => {
                // A pointer press must not scroll the row mid-tap: the chip would slide away and the click would be lost.
                if (event.currentTarget.matches(':focus-visible'))
                  reveal(event.currentTarget);
              }}
              onClick={() => {
                if (!selected) onValueChange(option.value);
              }}
              className={cn(
                'border-border text-muted-foreground hover:bg-surface-muted motion-safe:not-disabled:not-focus-visible:duration-press inline-flex min-h-9 shrink-0 snap-start items-center gap-2 rounded-full border px-3 text-sm whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 motion-safe:not-disabled:not-focus-visible:transition-[scale] motion-safe:not-disabled:not-focus-visible:ease-out motion-safe:not-disabled:not-focus-visible:active:scale-[0.97] forced-colors:focus-visible:outline-[CanvasText] pointer-coarse:min-h-11',
                selected &&
                  'bg-primary-subtle text-link ring-brand hover:bg-primary-subtle ring-2 forced-colors:border-[Highlight] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:forced-color-adjust-none',
              )}
            >
              {option.label}
              {count !== undefined && (
                <span className="tabular-nums">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
