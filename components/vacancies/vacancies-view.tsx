'use client';

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  BriefcaseBusiness,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { PositionsEntryLink } from '@/components/positions/positions-entry-link';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { SectionError } from '@/components/states/section-error';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { vacanciesQuery, vacancyDetailQuery } from '@/lib/queries/vacancies';
import { verticalsQuery } from '@/lib/queries/verticals';
import { useWideScreen } from '@/lib/use-wide-screen';
import {
  hasVacancyFilters,
  parseVacancyPageState,
  VACANCY_SEARCH_MAX,
  VACANCY_STATUSES,
  withVacancyFilters,
  withVacancyPage,
  withVacancySelection,
} from '@/lib/vacancy-filters';
import { rememberVacancyList } from '@/lib/vacancy-list-memory';
import { navigateVacancies as navigate } from '@/lib/vacancy-navigation';
import { ALL_VERTICALS } from '@/lib/vertical-filter';
import { VacanciesList } from './vacancies-list';
import { VacancyPreview } from './vacancy-preview';

const SEARCH_DEBOUNCE_MS = 300;

function ListSkeleton() {
  const t = useTranslations('states');
  return (
    <div role="status" className="skeleton-delayed flex flex-col gap-2 p-4">
      <span className="sr-only">{t('loading')}</span>
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

/** «Вакансії»: filters, cursor and preview selection live in the URL (VAC-04); one page of at most 100 rows is retained. */
export function VacanciesView({
  canManagePositions,
}: {
  canManagePositions: boolean;
}) {
  const t = useTranslations('vacancies');
  const params = useSearchParams();
  const searchKey = params.toString();
  const state = useMemo(
    () => parseVacancyPageState(new URLSearchParams(searchKey)),
    [searchKey],
  );
  const { filters } = state;
  const wide = useWideScreen();
  const queryClient = useQueryClient();
  useEffect(() => rememberVacancyList(searchKey), [searchKey]);
  const query = useQuery({
    ...vacanciesQuery(filters),
    placeholderData: keepPreviousData,
  });
  const verticals = useQuery(verticalsQuery());
  const [text, setText] = useState(filters.q ?? '');
  /** Back/Forward or a reset changes the URL under the box; it follows unless the user is mid-typing that value. */
  const [syncedQ, setSyncedQ] = useState(filters.q);
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q);
    if (text.trim() !== (filters.q ?? '')) setText(filters.q ?? '');
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const results = useRef<HTMLElement>(null);
  const focusResults = useRef(false);
  const items = query.data?.items ?? [];
  const settled = Boolean(query.data) && !query.isPlaceholderData;
  useEffect(() => {
    if (!focusResults.current || !settled) return;
    focusResults.current = false;
    results.current?.focus();
  }, [settled, query.data]);

  /** A cursor is only a position; an empty page behind one means its rows are gone, so the list restarts. */
  const orphanCursor = Boolean(filters.cursor) && settled && items.length === 0;
  useEffect(() => {
    if (orphanCursor)
      navigate((current) => withVacancyFilters(current, {}), 'replaceState');
  }, [orphanCursor]);

  const changeText = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () =>
        navigate(
          (current) =>
            withVacancyFilters(current, { q: value.trim() || undefined }),
          'replaceState',
        ),
      SEARCH_DEBOUNCE_MS,
    );
  };
  const reset = () => {
    clearTimeout(timer.current);
    setText('');
    navigate(
      (current) =>
        withVacancyFilters(current, {
          q: undefined,
          vertical: clearedVertical,
          status: undefined,
        }),
      'replaceState',
    );
  };
  const page = (cursor: string, direction: 'older' | 'newer') => {
    focusResults.current = true;
    navigate(
      (current) => withVacancyPage(current, cursor, direction),
      'pushState',
    );
  };

  const select = useCallback(
    (id: string) =>
      navigate((current) => withVacancySelection(current, id), 'replaceState'),
    [],
  );
  const prefetchPreview = useCallback(
    (id: string) => void queryClient.prefetchQuery(vacancyDetailQuery(id)),
    [queryClient],
  );

  const filtered = hasVacancyFilters(state);
  const emptyResult = Boolean(query.data) && items.length === 0;
  const selectedId = state.selected ?? items[0]?.id;
  const visibleVerticals = verticals.data?.items ?? [];
  /** With several verticals a cleared filter is written as `vertical=all`, so the header preset cannot bring a vertical back (D83). */
  const clearedVertical =
    visibleVerticals.length > 1 ? ALL_VERTICALS : undefined;
  const unknownVertical =
    filters.vertical &&
    !visibleVerticals.some((vertical) => vertical.id === filters.vertical);

  let body: ReactNode;
  if (!query.data) {
    body = query.isError ? (
      <SectionError
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    ) : (
      <ListSkeleton />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={BriefcaseBusiness}
        title={t(filtered ? 'filteredEmpty.title' : 'empty.title')}
        description={t(
          filtered ? 'filteredEmpty.description' : 'empty.description',
        )}
        action={
          filtered ? (
            <Button variant="outline" className="h-11" onClick={reset}>
              {t('resetFilters')}
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <VacanciesList
        items={items}
        selectedId={selectedId}
        wide={wide}
        onSelect={select}
        onPreviewIntent={prefetchPreview}
      />
    );
  }

  const nextCursor = query.data?.nextCursor ?? null;
  const prevCursor = query.data?.prevCursor ?? null;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={canManagePositions ? <PositionsEntryLink /> : undefined}
      />
      <section
        aria-label={t('filtersLabel')}
        className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]"
      >
        <div className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
          <Label htmlFor="vacancies-search" className="text-xs">
            {t('searchLabel')}
          </Label>
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id="vacancies-search"
              type="search"
              value={text}
              maxLength={VACANCY_SEARCH_MAX}
              placeholder={t('searchPlaceholder')}
              aria-describedby="vacancies-search-hint"
              onChange={(event) => changeText(event.target.value)}
              className="pl-9"
            />
          </div>
          <span id="vacancies-search-hint" className="sr-only">
            {t('searchHint')}
          </span>
        </div>
        <FilterSelect
          label={t('filterVertical')}
          value={filters.vertical ?? ''}
          onChange={(value) =>
            navigate(
              (current) =>
                withVacancyFilters(current, {
                  vertical: value || clearedVertical,
                }),
              'replaceState',
            )
          }
        >
          <option value="">{t('all')}</option>
          {visibleVerticals.map((vertical) => (
            <option key={vertical.id} value={vertical.id}>
              {vertical.name}
            </option>
          ))}
          {unknownVertical && (
            <option value={filters.vertical}>{t('unknownVertical')}</option>
          )}
        </FilterSelect>
        <FilterSelect
          label={t('filterStatus')}
          value={filters.status ?? ''}
          onChange={(value) =>
            navigate(
              (current) =>
                withVacancyFilters(current, {
                  status: VACANCY_STATUSES.find((status) => status === value),
                }),
              'replaceState',
            )
          }
        >
          <option value="">{t('all')}</option>
          {VACANCY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </FilterSelect>
      </section>
      {filtered && !emptyResult && (
        <div className="mb-4">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={reset}
          >
            {t('resetFilters')}
          </Button>
        </div>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <section
            ref={results}
            tabIndex={-1}
            aria-label={t('resultsLabel')}
            aria-busy={query.isPlaceholderData}
            className="outline-none"
          >
            <Card
              className={
                query.isPlaceholderData
                  ? 'overflow-hidden p-0 opacity-60 transition-opacity'
                  : 'overflow-hidden p-0'
              }
            >
              {body}
            </Card>
          </section>
          {query.isError && query.data && (
            <SectionError
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-muted-foreground text-sm">
              {query.isPlaceholderData
                ? t('refreshing')
                : items.length > 0
                  ? t('shown', { count: items.length })
                  : null}
            </p>
            {(prevCursor || nextCursor) && (
              <nav aria-label={t('paging')} className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={!prevCursor || query.isPlaceholderData}
                  onClick={() => prevCursor && page(prevCursor, 'newer')}
                >
                  <ChevronLeft aria-hidden="true" />
                  {t('newer')}
                </Button>
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={!nextCursor || query.isPlaceholderData}
                  onClick={() => nextCursor && page(nextCursor, 'older')}
                >
                  {t('older')}
                  <ChevronRight aria-hidden="true" />
                </Button>
              </nav>
            )}
          </div>
        </div>
        <aside aria-label={t('previewLabel')} className="hidden xl:block">
          {wide && selectedId && (
            <Card className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto">
              <VacancyPreview id={selectedId} />
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
