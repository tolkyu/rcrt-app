'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Plus, Search, UsersRound } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { useRoleLabel } from '@/components/auth/use-role-label';
import { SectionError } from '@/components/states/section-error';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmailText } from '@/components/ui/email-text';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { settingsVerticalsQuery, usersQuery } from '@/lib/queries/settings';
import { ROLE_DISPLAY_ORDER } from '@/lib/roles';
import type { UserListItem } from '@/lib/schemas/user';
import {
  GLOBAL_VERTICAL,
  USER_SEARCH_MAX,
  USER_STATUSES,
} from '@/lib/user-constants';
import {
  normalizeUserQuery,
  parseDrawerUser,
  parseUserSearch,
  userFilterValues,
  userFilterList,
  userSearchSource,
  userSearchParams,
  type UserSearch,
} from '@/lib/user-filters';
import { cn } from '@/lib/utils';
import { loadOrReload } from '@/lib/load-or-reload';
import { MfaStatus, StatusChip } from './user-status';

const loadInviteDialog = () => import('./invite-user-dialog');
const InviteUserDialog = dynamic(() =>
  loadInviteDialog().then((module) => module.InviteUserDialog),
);
const preloadInviteDialog = () => {
  loadInviteDialog().catch(() => undefined);
};
const loadUserDrawer = () => import('./user-drawer');
const UserDrawer = dynamic(() =>
  loadUserDrawer().then((module) => module.UserDrawer),
);
const preloadUserDrawer = () => {
  loadUserDrawer().catch(() => undefined);
};
const loadFilterSheet = () => import('./users-filter-sheet');
const preloadFilterSheet = () => {
  loadFilterSheet().catch(() => undefined);
};
function FilterSheetLoading() {
  const t = useTranslations('auth');
  return <p role="status">{t('loading')}</p>;
}
const UsersFilterSheet = dynamic(
  () => loadOrReload(loadFilterSheet).then((module) => module.UsersFilterSheet),
  { loading: FilterSheetLoading },
);

const selectClass =
  'border-input bg-surface text-foreground h-11 w-full rounded-lg border px-3 text-base md:h-10 md:text-sm';
const SEARCH_DEBOUNCE_MS = 200;
const VISIBLE_ROLES = 2;
const COLUMNS = [
  ['user', 'min-w-60'],
  ['roles', ''],
  ['status', ''],
  ['mfa', ''],
  ['lastLogin', ''],
] as const;

/** Last sign-in is shown in Kyiv time, so «this year» is decided in Kyiv time too. */
const kyivYear = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
});

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | string[] | undefined;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  const t = useTranslations('settings.users');
  const values = userFilterList(value);
  return (
    <div className="hidden min-w-0 flex-col gap-1 md:flex">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <select
        id={id}
        value={values.length > 1 ? '__multiple' : (values[0] ?? '')}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
      >
        {values.length > 1 && (
          <option value="__multiple" disabled>
            {t('filterSelectionCount', { count: values.length })}
          </option>
        )}
        {children}
      </select>
    </div>
  );
}

function RoleChips({ user }: { user: UserListItem }) {
  const t = useTranslations('settings.users');
  const roleLabel = useRoleLabel();
  if (user.roles.length === 0)
    return (
      <span className="text-muted-foreground text-sm">{t('rolesNone')}</span>
    );
  const labels = user.roles.map((assignment) => ({
    key: `${assignment.role}:${assignment.vertical?.id ?? GLOBAL_VERTICAL}`,
    label: roleLabel(assignment.role, assignment.vertical?.name ?? null),
  }));
  const hidden = labels.slice(VISIBLE_ROLES).map((item) => item.label);
  const chip = cn(
    'inline-flex max-w-full rounded-full px-2 py-0.5 text-xs font-medium',
    user.status === 'DEACTIVATED'
      ? 'bg-surface-muted text-muted-foreground'
      : 'bg-primary-subtle text-link',
  );
  return (
    <ul className="flex flex-wrap gap-1">
      {labels.slice(0, VISIBLE_ROLES).map(({ key, label }) => (
        <li key={key} className={chip}>
          <span className="truncate">{label}</span>
        </li>
      ))}
      {hidden.length > 0 && (
        <li
          className={chip}
          title={hidden.join(', ')}
          aria-label={t('rolesMoreLabel', { roles: hidden.join(', ') })}
        >
          {t('rolesMore', { count: hidden.length })}
        </li>
      )}
    </ul>
  );
}

