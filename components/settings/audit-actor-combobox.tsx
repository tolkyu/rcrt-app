'use client';

import {
  infiniteQueryOptions,
  keepPreviousData,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover } from 'radix-ui';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/api-client';
import {
  auditActorOptions,
  moveActiveOption,
  type AuditActorOption,
} from '@/lib/audit-actor-options';
import { AUDIT_SYSTEM_ACTOR } from '@/lib/audit-constants';
import { auditActorPageSchema, type AuditActor } from '@/lib/schemas/audit';
import { queryKeys } from '@/lib/query-keys';
import { normalizeUserQuery } from '@/lib/user-filters';
import { cn } from '@/lib/utils';
import { useAuditLabels } from './audit-labels';

const SEARCH_DEBOUNCE_MS = 200;

const auditActorsQuery = (q: string | undefined) =>
  infiniteQueryOptions({
    queryKey: queryKeys.settingsAuditActors(q ?? ''),
    initialPageParam: null as string | null,
    staleTime: 60_000,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (pageParam) params.set('cursor', pageParam);
      const search = params.toString();
      return apiRequest(`/audit/actors${search ? `?${search}` : ''}`, {
        schema: auditActorPageSchema,
        signal,
      });
    },
    getNextPageParam: (page) => page.nextCursor,
  });

/** «Хто» picker (wireframe settings-admin §3.1): search input + listbox in a popover anchored to the filter trigger. */
export function AuditActorCombobox({
  anchor,
  open,
  onOpenChange,
  value,
  onSelect,
}: {
  anchor: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string | undefined;
  onSelect: (value: string, actor: AuditActor | null) => void;
}) {
  const t = useTranslations('settings.audit');
  const labels = useAuditLabels();
  const tStates = useTranslations('states');
  const tCommon = useTranslations('common');
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const interactedOutside = useRef(false);
  const [text, setText] = useState('');
  const [term, setTerm] = useState<string | undefined>(undefined);
  /** `null` = not moved yet: start on the current value (no search) or the first match. */
  const [active, setActive] = useState<number | null>(null);
  const [activeFor, setActiveFor] = useState({ term, open });
  if (activeFor.term !== term || activeFor.open !== open) {
    setActiveFor({ term, open });
    setActive(null);
    // Closing by any path (trigger, Esc, outside, choice) starts the next open with an empty search.
    if (!open) {
      setText('');
      setTerm(undefined);
    }
  }

  useEffect(() => {
    const id = setTimeout(
      () => setTerm(normalizeUserQuery(text)),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(id);
  }, [text]);

  const query = useInfiniteQuery({
    ...auditActorsQuery(term),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const users = query.data?.pages.flatMap((page) => page.items) ?? [];
  const searching =
    normalizeUserQuery(text) !== term || query.isPlaceholderData;
  const options =
    query.data && !searching ? auditActorOptions(term, users, t('system')) : [];
  const optionId = (index: number) => `${listId}-${index}`;
  const activeIndex = Math.min(
    active ??
      (term
        ? 0
        : Math.max(
            0,
            options.findIndex((option) => option.value === value),
          )),
    options.length - 1,
  );

  useEffect(() => {
    if (activeIndex >= 0)
      document
        .getElementById(`${listId}-${activeIndex}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  const choose = (option: AuditActorOption) => {
    onSelect(option.value, option.actor);
    onOpenChange(false);
  };
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage && !searching)
      void query.fetchNextPage();
  };
  const loadMoreNearEnd = () => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 48) loadMore();
  };
  // A first page that does not fill the list cannot be scrolled, so mouse and touch users get the next page here.
  useEffect(() => {
    if (open) loadMoreNearEnd();
  });
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (event.key === 'ArrowDown' && activeIndex === options.length - 1)
        loadMore();
      setActive(moveActiveOption(activeIndex, event.key, options.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option);
    }
  };

  let status: string | null = null;
  if (!query.data || searching)
    status = query.isError ? null : tStates('loading');
  else if (options.length === 0) status = t('filters.actorEmpty');

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Portal>
        <Popover.Content
          aria-label={t('columns.actor')}
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="border-border bg-popover text-popover-foreground z-30 flex max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) max-w-[calc(100vw-1rem)] min-w-72 flex-col rounded-lg border shadow-md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            interactedOutside.current = false;
            input.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // After a click elsewhere focus stays where the user put it.
            if (!interactedOutside.current) anchor.current?.focus();
          }}
          onInteractOutside={(event) => {
            // The trigger toggles the picker itself; letting Radix dismiss first would reopen it.
            if (anchor.current?.contains(event.target as Node))
              event.preventDefault();
            else interactedOutside.current = true;
          }}
        >
          <div className="border-border relative border-b p-2">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              ref={input}
              role="combobox"
              aria-expanded={options.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                activeIndex >= 0 ? optionId(activeIndex) : undefined
              }
              aria-label={t('filters.actorSearch')}
              placeholder={t('filters.actorSearch')}
              autoComplete="off"
              spellCheck={false}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              className="pl-9"
            />
          </div>
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label={t('columns.actor')}
            aria-busy={query.isFetching}
            className="min-h-0 flex-1 overflow-y-auto p-1 empty:hidden"
            onScroll={loadMoreNearEnd}
          >
            {options.map((option, index) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- combobox pattern: keys are handled on the focused input via aria-activedescendant; options never take focus.
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                // Keep focus in the search box so the mobile keyboard stays open while picking.
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(option)}
                className={cn(
                  'flex min-h-11 cursor-default items-center gap-2 rounded-md px-2 text-sm md:min-h-9',
                  index === activeIndex && 'bg-accent',
                )}
              >
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {option.value === AUDIT_SYSTEM_ACTOR ? (
                    <>
                      <span aria-hidden="true" className="mr-1">
                        {t('systemMark')}
                      </span>
                      {t('system')}
                    </>
                  ) : (
                    option.actor && labels.actorName(option.actor)
                  )}
                </span>
                {option.value === value && (
                  <>
                    <Check
                      className="text-primary size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      {t('filters.actorSelected')}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p
            role="status"
            className="text-muted-foreground px-3 py-4 text-center text-sm empty:hidden"
          >
            {status}
          </p>
          {query.isError && (
            <div
              role="alert"
              className="flex flex-col items-center gap-2 px-3 py-4 text-center text-sm"
            >
              <p className="text-error-text">{t('filters.actorFailed')}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                {tCommon('retry')}
              </Button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
