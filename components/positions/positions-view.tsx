'use client';

import {
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ChevronLeft, Info, ListChecks, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { MfaRequiredAlert } from '@/components/states/mfa-required-alert';
import { SectionError } from '@/components/states/section-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import {
  groupPositions,
  parsePositionsSearch,
  positionsSearch,
  resolvePositionsVertical,
  type PositionVertical,
} from '@/lib/position-list';
import { MANAGER_POSITIONS, positionsQuery } from '@/lib/queries/positions';
import type { Position } from '@/lib/schemas/position';
import { toast } from '@/lib/toast';
import { useListLayout, type ListLayout } from '@/lib/use-list-layout';
import { useStickyBar } from '@/lib/use-sticky-bar';
import { cn } from '@/lib/utils';
import { useVacancyListHref } from '@/lib/vacancy-list-memory';
import { ALL_VERTICALS } from '@/lib/vertical-filter';
import { focusByKey } from './focus-key';
import { PositionCards, PositionTable } from './position-rows';
import {
  classifyFailure,
  isToggleVariables,
  POSITION_TOGGLE_KEY,
  refreshPosition,
  usePositionFailureToast,
  usePositionToggle,
} from './position-write';

const PositionNameDialog = dynamic(() =>
  import('./position-name-dialog').then((module) => module.PositionNameDialog),
);
const DeactivatePositionDialog = dynamic(() =>
  import('./deactivate-position-dialog').then(
    (module) => module.DeactivatePositionDialog,
  ),
);

type DialogState =
  | {
      readonly kind: 'name';
      readonly target: Position | null;
      readonly verticalId: string | undefined;
    }
  | {
      readonly kind: 'deactivate';
      readonly target: Position;
      readonly focusAfter: string;
    }
  | null;

function PositionsSkeleton({ layout }: { layout: ListLayout }) {
  const t = useTranslations('states');
  return (
    <div role="status" className="skeleton-delayed">
      <span className="sr-only">{t('loading')}</span>
      {layout === 'table' ? (
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      )}
    </div>
  );
}

