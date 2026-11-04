import { BUILTIN_ROLE_CODES, type BuiltinRole } from '@/server/authz/types';
import {
  GLOBAL_VERTICAL,
  USER_SEARCH_MAX,
  USER_SEARCH_MIN,
  USER_STATUSES,
  type UserStatus,
} from './user-constants';

/** «Користувачі та ролі» filters kept in the URL (wireframe settings-admin §0); also the API query. */
export interface UserSearch {
  readonly q?: string | undefined;
  readonly status?: UserStatus | UserStatus[] | undefined;
  readonly role?: BuiltinRole | BuiltinRole[] | undefined;
  /** A vertical id or `GLOBAL`. */
  readonly vertical?: string | string[] | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = ['q', 'status', 'role', 'vertical'] as const;

type SearchSource = Readonly<Record<string, string | string[] | undefined>>;

export const userFilterList = <T extends string>(
  value: T | T[] | undefined,
): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

/** Stable order makes repeated URL filters share the same RSC/client cache key. */
function selected<T extends string>(
  value: string | string[] | undefined,
  valid: (entry: string) => entry is T,
) {
  const values = [...new Set(userFilterList(value).filter(valid))]
    .sort()
    .slice(0, 10);
  return values.length > 1 ? values : values[0];
}

export function userSearchSource(params: URLSearchParams): SearchSource {
  return Object.fromEntries(
    [...new Set(params.keys())].map((key) => {
      const values = params.getAll(key);
      return [key, values.length > 1 ? values : values[0]];
    }),
  );
}

function one(source: SearchSource, key: string) {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

/** Search shorter than the API minimum means «no search yet», not an error. */
export function normalizeUserQuery(value: string | undefined) {
  const trimmed = value?.trim().slice(0, USER_SEARCH_MAX);
  return trimmed && trimmed.length >= USER_SEARCH_MIN ? trimmed : undefined;
}

/** Unknown or malformed values are dropped instead of failing the page. */
export function parseUserSearch(source: SearchSource): UserSearch {
  return {
    q: normalizeUserQuery(one(source, 'q')),
    status: selected(source.status, (value): value is UserStatus =>
      USER_STATUSES.some((known) => known === value),
    ),
    role: selected(source.role, (value): value is BuiltinRole =>
      BUILTIN_ROLE_CODES.some((known) => known === value),
    ),
    vertical: selected(
      source.vertical &&
        userFilterList(source.vertical).map((value) =>
          value === GLOBAL_VERTICAL ? value : value.toLowerCase(),
        ),
      (value): value is string => value === GLOBAL_VERTICAL || UUID.test(value),
    ),
  };
}

/** The open «Картка користувача» (`?user=<id>`); kept out of `UserSearch`, which is also the API query. */
export function parseDrawerUser(source: SearchSource): string | undefined {
  const user = one(source, 'user');
  return user && UUID.test(user) ? user.toLowerCase() : undefined;
}

export function userSearchParams(search: UserSearch, user?: string) {
  const params = new URLSearchParams();
  const canonical = parseUserSearch({ ...search });
  for (const key of KEYS) {
    const value = canonical[key];
    for (const entry of userFilterList(value)) params.append(key, entry);
  }
  if (user) params.set('user', user);
  return params;
}

export function userFilterValues(search: UserSearch) {
  return Object.fromEntries(
    KEYS.flatMap((key) => (search[key] ? [[key, search[key]]] : [])),
  ) as Readonly<Record<(typeof KEYS)[number], string | string[] | undefined>>;
}
