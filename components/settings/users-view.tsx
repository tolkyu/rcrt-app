'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, Lock, Search, UsersRound } from 'lucide-react';
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
  parseUserSearch,
  userFilterValues,
  userSearchParams,
  type UserSearch,
} from '@/lib/user-filters';
import { cn } from '@/lib/utils';

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

const STATUS_DOT = {
  ACTIVE: 'bg-success',
  INVITED: 'bg-primary',
  INVITE_EXPIRED: 'bg-warning',
  REVOKED: 'bg-muted-foreground',
  DEACTIVATED: 'border-muted-foreground border border-dashed',
} as const satisfies Record<UserListItem['status'], string>;

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
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
      >
        {children}
      </select>
    </div>
  );
}

function StatusChip({ user }: { user: UserListItem }) {
  const t = useTranslations('settings.users');
  return (
    <span className="inline-flex flex-col">
      <span className="text-foreground inline-flex items-center gap-2 text-sm">
        <span
          aria-hidden="true"
          className={cn(
            'size-2 shrink-0 rounded-full',
            STATUS_DOT[user.status],
          )}
        />
        {t(`status.${user.status}`)}
      </span>
      {user.status === 'INVITED' && user.inviteExpiresAt && (
        <span className="text-muted-foreground pl-4 text-xs tabular-nums">
          {t('inviteUntil', { at: new Date(user.inviteExpiresAt) })}
        </span>
      )}
    </span>
  );
}

function MfaStatus({ mfa }: { mfa: UserListItem['mfa'] }) {
  const t = useTranslations('settings.users.mfa');
  switch (mfa.state) {
    case 'ENABLED':
      return (
        <span className="text-success-text inline-flex items-center gap-1 whitespace-nowrap">
          <Check className="size-4" aria-hidden="true" />
          {t('enabled', { count: mfa.factors })}
        </span>
      );
    case 'REQUIRED_MISSING':
      return (
        <span className="text-warning-text inline-flex items-center gap-1">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {t('requiredMissing')}
        </span>
      );
    case 'LOCKED':
      return mfa.lockedUntil ? (
        <span className="text-error-text inline-flex items-center gap-1 whitespace-nowrap">
          <Lock className="size-4" aria-hidden="true" />
          {t('locked', { at: new Date(mfa.lockedUntil) })}
        </span>
      ) : null;
    case 'OFF':
      return (
        <span className="text-muted-foreground whitespace-nowrap">
          {t('off')}
        </span>
      );
    case 'NONE':
      return <span className="text-muted-foreground">{t('none')}</span>;
  }
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
          {user.status === 'DEACTIVATED' ? t('deactivatedSuffix') : user.email}
        </span>
      </span>
    </span>
  );
}

/** «Користувачі та ролі»: filters in the URL, active users first, «Показати ще» by cursor (wireframe §1.1). */
export function UsersView({
  currentUserId,
  canListVerticals,
}: {
  currentUserId: string;
  canListVerticals: boolean;
}) {
  const t = useTranslations('settings.users');
  const tRole = useTranslations('common.roles');
  const lastLogin = useLastLogin();
  const params = useSearchParams();
  const searchKey = params.toString();
  const search = useMemo(
    () => parseUserSearch(Object.fromEntries(new URLSearchParams(searchKey))),
    [searchKey],
  );
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
  const apply = (patch: Partial<UserSearch>) => {
    const current = parseUserSearch(
      Object.fromEntries(new URLSearchParams(window.location.search)),
    );
    const next = userSearchParams({ ...current, ...patch }).toString();
    window.history.replaceState(
      null,
      '',
      next ? `?${next}` : window.location.pathname,
    );
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
  const filtered = Boolean(
    search.q || search.status || search.role || search.vertical,
  );
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
                  className="border-border h-14 border-b align-middle last:border-0"
                >
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <UserName user={user} self={user.id === currentUserId} />
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
            <li key={user.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <UserName user={user} self={user.id === currentUserId} />
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
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <section
        aria-label={t('filtersLabel')}
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]"
      >
        <div className="flex min-w-0 flex-col gap-1 sm:col-span-2 xl:col-span-1">
          <Label htmlFor="users-search" className="text-xs">
            {t('searchLabel')}
          </Label>
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
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
          {search.vertical &&
            search.vertical !== GLOBAL_VERTICAL &&
            !verticals.data?.items.some((v) => v.id === search.vertical) && (
              <option value={search.vertical}>{t('unknownVertical')}</option>
            )}
          <option value={GLOBAL_VERTICAL}>{t('globalVertical')}</option>
        </FilterSelect>
      </section>
      {filtered && (
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={reset}>
            {t('resetFilters')}
          </Button>
        </div>
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
    </>
  );
}
