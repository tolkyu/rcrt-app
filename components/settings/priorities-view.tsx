'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Layers, UsersRound } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { SectionError } from '@/components/states/section-error';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import {
  priorityKeys,
  priorityVerticalsQuery,
  saveTeamLeadPriorities,
  teamLeadPrioritiesQuery,
} from '@/lib/queries/team-lead-priority';
import type {
  TeamLeadPriorityItem,
  VerticalTeamLeadPriorities,
} from '@/lib/schemas/team-lead-priority';
import {
  changedRows,
  moveBlocks,
  movePriority,
  parsePriorityDraft,
  priorityText,
  sortByPriority,
  tiedUsers,
  type PriorityValue,
} from '@/lib/team-lead-priority-draft';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const PrioritiesLeaveDialog = dynamic(() =>
  import('./priorities-leave-dialog').then(
    (module) => module.PrioritiesLeaveDialog,
  ),
);

const PATH = '/settings/priorities';
const SUMMARY_MAX = 3;

type FocusTarget = { userId: string; part: 'up' | 'down' | 'field' } | null;

/** «Пріоритети тімлідів» (STORY-ROLE-01-3, wireframe settings-tl-priorities P1): tabs per vertical, one batched save. */
export function PrioritiesView() {
  const t = useTranslations('settings.priorities');
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const verticals = useQuery(priorityVerticalsQuery());
  const requested = params.get('vertical')?.toLowerCase();
  const items = verticals.data?.items ?? [];
  const selected = items.find((item) => item.id === requested) ?? items[0];
  const priorities = useQuery({
    ...teamLeadPrioritiesQuery(selected?.id ?? ''),
    enabled: Boolean(selected),
  });
  const panelId = useId();
  const [dirty, setDirty] = useState(false);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  /** Bumped on «Не зберігати», so the editor remounts without drafts even when the URL does not change. */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (selected && requested !== selected.id)
      window.history.replaceState(null, '', `${PATH}?vertical=${selected.id}`);
  }, [requested, selected]);

  const guarded = useCallback(
    (next: () => void) => {
      if (dirty) setLeave(() => next);
      else next();
    },
    [dirty],
  );

  /** In-app links (SettingsNav, shell) and reload/close ask first while drafts exist; browser Back is not guarded. */
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[href]')
          : null;
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      )
        return;
      const url = new URL(anchor.href, window.location.href);
      const here = window.location;
      // Same-document links (the «#main» skip link, in-page anchors) never drop drafts.
      if (
        url.origin === here.origin &&
        url.pathname === here.pathname &&
        url.search === here.search
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setLeave(() => () => {
        if (url.origin === window.location.origin)
          router.push(`${url.pathname}${url.search}${url.hash}`);
        else window.location.assign(url.href);
      });
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, router]);

  const selectVertical = (id: string) =>
    guarded(() => {
      setDirty(false);
      window.history.replaceState(null, '', `${PATH}?vertical=${id}`);
    });
  const prefetch = (id: string) =>
    void queryClient.prefetchQuery(teamLeadPrioritiesQuery(id));

  let body;
  if (!verticals.data)
    body = verticals.isError ? (
      <SectionError
        onRetry={() => void verticals.refetch()}
        retrying={verticals.isFetching}
      />
    ) : (
      <EditorSkeleton />
    );
  else if (!selected)
    body = (
      <Card>
        <EmptyState
          icon={Layers}
          title={t('empty.noVerticalsTitle')}
          description={t('empty.noVerticalsDescription')}
          action={
            <Button asChild className="h-11 md:h-10">
              <Link href="/settings/verticals">
                {t('empty.noVerticalsAction')}
              </Link>
            </Button>
          }
        />
      </Card>
    );
  else
    body = (
      <>
        <VerticalTabs
          label={t('tabsLabel')}
          items={items}
          selectedId={selected.id}
          panelId={panelId}
          onSelect={selectVertical}
          onIntent={prefetch}
        />
        <div
          role="tabpanel"
          id={panelId}
          aria-labelledby={`${panelId}-${selected.id}`}
        >
          {priorities.data ? (
            <PriorityEditor
              key={`${selected.id}:${generation}`}
              data={priorities.data}
              onDirtyChange={setDirty}
            />
          ) : priorities.isError ? (
            <Card>
              <SectionError
                onRetry={() => void priorities.refetch()}
                retrying={priorities.isFetching}
              />
            </Card>
          ) : (
            <EditorSkeleton rowsOnly />
          )}
        </div>
      </>
    );

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {body}
      {leave && selected && (
        <PrioritiesLeaveDialog
          vertical={priorities.data?.vertical.name ?? selected.name}
          onStay={() => setLeave(null)}
          onDiscard={() => {
            setLeave(null);
            setDirty(false);
            setGeneration((current) => current + 1);
            leave();
          }}
        />
      )}
    </>
  );
}

