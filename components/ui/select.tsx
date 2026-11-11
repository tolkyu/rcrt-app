'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { cn } from '@/lib/utils';
import { LoadBoundary } from './load-boundary';
import { useFocusHold } from './use-restore-focus';
import {
  findOption,
  isStaleValue,
  triggerClass,
  valueClass,
  type SelectFieldProps,
  type SelectOpenedBy,
} from './select-shared';

export type { SelectFieldProps, SelectOption } from './select-shared';

const loadContent = () => import('./select-content');
const SelectContent = lazy(loadContent);

const OPEN_KEYS = new Set(['Enter', ' ', 'ArrowDown', 'ArrowUp']);

interface Swap {
  open: boolean;
  by: SelectOpenedBy;
  refocus: boolean;
}

interface Failure {
  refocus: boolean;
}

/** Without the Radix chunk the field degrades to a native `<select>` with the same value contract. */
function NativeSelect({
  options,
  value,
  onValueChange,
  placeholder,
  className,
  refocus,
  ...rest
}: Omit<SelectFieldProps, 'name'> & { refocus: boolean }) {
  const t = useTranslations('common');
  const selected = findOption(options, value);
  const focusOnMount = useCallback(
    (node: HTMLSelectElement | null) => {
      if (node && refocus) node.focus();
    },
    [refocus],
  );
  return (
    <select
      {...rest}
      ref={focusOnMount}
      value={selected ? selected.value : ''}
      onChange={(event) => onValueChange(event.target.value)}
      className={cn(triggerClass, className)}
    >
      {!selected && (
        <option value="" disabled hidden>
          {placeholder}
        </option>
      )}
      {options.length === 0 && <option disabled>{t('selectEmpty')}</option>}
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * The trigger renders at once and looks like the final one; the Radix chunk loads on hover or keyboard
 * focus (PERF-04) and replaces it when the user opens the list, so the press that asked for it is not lost.
 * The replacement keeps the `id`, so `id` must be the same on the server and the client (never a `useId` value:
 * a streamed page can hydrate it with a different path) for a `<label for>` to keep naming the field.
 */
export function Select(props: SelectFieldProps) {
  const {
    options,
    value,
    onValueChange,
    placeholder,
    name,
    disabled,
    className,
    id,
    onBlur,
    ...aria
  } = props;
  const t = useTranslations('common');
  const [swap, setSwap] = useState<Swap | null>(null);
  const [failed, setFailed] = useState<Failure | null>(null);
  const touchPress = useRef(false);
  const { held, track } = useFocusHold();
  const selected = findOption(options, value);
  const emptyLabel = isStaleValue(options, value)
    ? t('unavailable')
    : placeholder;

  const preload = (node: HTMLElement) =>
    loadContent().then(
      () => true,
      () => {
        setFailed({ refocus: document.activeElement === node });
        return false;
      },
    );
  const request = (by: SelectOpenedBy) => {
    if (disabled) return;
    // A transition keeps the focused trigger on screen until the chunk is ready.
    startTransition(() => setSwap({ open: true, by, refocus: false }));
  };

  if (failed)
    return (
      <>
        {name && <input type="hidden" name={name} value={value} />}
        <NativeSelect
          {...aria}
          id={id}
          options={options}
          value={value}
          onValueChange={onValueChange}
          placeholder={emptyLabel}
          disabled={disabled}
          className={className}
          onBlur={onBlur}
          refocus={failed.refocus}
        />
      </>
    );

  const trigger = (
    <button
      {...aria}
      id={id}
      ref={track}
      type="button"
      // A closed select has no listbox to control; aria-controls appears on the Radix trigger once it is open.
      // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
      role="combobox"
      aria-expanded={false}
      aria-autocomplete="none"
      data-slot="select-trigger"
      data-placeholder={selected ? undefined : ''}
      title={selected?.label}
      disabled={disabled}
      className={cn(triggerClass, className)}
      onBlur={onBlur}
      onPointerEnter={(event) => void preload(event.currentTarget)}
      onFocus={(event: FocusEvent<HTMLButtonElement>) => {
        const node = event.currentTarget;
        if (!node.matches(':focus-visible')) return;
        // Keyboard focus swaps in the Radix trigger so type-ahead works on the closed field.
        void preload(node).then((loaded) => {
          if (!loaded || document.activeElement !== node) return;
          startTransition(() =>
            setSwap(
              (current) =>
                current ?? { open: false, by: 'keyboard', refocus: true },
            ),
          );
        });
      }}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        touchPress.current = event.pointerType !== 'mouse';
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        if (event.ctrlKey) return;
        event.preventDefault();
        request('pointer');
      }}
      onPointerCancel={() => {
        touchPress.current = false;
      }}
      onClick={() => {
        // Touch and pen open on click, as Radix does, so a scroll that starts on the field does not open it.
        if (!touchPress.current) return;
        touchPress.current = false;
        request('pointer');
      }}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        touchPress.current = false;
        if (!OPEN_KEYS.has(event.key)) return;
        event.preventDefault();
        request('keyboard');
      }}
    >
      <span className={valueClass}>{selected?.label ?? emptyLabel}</span>
      <ChevronDown
        aria-hidden="true"
        className="text-muted-foreground size-4 shrink-0"
      />
    </button>
  );

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <LoadBoundary
        fallback={trigger}
        onError={() => {
          setSwap(null);
          setFailed({ refocus: true });
        }}
      >
        <Suspense fallback={trigger}>
          {swap ? (
            <SelectContent
              {...aria}
              id={id}
              options={options}
              value={value}
              onValueChange={onValueChange}
              placeholder={emptyLabel}
              disabled={disabled}
              className={className}
              onBlur={onBlur}
              open={swap.open}
              openedBy={swap.by}
              refocus={swap.refocus}
              focusHeld={held}
            />
          ) : (
            trigger
          )}
        </Suspense>
      </LoadBoundary>
    </>
  );
}
