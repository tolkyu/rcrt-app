'use client';

import { ChevronDown, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  lazy,
  Suspense,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { cn } from '@/lib/utils';
import type { ComboboxDismissal } from './combobox-popup';
import {
  fieldLabelText,
  nextEnabled,
  type ComboboxOption,
  type ComboboxProps,
} from './combobox-shared';
import { Input } from './input';
import { LoadBoundary } from './load-boundary';
import { NativeSelect } from './native-select';
import { useComboboxOptions } from './use-combobox-options';

export type { ComboboxOption, ComboboxProps } from './combobox-shared';

const loadPopup = () => import('./combobox-popup');
const ComboboxPopup = lazy(loadPopup);

interface View {
  open: boolean;
  instant: boolean;
  /** The list is named like the field (its `<label>`, without the required mark) when it opens, so it follows `FormField`. */
  label: string | undefined;
}

/**
 * Editable combobox with a list (APG): focus never leaves the input; the Radix popup chunk loads on hover or focus (PERF-04)
 * and the field stays usable while it loads. `id` must be the same on the server and the client for `<label for>`.
 */
export function Combobox(props: ComboboxProps) {
  const {
    value,
    onValueChange,
    placeholder,
    emptyText,
    selectedOption,
    id,
    name,
    disabled,
    clearable,
    className,
    onBlur,
    options,
    onSearch,
    ...aria
  } = props;
  const t = useTranslations('common');
  const autoId = useId();
  const listId = `${id ?? autoId}-listbox`;
  const input = useRef<HTMLInputElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({
    open: false,
    instant: false,
    label: undefined,
  });
  const [armed, setArmed] = useState(false);
  const [failed, setFailed] = useState<{ refocus: boolean } | null>(null);
  /** `null` = the user has not typed: the field shows the selected label and the list is unfiltered. */
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ComboboxOption | undefined>();
  if (disabled && (view.open || query !== null)) {
    setView({ ...view, open: false });
    setQuery(null);
    setActive(null);
  }

  const results = useComboboxOptions(
    { options, onSearch },
    query ?? '',
    view.open || failed !== null,
  );
  const list = results.options;
  // Async results change with the query, so the label comes from what the caller or the user last picked.
  const selected =
    value === ''
      ? undefined
      : onSearch
        ? [selectedOption, chosen].find((option) => option?.value === value)
        : options?.find((option) => option.value === value);
  const stale = value !== '' && !selected;
  const typing = (query ?? '').trim() !== '';
  const keptIndex = list.findIndex(
    (option) => option.value === active && !option.disabled,
  );
  const selectedIndex = typing
    ? -1
    : list.findIndex((option) => option.value === value && !option.disabled);
  const activeIndex =
    keptIndex >= 0
      ? keptIndex
      : selectedIndex >= 0
        ? selectedIndex
        : nextEnabled(list, -1, 1);
  const showClear = Boolean(clearable && value !== '' && !disabled);

  const setOpen = (open: boolean, by: ComboboxDismissal) => {
    setView({
      open,
      instant: by === 'keyboard',
      label: aria['aria-label'] ?? fieldLabelText(input.current),
    });
    if (open) setArmed(true);
    else {
      setQuery(null);
      setActive(null);
    }
  };
  const fail = () =>
    setFailed({ refocus: document.activeElement === input.current });
  const preload = () => void loadPopup().catch(fail);
  const choose = (option: ComboboxOption, by: ComboboxDismissal) => {
    if (option.disabled) return;
    setChosen(option);
    if (option.value !== value) onValueChange(option.value);
    setOpen(false, by);
  };
  const clear = () => {
    setChosen(undefined);
    onValueChange('');
    setOpen(false, 'pointer');
    input.current?.focus();
  };
  const moveTo = (index: number) => {
    const option = list[index];
    if (option) setActive(option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // keyCode 229 is how Safari reports the key that ends an IME composition.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const { open } = view;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true, 'keyboard');
      else
        moveTo(
          nextEnabled(list, activeIndex, event.key === 'ArrowDown' ? 1 : -1),
        );
    } else if (event.key === 'Enter' && open) {
      // An open list owns Enter: it must not submit the surrounding form.
      event.preventDefault();
      const option = list[activeIndex];
      if (option) choose(option, 'keyboard');
    } else if (event.key === 'Tab' && open) setOpen(false, 'keyboard');
  };
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setActive(null);
    if (!view.open) setOpen(true, 'keyboard');
  };
  const onClick = (event: MouseEvent<HTMLInputElement>) => {
    if (view.open) return;
    setOpen(true, 'pointer');
    // A selected label is replaced by the first keystroke instead of being appended to.
    event.currentTarget.select();
  };

  const hidden = name && <input type="hidden" name={name} value={value} />;
  if (failed) {
    const choices =
      selected && !list.some((option) => option.value === selected.value)
        ? [selected, ...list]
        : list;
    return (
      <>
        {hidden}
        <NativeSelect
          {...aria}
          id={id}
          options={choices}
          value={value}
          onValueChange={(next) => {
            setChosen(choices.find((option) => option.value === next));
            onValueChange(next);
          }}
          placeholder={stale ? t('unavailable') : placeholder}
          disabled={disabled}
          className={className}
          onBlur={onBlur}
          refocus={failed.refocus}
        />
      </>
    );
  }

  return (
    <>
      {hidden}
      <div
        ref={wrapper}
        data-slot="combobox"
        className={cn('relative w-full', className)}
      >
        <Input
          {...aria}
          id={id}
          ref={input}
          role="combobox"
          aria-expanded={view.open}
          aria-controls={view.open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            view.open && activeIndex >= 0
              ? `${listId}-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={stale ? t('unavailable') : placeholder}
          title={selected?.label}
          disabled={disabled}
          value={query ?? selected?.label ?? ''}
          className={cn('truncate', showClear ? 'pr-[4.5rem]' : 'pr-9')}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onClick={onClick}
          onFocus={preload}
          onPointerEnter={preload}
          onBlur={onBlur}
        />
        {showClear && (
          <button
            type="button"
            aria-label={t('comboboxClear')}
            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-8 flex w-9 items-center justify-center rounded-md"
            // The press must not move focus out of the input.
            onPointerDown={(event) => event.preventDefault()}
            onFocus={() => setOpen(false, 'keyboard')}
            onClick={clear}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
        <ChevronDown
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
        />
      </div>
      {armed && (
        <LoadBoundary fallback={null} onError={fail}>
          <Suspense fallback={null}>
            <ComboboxPopup
              anchor={wrapper}
              open={view.open}
              instant={view.instant}
              onDismiss={(by) => setOpen(false, by)}
              listId={listId}
              label={view.label}
              labelledBy={aria['aria-labelledby']}
              options={list}
              status={results.status}
              value={value}
              activeIndex={activeIndex}
              emptyText={emptyText ?? t('comboboxEmpty')}
              onActivate={(index) => moveTo(index)}
              onChoose={(option) => choose(option, 'pointer')}
              onRetry={results.retry}
            />
          </Suspense>
        </LoadBoundary>
      )}
    </>
  );
}