/** «Довідник посад»: one list of every managed vertical, filtered on the client so the vertical and inactive toggles are instant. */
export function PositionsView({
  managedVerticals,
  defaultVertical,
  initialLayout,
}: {
  managedVerticals: readonly PositionVertical[];
  defaultVertical: string;
  initialLayout: ListLayout;
}) {
  const t = useTranslations('positions');
  const layout = useListLayout(initialLayout);
  const queryClient = useQueryClient();
  const notifyFailure = usePositionFailureToast();
  const toggle = usePositionToggle();
  const listHref = useVacancyListHref();
  const params = useSearchParams();
  const searchKey = params.toString();
  const url = useMemo(
    () => parsePositionsSearch(new URLSearchParams(searchKey)),
    [searchKey],
  );
  const vertical = resolvePositionsVertical(
    url.vertical,
    defaultVertical,
    managedVerticals,
  );
  const showInactive = url.inactive;
  const [listLost, setListLost] = useState<'mfa' | 'session' | null>(null);
  // Disabled once refused, so the observer does not rebuild the removed query and refetch in a loop.
  const query = useQuery({
    ...positionsQuery(MANAGER_POSITIONS),
    enabled: listLost === null,
  });
  const data = listLost ? undefined : query.data;
  const [dialog, setDialog] = useState<DialogState>(null);
  const [mfaLost, setMfaLost] = useState(false);
  const inactiveToggle = useRef<HTMLInputElement>(null);
  const stickyCreate = useStickyBar(8);
  /** Radix restores focus only to a Trigger, and these dialogs have none, so the view names the element itself. */
  const focusAfterClose = useRef('create');

  useEffect(
    () => () => queryClient.removeQueries({ queryKey: ['positions'] }),
    [queryClient],
  );

  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (
          event.type !== 'updated' ||
          event.mutation.options.mutationKey?.[0] !== 'positions'
        )
          return;
        if (event.action.type === 'success') setMfaLost(false);
        const error = event.mutation.state.error;
        if (
          event.action.type === 'error' &&
          error instanceof ApiError &&
          error.code === 'MFA_REQUIRED'
        )
          setMfaLost(true);
      }),
    [queryClient],
  );

  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (
          event.type !== 'updated' ||
          event.action.type !== 'error' ||
          event.query.queryKey[0] !== 'positions'
        )
          return;
        const error = event.action.error;
        if (!(error instanceof ApiError) || error.status !== 401) return;
        // SEC-POS-10: a refused refetch must not leave inactive names and counts on screen.
        queryClient.removeQueries({ queryKey: ['positions'] });
        setDialog(null);
        if (error.code === 'MFA_REQUIRED') setListLost('mfa');
        else {
          setListLost('session');
          window.location.reload();
        }
      }),
    [queryClient],
  );

  const pendingIds = new Set(
    useMutationState({
      filters: { mutationKey: POSITION_TOGGLE_KEY, status: 'pending' },
      select: (mutation) => mutation.state.variables,
    })
      .filter(isToggleVariables)
      .map(({ position }) => position.id),
  );

  const navigate = (next: { vertical?: string; inactive?: boolean }) => {
    const search = positionsSearch({
      vertical: next.vertical ?? url.vertical,
      inactive: next.inactive ?? showInactive,
    });
    window.history.replaceState(
      null,
      '',
      search ? `?${search}` : window.location.pathname,
    );
  };

  const groups = groupPositions(
    data?.items ?? [],
    managedVerticals,
    vertical,
    showInactive,
  );
  const scoped = groups.reduce((sum, group) => sum + group.total, 0);
  const visibleCount = groups.reduce(
    (sum, group) => sum + group.items.length,
    0,
  );
  const visibleRows = groups.flatMap((group) => group.items);
  const grouped = vertical === ALL_VERTICALS && managedVerticals.length > 1;
  const selected = managedVerticals.find((entry) => entry.id === vertical);
  const canCreate = managedVerticals.length > 0;
  const showCreate = Boolean(data) && scoped > 0 && canCreate;

  const openDialog = (next: NonNullable<DialogState>, returnKey: string) => {
    focusAfterClose.current = returnKey;
    setDialog(next);
  };
  const closeDialog = (focusKey?: string) => {
    if (focusKey) focusAfterClose.current = focusKey;
    setDialog(null);
  };
  const onCloseAutoFocus = (event: Event) => {
    event.preventDefault();
    focusByKey(focusAfterClose.current);
  };

  const openCreate = (
    verticalId: string | undefined = selected?.id,
    returnKey = 'create',
  ) => openDialog({ kind: 'name', target: null, verticalId }, returnKey);

  const afterDeactivation = (position: Position): string => {
    if (showInactive) return `toggle:${position.id}`;
    const index = visibleRows.findIndex((row) => row.id === position.id);
    const neighbour = visibleRows[index + 1] ?? visibleRows[index - 1];
    return neighbour ? `rename:${neighbour.id}` : 'empty';
  };

  const reactivate = (position: Position) =>
    toggle.mutate(
      { position, isActive: true },
      {
        onSuccess: () => focusByKey(`toggle:${position.id}`),
        onError: async (error) => {
          const failure = classifyFailure(error);
          if (failure !== 'stale') return notifyFailure(failure);
          const row = await refreshPosition(queryClient, position.id);
          if (row?.isActive) toast.success(t('toast.alreadyActive'));
          else notifyFailure(row ? 'stale' : 'notFound');
        },
      },
    );

  const handlers = {
    pendingIds,
    canCreate,
    onRename: (position: Position) =>
      openDialog(
        { kind: 'name', target: position, verticalId: undefined },
        `rename:${position.id}`,
      ),
    onAdd: (verticalId: string) => openCreate(verticalId, `add:${verticalId}`),
    onToggle: (position: Position) =>
      position.isActive
        ? openDialog(
            {
              kind: 'deactivate',
              target: position,
              focusAfter: afterDeactivation(position),
            },
            `toggle:${position.id}`,
          )
        : reactivate(position),
  };

  const createButton = (className: string) => (
    <Button
      onClick={() => openCreate()}
      className={className}
      data-focus-key="create"
    >
      <Plus aria-hidden="true" />
      {t('create')}
    </Button>
  );

  let body: ReactNode;
  let hasRows = false;
  if (!data) {
    body = query.isError ? (
      <SectionError
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    ) : (
      <PositionsSkeleton layout={layout} />
    );
  } else if (scoped === 0) {
    const inVertical = selected !== undefined && managedVerticals.length > 1;
    body = (
      <div tabIndex={-1} data-focus-key="empty" className="outline-none">
        <EmptyState
          icon={ListChecks}
          title={
            inVertical
              ? t('emptyVertical.title', { vertical: selected.name })
              : t('empty.title')
          }
          description={t(
            inVertical ? 'emptyVertical.description' : 'empty.description',
          )}
          action={canCreate ? createButton('h-11 md:h-10') : undefined}
        />
      </div>
    );
  } else if (visibleCount === 0) {
    body = (
      <div tabIndex={-1} data-focus-key="empty" className="outline-none">
        <EmptyState
          icon={ListChecks}
          title={t('emptyActive.title')}
          description={t('emptyActive.description')}
          action={
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                navigate({ inactive: true });
                inactiveToggle.current?.focus();
              }}
            >
              {t('emptyActive.action')}
            </Button>
          }
        />
      </div>
    );
  } else {
    hasRows = true;
    const List = layout === 'table' ? PositionTable : PositionCards;
    body = <List groups={groups} grouped={grouped} handlers={handlers} />;
  }

  return (
    <>
      <Link
        href={listHref}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'md' }),
          'mb-2 -ml-3 h-11 text-sm',
        )}
      >
        <ChevronLeft aria-hidden="true" />
        {t('backToVacancies')}
      </Link>
      <div className="max-w-5xl">
        <PageHeader
          title={t('title')}
          subtitle={
            selected
              ? t('subtitleVertical', { vertical: selected.name })
              : t('subtitle')
          }
          actions={
            showCreate ? createButton('hidden h-10 md:inline-flex') : undefined
          }
        />
      </div>
      {(mfaLost || listLost === 'mfa') && (
        <MfaRequiredAlert
          message={t('errors.mfaRequired')}
          next={`/vacancies/positions${searchKey ? `?${searchKey}` : ''}`}
        />
      )}
      {listLost === null && (
        <div className="max-w-5xl">
          <section
            aria-label={t('filtersLabel')}
            className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-1"
          >
            {managedVerticals.length > 1 && (
              <div className="w-full sm:w-64">
                <FilterSelect
                  label={t('filterVertical')}
                  value={vertical}
                  onChange={(value) => navigate({ vertical: value })}
                >
                  <option value={ALL_VERTICALS}>{t('allVerticals')}</option>
                  {managedVerticals.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </FilterSelect>
              </div>
            )}
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                ref={inactiveToggle}
                type="checkbox"
                checked={showInactive}
                onChange={(event) =>
                  navigate({ inactive: event.target.checked })
                }
                className="accent-primary size-5"
              />
              {t('showInactive')}
            </label>
          </section>
          <section
            aria-label={t('listLabel')}
            className={
              hasRows && layout === 'cards'
                ? undefined
                : 'border-border bg-surface overflow-hidden rounded-xl border shadow-sm'
            }
          >
            {body}
          </section>
          {query.isError && data && (
            <SectionError
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          )}
          <p role="status" className="text-muted-foreground mt-4 text-sm">
            {visibleCount > 0 ? t('shown', { count: visibleCount }) : null}
          </p>
          <p className="text-muted-foreground mt-2 flex items-start gap-2 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('permanentNote')}
          </p>
          {showCreate && (
            <div
              ref={stickyCreate}
              className="sticky bottom-[calc(var(--chrome-bottom)+0.5rem)] z-10 mt-4 md:hidden"
            >
              {createButton('h-12 w-full shadow-md')}
            </div>
          )}
        </div>
      )}
      {dialog?.kind === 'name' && (
        <PositionNameDialog
          key={dialog.target?.id ?? 'new'}
          target={dialog.target}
          verticals={managedVerticals}
          presetVerticalId={dialog.verticalId}
          onClose={closeDialog}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      )}
      {dialog?.kind === 'deactivate' && (
        <DeactivatePositionDialog
          key={dialog.target.id}
          target={dialog.target}
          focusAfter={dialog.focusAfter}
          onClose={closeDialog}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      )}
    </>
  );
}