/**
 * Segmented vertical tabs without the Radix tabs runtime (PERF-04: −7 kB on this route). Arrow keys move focus,
 * Enter/Space activates — manual activation, so browsing tabs never triggers the unsaved-changes dialog.
 */
function VerticalTabs({
  label,
  items,
  selectedId,
  panelId,
  onSelect,
  onIntent,
}: {
  label: string;
  items: readonly { id: string; name: string }[];
  selectedId: string;
  panelId: string;
  onSelect: (id: string) => void;
  onIntent: (id: string) => void;
}) {
  const keys = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const target =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
    tabs?.[target]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className="bg-surface-muted mb-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl p-1"
    >
      {items.map((item, index) => {
        const active = item.id === selectedId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${panelId}-${item.id}`}
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            className={cn(
              'h-11 min-w-24 shrink-0 rounded-lg px-4 text-sm font-medium whitespace-nowrap md:h-10',
              active
                ? 'border-border bg-surface text-link dark:bg-primary-subtle border shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => !active && onSelect(item.id)}
            onKeyDown={(event) => keys(event, index)}
            onPointerEnter={() => onIntent(item.id)}
            onFocus={() => onIntent(item.id)}
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

function EditorSkeleton({ rowsOnly = false }: { rowsOnly?: boolean }) {
  return (
    <div className="skeleton-delayed flex flex-col gap-4">
      {!rowsOnly && (
        <div className="flex gap-2">
          <Skeleton className="h-11 w-28 rounded-xl" />
          <Skeleton className="h-11 w-28 rounded-xl" />
        </div>
      )}
      <Card className="flex flex-col gap-2 p-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </Card>
    </div>
  );
}

function PriorityEditor({
  data,
  onDirtyChange,
}: {
  data: VerticalTeamLeadPriorities;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslations('settings.priorities');
  const tCommon = useTranslations('settings.common');
  const tShared = useTranslations('common');
  const queryClient = useQueryClient();
  const baseId = useId();
  const table = useRef<HTMLTableElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusTarget = useRef<FocusTarget>(null);
  /** Save and Cancel unmount the footer that held focus, so focus moves to the card heading. */
  const focusHeading = useRef(false);
  const [base, setBase] = useState(data);
  const [values, setValues] = useState<ReadonlyMap<string, PriorityValue>>(
    () => new Map(),
  );
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [failure, setFailure] = useState<'conflict' | 'error' | null>(null);
  const [live, setLive] = useState('');

  const valueOf = (item: TeamLeadPriorityItem) =>
    values.has(item.userId) ? values.get(item.userId)! : item.priority;
  const rows = sortByPriority(base.items, values);
  const changes = changedRows(base.items, values);
  const ties = tiedUsers(base.items, values);
  const invalid = [...texts.values()].some(
    (text) => parsePriorityDraft(text) === undefined,
  );
  const dirty = changes.length > 0 || texts.size > 0;
  const label = (value: PriorityValue) =>
    value === null ? t('valueNone') : t('valueShort', { priority: value });

  const reset = (next: VerticalTeamLeadPriorities) => {
    setBase(next);
    setValues(new Map());
    setTexts(new Map());
    setFailure(null);
  };

  const mutation = useMutation({
    mutationFn: () =>
      saveTeamLeadPriorities(
        base.vertical.id,
        changes.map((item) => ({
          userId: item.userId,
          priority: valueOf(item),
          version: item.version,
        })),
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData(priorityKeys.vertical(saved.vertical.id), saved);
      focusHeading.current = true;
      reset(saved);
      toast.success(t('toastSaved', { vertical: saved.vertical.name }));
      // Literal prefixes instead of the users/audit key factories, which would pull their modules into this route (PERF-04).
      for (const queryKey of [
        ['settings', 'user'],
        ['settings', 'users'],
        ['settings', 'audit'],
      ])
        void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) =>
      setFailure(
        error instanceof ApiError && error.code === 'STALE_STATE'
          ? 'conflict'
          : 'error',
      ),
  });
  const busy = mutation.isPending;
  const locked = busy || failure === 'conflict';

  // A background refetch only replaces the list while nothing is drafted (wireframe P1.1 #13).
  if (data !== base && !dirty && !busy && failure === null) reset(data);

  useEffect(() => {
    onDirtyChange(dirty || busy);
  }, [dirty, busy, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  /** Re-sorting moves DOM rows, so focus is restored onto the control that acted (wireframe P1.2). */
  useEffect(() => {
    if (focusHeading.current) {
      focusHeading.current = false;
      heading.current?.focus();
      return;
    }
    const target = focusTarget.current;
    if (!target || !table.current) return;
    focusTarget.current = null;
    const find = (part: string) =>
      table.current?.querySelector<HTMLElement>(
        `[data-focus="${target.userId}:${part}"]`,
      );
    const element = find(target.part);
    if (
      element?.getAttribute('aria-disabled') === 'true' &&
      target.part !== 'field'
    )
      (find(target.part === 'up' ? 'down' : 'up') ?? element).focus();
    else element?.focus();
  }, [values]);

  const announce = (
    item: TeamLeadPriorityItem,
    next: ReadonlyMap<string, PriorityValue>,
  ) => {
    const value = next.has(item.userId)
      ? next.get(item.userId)!
      : item.priority;
    if (value === null)
      return setLive(t('clearedLive', { name: item.fullName }));
    const sorted = sortByPriority(base.items, next);
    setLive(
      t('moved', {
        name: item.fullName,
        priority: value,
        position: sorted.findIndex((row) => row.userId === item.userId) + 1,
        total: sorted.length,
      }),
    );
  };

  /** Applies the typed value (blur / Enter); returns the values the next action should start from. */
  const commit = (item: TeamLeadPriorityItem, keepFocus: boolean) => {
    const text = texts.get(item.userId);
    if (text === undefined) return values;
    const parsed = parsePriorityDraft(text);
    if (parsed === undefined) return values;
    const nextTexts = new Map(texts);
    nextTexts.delete(item.userId);
    setTexts(nextTexts);
    if (parsed === valueOf(item)) return values;
    const next = new Map(values).set(item.userId, parsed);
    if (keepFocus) focusTarget.current = { userId: item.userId, part: 'field' };
    setValues(next);
    announce(item, next);
    return next;
  };

  const move = (
    item: TeamLeadPriorityItem,
    direction: -1 | 1,
    from: ReadonlyMap<string, PriorityValue> = values,
  ) => {
    if (locked || invalid) return;
    const blocks = moveBlocks(base.items, from, item.userId);
    if ((direction === -1 ? blocks.up : blocks.down) !== null) return;
    const next = movePriority(base.items, from, item.userId, direction);
    focusTarget.current = {
      userId: item.userId,
      part: direction === -1 ? 'up' : 'down',
    };
    setValues(next);
    announce(item, next);
  };

  const rowKeys = (event: KeyboardEvent, item: TeamLeadPriorityItem) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown'))
      return;
    event.preventDefault();
    const from =
      event.currentTarget instanceof HTMLInputElement
        ? commit(item, false)
        : values;
    move(item, event.key === 'ArrowUp' ? -1 : 1, from);
  };

  const refresh = async () => {
    try {
      const fresh = await queryClient.fetchQuery({
        ...teamLeadPrioritiesQuery(base.vertical.id),
        staleTime: 0,
      });
      const first = sortByPriority(fresh.items, new Map())[0];
      if (first) focusTarget.current = { userId: first.userId, part: 'field' };
      reset(fresh);
    } catch {
      setFailure('error');
    }
  };

  const groups = [
    { id: 'set', rows: rows.filter((item) => valueOf(item) !== null) },
    { id: 'unset', rows: rows.filter((item) => valueOf(item) === null) },
  ].filter((group) => group.rows.length > 0);

  return (
    <>
      {failure && (
        <div
          role="alert"
          className={cn(
            'mb-4 flex flex-col items-start gap-2 rounded-xl border p-4 text-sm',
            failure === 'conflict'
              ? 'border-warning bg-warning/10'
              : 'border-error bg-destructive-subtle',
          )}
        >
          <p className="text-foreground font-semibold">
            {failure === 'conflict'
              ? t('conflictTitle')
              : tCommon('saveFailed')}
          </p>
          {failure === 'conflict' && (
            <p className="text-foreground">{t('conflictBody')}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-11 md:h-8"
            disabled={busy}
            onClick={() =>
              failure === 'conflict' ? void refresh() : mutation.mutate()
            }
          >
            {failure === 'conflict' ? t('conflictAction') : tShared('retry')}
          </Button>
        </div>
      )}
      <Card className="p-0">
        <h2
          ref={heading}
          tabIndex={-1}
          className="border-border text-foreground border-b px-4 py-3 text-base font-semibold outline-none"
        >
          {rows.length > 0
            ? t('cardTitle', {
                vertical: base.vertical.name,
                count: rows.length,
              })
            : base.vertical.name}
        </h2>
        {rows.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title={t('empty.noTeamLeadsTitle', {
              vertical: base.vertical.name,
            })}
            description={t('empty.noTeamLeadsDescription')}
            action={
              <Button asChild variant="outline" className="h-11 md:h-10">
                <Link
                  href={`/settings/users?role=TEAM_LEAD&vertical=${base.vertical.id}`}
                >
                  {t('empty.noTeamLeadsAction')}
                </Link>
              </Button>
            }
          />
        ) : (
          <table ref={table} className="block w-full text-sm md:table">
            <caption className="sr-only">
              {t('caption', { vertical: base.vertical.name })}
            </caption>
            <thead className="text-muted-foreground hidden text-left text-xs md:table-header-group">
              <tr>
                <th scope="col" className="w-28 px-4 py-2 font-medium">
                  {t('columns.priority')}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t('columns.teamLead')}
                </th>
                <th
                  scope="col"
                  className="w-28 px-4 py-2 text-right font-medium"
                >
                  {t('columns.order')}
                </th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody
                key={group.id}
                className="flex flex-col gap-3 p-3 md:table-row-group md:p-0"
              >
                {group.id === 'unset' && (
                  <tr className="block md:table-row">
                    <th
                      scope="rowgroup"
                      colSpan={3}
                      className="text-muted-foreground md:bg-surface-muted block text-left text-xs font-medium md:table-cell md:px-4 md:py-2"
                    >
                      {t('notSetGroupLine', {
                        group: t('notSetGroup'),
                        hint: t('notSetGroupHint'),
                      })}
                    </th>
                  </tr>
                )}
                {group.rows.map((item) => {
                  const value = valueOf(item);
                  const changed = value !== item.priority;
                  const text = texts.get(item.userId) ?? priorityText(value);
                  const bad = parsePriorityDraft(text) === undefined;
                  const blocks = moveBlocks(base.items, values, item.userId);
                  const ids = {
                    invalid: `${baseId}-${item.userId}-invalid`,
                    up: `${baseId}-${item.userId}-up`,
                    down: `${baseId}-${item.userId}-down`,
                  };
                  const arrow = (direction: -1 | 1) => {
                    const block = direction === -1 ? blocks.up : blocks.down;
                    const reason = block ? t(`reasons.${block}`) : null;
                    const inert = Boolean(reason) || invalid || locked;
                    const id = direction === -1 ? ids.up : ids.down;
                    return (
                      <Button
                        variant="ghost"
                        size="icon"
                        data-focus={`${item.userId}:${direction === -1 ? 'up' : 'down'}`}
                        className="aria-disabled:text-foreground size-11 aria-disabled:cursor-not-allowed aria-disabled:bg-transparent aria-disabled:opacity-40 md:size-9"
                        aria-label={t(
                          direction === -1 ? 'moveUp' : 'moveDown',
                          {
                            name: item.fullName,
                          },
                        )}
                        // aria-disabled keeps the button focusable so its reason is read (DisabledReason).
                        aria-disabled={inert || undefined}
                        aria-describedby={reason ? id : undefined}
                        title={reason ?? undefined}
                        disabled={busy}
                        onClick={() => move(item, direction)}
                        onKeyDown={(event) => rowKeys(event, item)}
                      >
                        {direction === -1 ? (
                          <ArrowUp aria-hidden="true" />
                        ) : (
                          <ArrowDown aria-hidden="true" />
                        )}
                        {reason && (
                          <span id={id} className="sr-only">
                            {reason}
                          </span>
                        )}
                      </Button>
                    );
                  };
                  return (
                    <tr
                      key={item.userId}
                      className={cn(
                        'border-border grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-3 rounded-xl border p-3 md:table-row md:rounded-none md:border-0 md:border-t md:p-0',
                        changed &&
                          'shadow-[inset_3px_0_0_var(--color-primary)] md:shadow-none',
                      )}
                    >
                      <td
                        className={cn(
                          'col-start-1 row-start-2 md:table-cell md:px-4 md:py-2 md:align-middle',
                          changed &&
                            'md:shadow-[inset_3px_0_0_var(--color-primary)]',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="text-muted-foreground text-sm md:hidden"
                          >
                            {t('columns.priority')}
                          </span>
                          <Input
                            data-focus={`${item.userId}:field`}
                            aria-label={t('fieldLabel', {
                              name: item.fullName,
                            })}
                            aria-invalid={bad || undefined}
                            aria-describedby={bad ? ids.invalid : undefined}
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={3}
                            className="h-11 w-16 text-center tabular-nums md:h-10"
                            value={text}
                            disabled={locked}
                            onChange={(event) =>
                              setTexts((current) =>
                                new Map(current).set(
                                  item.userId,
                                  event.target.value,
                                ),
                              )
                            }
                            onBlur={() => commit(item, false)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                commit(item, true);
                              } else if (event.key === 'Escape') {
                                event.preventDefault();
                                setTexts((current) => {
                                  const next = new Map(current);
                                  next.delete(item.userId);
                                  return next;
                                });
                              } else rowKeys(event, item);
                            }}
                          />
                        </span>
                      </td>
                      <td className="col-span-2 row-start-1 min-w-0 md:table-cell md:px-4 md:py-2 md:align-middle">
                        <div className="flex min-w-0 items-start gap-3">
                          <Avatar name={item.fullName} />
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-foreground font-medium [overflow-wrap:anywhere]">
                              {item.fullName}
                            </span>
                            <span
                              title={t('badgeHint')}
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-xs tabular-nums',
                                value === null
                                  ? 'border-border text-muted-foreground border-dashed'
                                  : 'bg-primary-subtle text-link border-transparent',
                              )}
                            >
                              {value === null
                                ? t('notSet')
                                : t('badge', { priority: value })}
                            </span>
                            {changed && (
                              <span className="text-muted-foreground text-xs">
                                {t('was', { value: label(item.priority) })}
                              </span>
                            )}
                            {ties.has(item.userId) && (
                              <span className="text-muted-foreground basis-full text-xs">
                                {t('tieHint')}
                              </span>
                            )}
                            {bad && (
                              <span
                                id={ids.invalid}
                                className="text-error-text basis-full text-xs"
                              >
                                {t('invalid')}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="col-start-2 row-start-2 md:table-cell md:px-4 md:py-2 md:align-middle">
                        <span className="flex justify-end gap-1">
                          {arrow(-1)}
                          {arrow(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        )}
        <div className="text-muted-foreground flex flex-col gap-2 px-4 py-3 text-xs">
          {rows.length > 0 && <p>{t('hint')}</p>}
          {base.pendingInvites > 0 && (
            <p>{t('pendingInvites', { count: base.pendingInvites })}</p>
          )}
        </div>
        {changes.length > 0 && (
          <div className="border-border bg-surface sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-3 rounded-b-xl border-t p-4 shadow-md md:bottom-0 md:flex-row md:items-center md:justify-between">
            <div aria-live="polite" className="text-sm">
              <p className="text-foreground font-semibold">
                {t('unsaved', { count: changes.length })}
              </p>
              <ul className="text-muted-foreground hidden text-xs md:block">
                {changes.slice(0, SUMMARY_MAX).map((item) => (
                  <li key={item.userId}>
                    {t('unsavedItem', {
                      name: item.fullName,
                      from: label(item.priority),
                      to: label(valueOf(item)),
                    })}
                  </li>
                ))}
                {changes.length > SUMMARY_MAX && (
                  <li>
                    {t('unsavedMore', { count: changes.length - SUMMARY_MAX })}
                  </li>
                )}
              </ul>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 flex-1 md:h-10 md:flex-none"
                disabled={busy}
                onClick={() => {
                  focusHeading.current = true;
                  reset(data);
                }}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                className="h-11 flex-1 md:h-10 md:flex-none"
                disabled={busy || invalid || failure === 'conflict'}
                onClick={() => mutation.mutate()}
              >
                {busy ? tCommon('saving') : t('save')}
              </Button>
            </div>
          </div>
        )}
      </Card>
      <p className="sr-only" role="status" aria-live="polite">
        {live}
      </p>
    </>
  );
}
