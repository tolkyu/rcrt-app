'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronDown, ScrollText, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { SectionError } from '@/components/states/section-error';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  auditApiFilters,
  auditSearchParams,
  parseAuditSearch,
  selectedAuditActions,
  type AuditSearch,
} from '@/lib/audit-filters';
import { AUDIT_PERIODS } from '@/lib/audit-period';
import { auditActionSelection } from '@/lib/audit-actions';
import {
  auditQuery,
  auditWindowMoved,
  type AuditFilterValues,
} from '@/lib/queries/settings';
import { AUDIT_ENTITY_TYPES, AUDIT_SYSTEM_ACTOR } from '@/lib/audit-constants';
import type { AuditActor, AuditEntry } from '@/lib/schemas/audit';
import { loadOrReload } from '@/lib/load-or-reload';
import { cn } from '@/lib/utils';
import { useMobile } from '@/lib/use-mobile';
import { useHydrated } from '@/lib/use-hydrated';
import { AuditActorFilter } from './audit-actor-filter';
import { AuditActionFilter } from './audit-action-filter';
import { useAuditLabels } from './audit-labels';

const loadRecordSheet = () => import('./audit-record-sheet');
const AuditDateFilter = dynamic(() =>
  loadOrReload(() => import('./audit-date-filter')).then(
    (module) => module.AuditDateFilter,
  ),
);
/** The record sheet is its own chunk (PERF-04 budget); it is fetched right after hydration so opening a row stays instant. */
const AuditRecordSheet = dynamic(
  () => loadOrReload(loadRecordSheet).then((module) => module.AuditRecordSheet),
  {
    loading: () => (
      <div className="bg-surface border-border z-dialog fixed inset-y-0 right-0 flex w-full flex-col gap-4 p-6 shadow-lg sm:w-[30rem] sm:border-l">
        <Skeleton className="h-7 w-2/3" />
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-5 w-full" />
        ))}
      </div>
    ),
  },
);

const selectClass =
  'border-input bg-surface text-foreground h-11 w-full rounded-lg border px-3 text-base md:h-10 md:text-sm';

const PERIOD_KEYS = {
  today: 'periodToday',
  '7d': 'period7d',
  '30d': 'period30d',
  '365d': 'period365d',
  custom: 'periodCustom',
} as const satisfies Record<AuditSearch['period'], string>;