function useLastLogin() {
  const t = useTranslations('settings.users');
  const thisYear = kyivYear.format(new Date());
  return (value: string | null) => {
    if (!value) return t('lastLoginNever');
    const at = new Date(value);
    return kyivYear.format(at) === thisYear
      ? t('lastLogin', { at })
      : t('lastLoginOtherYear', { at });
  };
}

function UserName({ user, self }: { user: UserListItem; self: boolean }) {
  const t = useTranslations('settings.users');
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={user.fullName} />
      <span className="min-w-0">
        <span className="text-foreground block text-sm font-semibold [overflow-wrap:anywhere]">
          {user.fullName}
          {self && (
            <span className="text-muted-foreground font-normal">
              {' '}
              {t('you')}
            </span>
          )}
        </span>
        <span className="text-muted-foreground block text-xs [overflow-wrap:anywhere]">
          {user.status === 'DEACTIVATED' ? (
            t('deactivatedSuffix')
          ) : (
            <EmailText email={user.email} />
          )}
        </span>
      </span>
    </span>
  );
}

/** «Користувачі та ролі»: filters in the URL, active users first, «Показати ще» by cursor (wireframe §1.1). */
export function UsersView({
  currentUserId,
  canListVerticals,
  canReadAudit,
}: {
  currentUserId: string;
  canListVerticals: boolean;
  canReadAudit: boolean;
}) {
  const [inviting, setInviting] = useState(false);
  const t = useTranslations('settings.users');
  const tRole = useTranslations('common.roles');
  const lastLogin = useLastLogin();
  const params = useSearchParams();
  const searchKey = params.toString();
  const [filtersAt, setFiltersAt] = useState<string | null>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  if (filtersAt !== null && filtersAt !== searchKey) setFiltersAt(null);
  const [search, drawerUser] = useMemo(() => {
    const source = userSearchSource(new URLSearchParams(searchKey));
    return [parseUserSearch(source), parseDrawerUser(source)] as const;
  }, [searchKey]);
  const filters = useMemo(() => userFilterValues(search), [search]);
  const query = useInfiniteQuery(usersQuery(filters));
  const verticals = useQuery({
    ...settingsVerticalsQuery(),
    enabled: canListVerticals,
  });
  const [text, setText] = useState(search.q ?? '');
  /** A nav link back to the bare list clears the URL; the box follows unless the user is mid-typing that value. */
  const [syncedQ, setSyncedQ] = useState(search.q);
  if (search.q !== syncedQ) {
    setSyncedQ(search.q);
    if (normalizeUserQuery(text) !== search.q) setText(search.q ?? '');
  }

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** Reads the live URL so a debounced search never overwrites a filter chosen meanwhile. */
  const navigate = (
    patch: Partial<UserSearch>,
    user: (current: string | undefined) => string | undefined,
    mode: 'pushState' | 'replaceState' = 'replaceState',
  ) => {
    const live = userSearchSource(new URLSearchParams(window.location.search));
    const next = userSearchParams(
      parseUserSearch({ ...parseUserSearch(live), ...patch }),
      user(parseDrawerUser(live)),
    ).toString();
    window.history[mode](
      null,
      '',
      next ? `?${next}` : window.location.pathname,
    );
  };
  const apply = (patch: Partial<UserSearch>) =>
    navigate(patch, (current) => current);
  /** Push on open so Back closes the drawer; replace on close (same pattern as the audit record sheet). */
  const openUser = (user: string | undefined) =>
    navigate({}, () => user, user ? 'pushState' : 'replaceState');
  const opener = useRef<HTMLElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [searchFocus, setSearchFocus] = useState(0);
  useEffect(() => {
    if (!searchFocus) return;
    // Runs after the closing dialog's own focus return (Radix restores focus in a 0 ms timeout on unmount).
    const id = setTimeout(() => searchInput.current?.focus());
    return () => clearTimeout(id);
  }, [searchFocus]);
  const openFromRow = (button: HTMLElement | null, user: string) => {
    opener.current = button;
    openUser(user);
  };
  /** Focus goes back to the row that opened the drawer, or to the visible row of a drawer opened by URL (wireframe §7). */
  const restoreFocus = (user: string) => {
    const target = opener.current?.isConnected
      ? opener.current
      : Array.from(
          document.querySelectorAll<HTMLElement>(
            `button[data-user-id="${user}"]`,
          ),
        ).find((button) => button.offsetParent !== null);
    opener.current = null;
    target?.focus();
  };
  const changeText = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => apply({ q: normalizeUserQuery(value) }),
      SEARCH_DEBOUNCE_MS,
    );
  };

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const filterCount = [
    search.status,
    search.role,
    search.vertical,
  ].reduce<number>((count, value) => count + userFilterList(value).length, 0);
  const filtered = Boolean(search.q || filterCount);
  /** From the invite dialog or a user card: the card (if any) closes so the matching row is visible. */
  const showUser = (email: string) => {
    clearTimeout(timer.current);
    setInviting(false);
    setText(email);
    // A closing card returns focus to its opener; make that the search box showing the address.
    if (drawerUser) opener.current = searchInput.current;
    setSearchFocus((count) => count + 1);
    navigate(
      { q: email, status: undefined, role: undefined, vertical: undefined },
      () => undefined,
    );
  };
  /** «Активувати знову» from the invite dialog: the list shows that address and its card opens over it (D42). */
  const openDeactivatedUser = (email: string, user: string) => {
    clearTimeout(timer.current);
    setInviting(false);
    setText(email);
    opener.current = searchInput.current;
    navigate(
      { q: email, status: undefined, role: undefined, vertical: undefined },
      () => user,
      'pushState',
    );
  };
  const reset = () => {
    clearTimeout(timer.current);
    setText('');
    apply({
      q: undefined,
      status: undefined,
      role: undefined,
      vertical: undefined,
    });
  };

  let body: ReactNode;
  if (!query.data) {
    body = query.isError ? (
      <SectionError
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    ) : (
      <div className="skeleton-delayed flex flex-col gap-2 p-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={UsersRound}
        title={t('empty.title')}
        description={t('empty.description')}
        action={
          filtered ? (
            <Button variant="outline" onClick={reset}>
              {t('resetFilters')}
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('caption')}</caption>
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left text-xs">
                {COLUMNS.map(([column, width]) => (
                  <th
                    key={column}
                    scope="col"
                    className={cn('px-4 py-3 font-medium', width)}
                  >
                    {t(`columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr
                  key={user.id}
                  onClick={(event) => {
                    // A drag that selected text is not a click; keyboard clicks (detail 0) always open.
                    if (event.detail > 0 && window.getSelection()?.toString())
                      return;
                    openFromRow(
                      event.currentTarget.querySelector('button'),
                      user.id,
                    );
                  }}
                  onPointerEnter={preloadUserDrawer}
                  className={cn(
                    'border-border hover:bg-surface-muted h-14 cursor-pointer border-b align-middle last:border-0',
                    drawerUser === user.id && 'bg-primary-subtle',
                  )}
                >
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <button
                      type="button"
                      onFocus={preloadUserDrawer}
                      aria-haspopup="dialog"
                      data-user-id={user.id}
                      className="rounded-md text-left"
                    >
                      <UserName user={user} self={user.id === currentUserId} />
                    </button>
                  </th>
                  <td className="px-4 py-2">
                    <RoleChips user={user} />
                  </td>
                  <td className="px-4 py-2">
                    <StatusChip user={user} />
                  </td>
                  <td className="px-4 py-2">
                    <MfaStatus mfa={user.mfa} />
                  </td>
                  <td
                    className="text-muted-foreground px-4 py-2 whitespace-nowrap tabular-nums"
                    title={
                      user.lastLoginAt
                        ? t('lastLoginFull', { at: new Date(user.lastLoginAt) })
                        : undefined
                    }
                  >
                    {lastLogin(user.lastLoginAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul
          className="divide-border divide-y md:hidden"
          aria-label={t('caption')}
        >
          {items.map((user) => (
            <li
              key={user.id}
              onPointerEnter={preloadUserDrawer}
              className={cn(
                'hover:bg-surface-muted relative flex flex-col gap-2 p-4',
                drawerUser === user.id && 'bg-primary-subtle',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={(event) => openFromRow(event.currentTarget, user.id)}
                  onFocus={preloadUserDrawer}
                  aria-haspopup="dialog"
                  data-user-id={user.id}
                  className="min-w-0 rounded-md text-left after:absolute after:inset-0"
                >
                  <UserName user={user} self={user.id === currentUserId} />
                </button>
                <StatusChip user={user} />
              </div>
              <RoleChips user={user} />
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1">
                  {t('mfaLabel')}
                  <MfaStatus mfa={user.mfa} />
                </span>
                <span className="tabular-nums">
                  {t('lastLoginMobile', { at: lastLogin(user.lastLoginAt) })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button
            onClick={() => setInviting(true)}
            onPointerEnter={preloadInviteDialog}
            onFocus={preloadInviteDialog}
          >
            <Plus aria-hidden="true" />
            {t('invite')}
          </Button>
        }
      />
      <section
        aria-label={t('filtersLabel')}
        className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] gap-3 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]"
      >
        <div className="flex min-w-0 flex-col gap-1 md:col-span-2 xl:col-span-1">
          <Label htmlFor="users-search" className="text-xs">
            {t('searchLabel')}
          </Label>
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              ref={searchInput}
              id="users-search"
              type="search"
              value={text}
              maxLength={USER_SEARCH_MAX}
              placeholder={t('searchPlaceholder')}
              aria-describedby="users-search-hint"
              onChange={(event) => changeText(event.target.value)}
              className="pl-9"
            />
          </div>
          <span id="users-search-hint" className="sr-only">
            {t('searchHint')}
          </span>
        </div>
        <Button
          ref={filterTrigger}
          variant="outline"
          className="h-11 self-end md:hidden"
          aria-haspopup="dialog"
          aria-expanded={filtersAt !== null}
          onPointerEnter={preloadFilterSheet}
          onFocus={preloadFilterSheet}
          onClick={() => setFiltersAt(searchKey)}
        >
          {filterCount
            ? t('filtersCount', { count: filterCount })
            : t('filters')}
        </Button>
        <FilterSelect
          label={t('filterStatus')}
          value={search.status ?? ''}
          onChange={(value) =>
            apply({ status: USER_STATUSES.find((status) => status === value) })
          }
        >
          <option value="">{t('all')}</option>
          {USER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label={t('filterRole')}
          value={search.role ?? ''}
          onChange={(value) =>
            apply({ role: ROLE_DISPLAY_ORDER.find((role) => role === value) })
          }
        >
          <option value="">{t('all')}</option>
          {ROLE_DISPLAY_ORDER.map((role) => (
            <option key={role} value={role}>
              {tRole(role)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label={t('filterVertical')}
          value={search.vertical ?? ''}
          onChange={(value) => apply({ vertical: value || undefined })}
        >
          <option value="">{t('all')}</option>
          {verticals.data?.items.map((vertical) => (
            <option key={vertical.id} value={vertical.id}>
              {vertical.name}
            </option>
          ))}
          {userFilterList(search.vertical)
            .filter(
              (id) =>
                id !== GLOBAL_VERTICAL &&
                !verticals.data?.items.some((v) => v.id === id),
            )
            .map((id) => (
              <option key={id} value={id}>
                {t('unknownVertical')}
              </option>
            ))}
          <option value={GLOBAL_VERTICAL}>{t('globalVertical')}</option>
        </FilterSelect>
      </section>
      {filtered && (
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 md:min-h-0"
            onClick={reset}
          >
            {t('resetFilters')}
          </Button>
        </div>
      )}
      {filtersAt !== null && (
        <UsersFilterSheet
          search={search}
          verticals={verticals.data?.items ?? []}
          onClose={() => setFiltersAt(null)}
          onRestoreFocus={() => filterTrigger.current?.focus()}
          onReset={() => {
            reset();
            setFiltersAt(null);
          }}
          onApply={(draft) => {
            apply(draft);
            setFiltersAt(null);
          }}
        />
      )}
      <Card className="overflow-hidden p-0">{body}</Card>
      {query.isError && query.data && (
        <SectionError
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}
      {items.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <span className="text-muted-foreground text-sm" aria-live="polite">
            {t('shownOf', { shown: items.length, total })}
          </span>
          {query.hasNextPage && (
            <Button
              variant="outline"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {t('loadMore')}
            </Button>
          )}
        </div>
      )}
      {inviting && (
        <InviteUserDialog
          verticals={verticals.data?.items ?? []}
          verticalsState={
            verticals.data
              ? 'success'
              : verticals.isError || !canListVerticals
                ? 'error'
                : 'pending'
          }
          onRetryVerticals={() => void verticals.refetch()}
          canManageVerticals={canListVerticals}
          onClose={() => setInviting(false)}
          onShowUser={showUser}
          onOpenUser={openDeactivatedUser}
        />
      )}
      {drawerUser && (
        <UserDrawer
          userId={drawerUser}
          cached={items.find((user) => user.id === drawerUser)}
          currentUserId={currentUserId}
          canReadAudit={canReadAudit}
          canListVerticals={canListVerticals}
          onClose={() => openUser(undefined)}
          onRestoreFocus={() => restoreFocus(drawerUser)}
          onShowUser={showUser}
        />
      )}
    </>
  );
}