function resolveFilters(
  search: AuditSearch,
  initialSearch: AuditSearch,
  initialFilters: AuditFilterValues,
) {
  return auditSearchParams(search).toString() ===
    auditSearchParams(initialSearch).toString()
    ? initialFilters
    : auditApiFilters(search, new Date());
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  const hydrated = useHydrated();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-foreground text-xs font-medium">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          disabled={!hydrated}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${selectClass} appearance-none pr-10`}
        >
          {children}
        </select>
        <ChevronDown
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

/** Finds the anchor in the active responsive presentation. */
function visibleRow(list: HTMLElement | null, id: string) {
  return [
    ...(list?.querySelectorAll<HTMLElement>(
      `[data-audit-row="${CSS.escape(id)}"]`,
    ) ?? []),
  ].find((row) => row.getClientRects().length > 0);
}

function ResultChip({ result }: { result: AuditEntry['result'] }) {
  const t = useTranslations('settings.audit');
  return result === 'DENIED' ? (
    <span className="bg-destructive-subtle text-error-text inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
      <Ban className="size-3.5" aria-hidden="true" />
      {t('result.DENIED')}
    </span>
  ) : (
    <span className="text-muted-foreground text-sm">{t('result.SUCCESS')}</span>
  );
}

/** «Журнал дій»: filters in the URL, newest first, «Показати ще» by cursor, record in a side sheet. */
export function AuditView({
  initialSearch,
  initialFilters,
  initialActor,
}: {
  initialSearch: AuditSearch;
  initialFilters: AuditFilterValues;
  /** Deep-linked «Хто» user, resolved on the server: it may not be on the picker's first page. */
  initialActor: AuditActor | null;
}) {
  const t = useTranslations('settings.audit');
  const labels = useAuditLabels();
  const mobile = useMobile();
  const hydrated = useHydrated();
  const params = useSearchParams();
  const searchKey = params.toString();
  const search = useMemo(
    () => parseAuditSearch(new URLSearchParams(searchKey)),
    [searchKey],
  );
  const selectedActions = selectedAuditActions(search);
  const actionsSummaryId = useId();
  const filters = useMemo(
    () => resolveFilters(search, initialSearch, initialFilters),
    [search, initialSearch, initialFilters],
  );
  const [from, setFrom] = useState(filters.from ?? '');
  const [to, setTo] = useState(filters.to ?? '');
  const [dateError, setDateError] = useState(false);
  const periodKey = `${search.period} ${filters.from ?? ''} ${filters.to ?? ''}`;
  const [draftKey, setDraftKey] = useState(periodKey);
  /** Back/Forward, reset or entity history moved the period: the URL wins over the date draft, as on a fresh load. */
  if (draftKey !== periodKey) {
    setDraftKey(periodKey);
    setFrom(filters.from ?? '');
    setTo(filters.to ?? '');
    setDateError(false);
  }
  const [pickedActor, setPickedActor] = useState(initialActor);
  const query = useInfiniteQuery(auditQuery(filters));
  const queryClient = useQueryClient();
  useEffect(() => void loadRecordSheet().catch(() => undefined), []);

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const listRef = useRef<HTMLElement>(null);
  const newerRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const anchor = useRef<{
    id: string;
    top: number;
    data: unknown;
    filters: AuditFilterValues;
    refocus: boolean;
  } | null>(null);
  const fetchingPage = query.isFetchingNextPage || query.isFetchingPreviousPage;
  /** Keeps the edge row in place while the 2-page window grows on one side and evicts the other (STORY-AUD-4). */
  const loadPage = (newer: boolean) => {
    if (fetchingPage) return;
    const edge = newer ? items[0] : items.at(-1);
    const row = edge && visibleRow(listRef.current, edge.id);
    if (edge && row) {
      anchor.current = {
        id: edge.id,
        top: row.getBoundingClientRect().top,
        data: query.data,
        filters,
        refocus:
          document.activeElement === (newer ? newerRef : moreRef).current,
      };
      // Native scroll anchoring (absent in Safari) would fight the manual restore below.
      document.body.style.setProperty('overflow-anchor', 'none');
    }
    void (newer
      ? query.fetchPreviousPage({ cancelRefetch: false })
      : query.fetchNextPage({ cancelRefetch: false }));
  };
  useLayoutEffect(() => {
    const pending = anchor.current;
    if (!pending || fetchingPage) return;
    anchor.current = null;
    // A filter change mid-load swaps the list; the old anchor must not scroll the new one.
    const row =
      query.data !== pending.data && pending.filters === filters
        ? visibleRow(listRef.current, pending.id)
        : undefined;
    if (row) {
      window.scrollBy({
        top: row.getBoundingClientRect().top - pending.top,
        behavior: 'instant',
      });
      if (pending.refocus && document.activeElement === document.body)
        row
          .querySelector<HTMLElement>('[data-row-open]')
          ?.focus({ preventScroll: true });
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.body.style.removeProperty('overflow-anchor'),
      ),
    );
  }, [fetchingPage, query.data, filters]);
  useEffect(
    () => () => void document.body.style.removeProperty('overflow-anchor'),
    [],
  );

  const sync = useCallback(
    (next: AuditSearch, mode: 'push' | 'replace' = 'replace') => {
      const params = auditSearchParams(next).toString();
      const url = params ? `?${params}` : window.location.pathname;
      window.history[mode === 'push' ? 'pushState' : 'replaceState'](
        null,
        '',
        url,
      );
    },
    [],
  );
  const applyFilters = (patch: Partial<AuditSearch>) => {
    const next = { ...search, ...patch, record: undefined };
    if (
      auditSearchParams(next).toString() !==
      auditSearchParams({ ...search, record: undefined }).toString()
    ) {
      const { queryKey } = auditQuery(
        resolveFilters(next, initialSearch, initialFilters),
      );
      const cached = queryClient.getQueryData(queryKey);
      if (cached && auditWindowMoved(cached))
        queryClient.removeQueries({ queryKey, exact: true });
    }
    sync(next);
  };
  const openRecord = (record: string | undefined) => {
    const next = { ...search, record };
    sync(next, record ? 'push' : 'replace');
  };
  useEffect(() => {
    if (!search.record) return;
    const move = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.key !== 'j' && event.key !== 'k') ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable="true"]',
          ))
      )
        return;
      const at = items.findIndex((entry) => entry.id === search.record);
      if (at < 0) return;
      const next = items[at + (event.key === 'j' ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      sync({ ...search, record: next.id });
    };
    document.addEventListener('keydown', move);
    return () => document.removeEventListener('keydown', move);
  }, [items, search, sync]);
  const filtered =
    search.view === 'security' ||
    search.period !== '7d' ||
    Boolean(
      search.action ||
      search.actions ||
      search.entityType ||
      search.actorId ||
      search.result,
    );
  const reset = () =>
    applyFilters({
      period: '7d',
      view: undefined,
      action: undefined,
      actions: undefined,
      entityType: undefined,
      entityId: undefined,
      actorId: undefined,
      result: undefined,
      from: undefined,
      to: undefined,
    });

  const entityChip =
    search.entityType && search.entityId
      ? (labels.entity(
          items.find((item) => item.entity?.id === search.entityId)?.entity ?? {
            type: search.entityType,
            id: search.entityId,
            label: null,
          },
        ) ?? '')
      : null;
  const actorEntry = search.actorId
    ? items.find((item) => item.actor?.id === search.actorId)
    : undefined;
  let actorChip: string | null = null;
  if (search.actorId === AUDIT_SYSTEM_ACTOR) actorChip = t('system');
  else if (pickedActor && search.actorId === pickedActor.id)
    actorChip = labels.actorName(pickedActor);
  else if (search.actorId)
    actorChip = actorEntry
      ? labels.actor(actorEntry)
      : labels.shortId(search.actorId);

  let body: ReactNode;
  if (!query.data) {
    body = query.isError ? (
      <SectionError
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    ) : (
      <div className="skeleton-delayed flex flex-col gap-2 p-4">
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={ScrollText}
        title={t('empty.title')}
        description={t('empty.description')}
        action={
          filtered ? (
            <Button variant="outline" onClick={reset}>
              {t('filters.reset')}
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    const time = (entry: AuditEntry) =>
      t('time', { at: new Date(entry.occurredAt) });
    const open = (entry: AuditEntry) =>
      t('openRecord', {
        action: labels.action(entry.action),
        at: new Date(entry.occurredAt),
      });
    body = (
      <>
        {!mobile ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] table-fixed text-sm">
              <caption className="sr-only">{t('title')}</caption>
              <colgroup>
                <col className="w-44" />
                <col className="w-50" />
                <col className="w-55" />
                <col />
                <col className="w-33" />
                <col className="w-30" />
              </colgroup>
              <thead>
                <tr className="border-border text-muted-foreground border-b text-left text-xs">
                  {(
                    [
                      'time',
                      'actor',
                      'action',
                      'entity',
                      'result',
                      'ip',
                    ] as const
                  ).map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-4 py-3 font-medium"
                    >
                      {t(`columns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr
                    key={entry.id}
                    data-audit-row={entry.id}
                    onClick={() => openRecord(entry.id)}
                    className={cn(
                      'border-border hover:bg-surface-muted h-12 cursor-pointer border-b last:border-0',
                      search.record === entry.id && 'bg-primary-subtle',
                    )}
                  >
                    <td className="text-muted-foreground px-4 whitespace-nowrap tabular-nums">
                      {time(entry)}
                    </td>
                    <td className="text-foreground px-4">
                      {entry.actor ? (
                        <button
                          type="button"
                          className="text-left whitespace-nowrap hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            applyFilters({ actorId: entry.actor!.id });
                          }}
                        >
                          {labels.actor(entry)}
                        </button>
                      ) : (
                        labels.actor(entry)
                      )}
                    </td>
                    <td className="px-4">
                      <button
                        type="button"
                        data-row-open
                        aria-label={open(entry)}
                        onClick={(event) => {
                          event.stopPropagation();
                          openRecord(entry.id);
                        }}
                        className="text-foreground text-left font-medium hover:underline"
                      >
                        {labels.action(entry.action)}
                      </button>
                    </td>
                    <td className="text-muted-foreground px-4">
                      {entry.entity ? (
                        <>
                          {labels.entity({ ...entry.entity, label: '' })}
                          <span className="whitespace-nowrap">
                            {entry.entity.label ??
                              labels.shortId(entry.entity.id)}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4">
                      <ResultChip result={entry.result} />
                    </td>
                    <td className="text-muted-foreground px-4 font-mono text-xs">
                      {entry.ip ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="divide-border divide-y">
            {items.map((entry) => (
              <li key={entry.id} data-audit-row={entry.id}>
                <button
                  type="button"
                  data-row-open
                  onClick={() => openRecord(entry.id)}
                  className="hover:bg-surface-muted flex w-full flex-col gap-1 p-4 text-left"
                >
                  <span className="sr-only">{t('openRecordMobile')}</span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-foreground font-semibold">
                      {labels.action(entry.action)}
                    </span>
                    {entry.result === 'DENIED' && (
                      <ResultChip result={entry.result} />
                    )}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {[labels.actor(entry), labels.entity(entry.entity)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {t('timeShort', { at: new Date(entry.occurredAt) })}
                    {entry.ip ? ` · ${entry.ip}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  const chips = [
    search.period !== '7d' && {
      label:
        search.period === 'custom'
          ? `${t('filters.period')}: ${search.from} — ${search.to}`
          : t(`filters.${PERIOD_KEYS[search.period]}`),
      clear: () =>
        applyFilters({ period: '7d', from: undefined, to: undefined }),
    },
    search.view === 'security' && {
      label: t('views.security'),
      clear: () => applyFilters({ view: undefined }),
    },
    selectedActions.length > 0 && {
      label:
        selectedActions.length === 1
          ? labels.action(selectedActions[0]!)
          : t('filters.actionsSelected', { count: selectedActions.length }),
      clear: () => applyFilters({ action: undefined, actions: undefined }),
    },
    search.entityType &&
      !entityChip && {
        label: t('filters.entity', {
          label: labels.entityType(search.entityType),
        }),
        clear: () =>
          applyFilters({ entityType: undefined, entityId: undefined }),
      },
    search.result && {
      label: `${t('filters.result')}: ${t(`result.${search.result}`)}`,
      clear: () => applyFilters({ result: undefined }),
    },
    entityChip && {
      label: t('filters.entity', { label: entityChip }),
      clear: () => applyFilters({ entityType: undefined, entityId: undefined }),
    },
    actorChip && {
      label: t('filters.actor', { label: actorChip }),
      clear: () => applyFilters({ actorId: undefined }),
    },
  ].filter((chip): chip is { label: string; clear: () => void } => !!chip);

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div
        role="group"
        aria-label={t('views.label')}
        className="border-border mb-4 grid w-full grid-cols-2 rounded-lg border p-1 md:inline-flex md:w-auto"
      >
        {(['all', 'security'] as const).map((view) => (
          <Button
            key={view}
            variant={(search.view ?? 'all') === view ? 'secondary' : 'ghost'}
            aria-pressed={(search.view ?? 'all') === view}
            onClick={() =>
              applyFilters({ view: view === 'security' ? view : undefined })
            }
            className="min-h-11 whitespace-normal"
          >
            {t(`views.${view}`)}
          </Button>
        ))}
      </div>
      <section
        aria-label={t('filters.label')}
        className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-5"
      >
        <FilterSelect
          label={t('filters.period')}
          value={search.period}
          onChange={(value) => {
            const period = value as AuditSearch['period'];
            applyFilters({
              period,
              from: period === 'custom' ? filters.from : undefined,
              to: period === 'custom' ? filters.to : undefined,
            });
          }}
        >
          {([...AUDIT_PERIODS, 'custom'] as const).map((period) => (
            <option key={period} value={period}>
              {t(`filters.${PERIOD_KEYS[period]}`)}
            </option>
          ))}
        </FilterSelect>
        <AuditActorFilter
          value={search.actorId}
          label={actorChip}
          className={selectClass}
          onSelect={(actorId, actor) => {
            if (actor) setPickedActor(actor);
            applyFilters({ actorId });
          }}
        />
        <AuditActionFilter
          value={selectedActions}
          summaryId={actionsSummaryId}
          valueLabel={
            selectedActions.length > 1
              ? t('filters.actionsSelected', { count: selectedActions.length })
              : selectedActions[0]
                ? labels.action(selectedActions[0])
                : t('filters.all')
          }
          className={selectClass}
          onSelect={(codes) => applyFilters(auditActionSelection(codes))}
        />
        <FilterSelect
          label={t('filters.entityType')}
          value={search.entityType ?? ''}
          onChange={(value) =>
            applyFilters({
              entityType:
                AUDIT_ENTITY_TYPES.find((type) => type === value) ?? undefined,
              entityId: undefined,
            })
          }
        >
          <option value="">{t('filters.all')}</option>
          {AUDIT_ENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {labels.entityType(type)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label={t('filters.result')}
          value={search.result ?? ''}
          onChange={(value) =>
            applyFilters({
              result:
                value === 'SUCCESS' || value === 'DENIED' ? value : undefined,
            })
          }
        >
          <option value="">{t('filters.all')}</option>
          <option value="SUCCESS">{t('result.SUCCESS')}</option>
          <option value="DENIED">{t('result.DENIED')}</option>
        </FilterSelect>
      </section>
      {search.period === 'custom' && (
        <AuditDateFilter
          from={from}
          to={to}
          error={dateError}
          setFrom={setFrom}
          setTo={setTo}
          setError={setDateError}
          onApply={() => applyFilters({ from, to })}
        />
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="bg-primary-subtle text-link inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm"
          >
            {chip.label}
            <button
              type="button"
              aria-label={t('filters.removeFilter', { label: chip.label })}
              onClick={chip.clear}
              className="hover:bg-surface inline-flex size-11 items-center justify-center rounded-full md:size-7"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </span>
        ))}
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 md:min-h-0"
            onClick={reset}
          >
            {t('filters.reset')}
          </Button>
        )}
        <span className="text-muted-foreground ml-auto text-xs">
          {t('filters.periodHint')}
        </span>
      </div>
      {/* Stays mounted so the first selection (0→1) is announced. */}
      <p
        id={selectedActions.length > 0 ? actionsSummaryId : undefined}
        className={cn(
          'text-muted-foreground text-sm',
          selectedActions.length > 0 && 'mb-3',
        )}
        aria-live="polite"
      >
        {selectedActions.length > 0 &&
          t('filters.actionsSummary', {
            labels: selectedActions.map(labels.action).join('; '),
          })}
      </p>
      {query.hasPreviousPage && (
        <Button
          ref={newerRef}
          variant="outline"
          onClick={() => loadPage(true)}
          disabled={!hydrated}
          aria-disabled={fetchingPage}
          aria-busy={query.isFetchingPreviousPage}
          className="mb-4 h-11 w-full md:h-10 md:w-auto"
        >
          {t('loadNewer')}
        </Button>
      )}
      {query.isFetchPreviousPageError && (
        <SectionError
          className="mb-4"
          onRetry={() => loadPage(true)}
          retrying={fetchingPage}
        />
      )}
      <Card ref={listRef} className="overflow-hidden p-0">
        {body}
      </Card>
      {query.isError && query.data && !query.isFetchPreviousPageError && (
        <SectionError
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}
      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground text-sm" aria-live="polite">
            {/* Remounts per window so a move that keeps the count (100→100) is still announced. */}
            <span key={items[0]?.id}>
              {t('shown', { count: items.length })}
            </span>
          </span>
          {items.length === 100 && (
            <span className="text-muted-foreground text-xs">
              {t('windowHint')}
            </span>
          )}
          {query.hasNextPage && (
            <Button
              ref={moreRef}
              variant="outline"
              onClick={() => loadPage(false)}
              disabled={!hydrated}
              aria-disabled={fetchingPage}
              aria-busy={query.isFetchingNextPage}
              className="h-11 w-full md:h-10 md:w-auto"
            >
              {t('loadMore')}
            </Button>
          )}
        </div>
      )}
      {search.record && (
        <AuditRecordSheet
          recordId={search.record}
          onClose={() => openRecord(undefined)}
          onShowEntityHistory={(entity) =>
            applyFilters({
              entityType: AUDIT_ENTITY_TYPES.find(
                (type) => type === entity.type,
              ),
              entityId: entity.id,
              period: '365d',
              view: undefined,
              action: undefined,
              actions: undefined,
              actorId: undefined,
              result: undefined,
              from: undefined,
              to: undefined,
            })
          }
        />
      )}
    </>
  );
}
