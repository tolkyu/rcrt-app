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
  readonly status?: UserStatus | undefined;
  readonly role?: BuiltinRole | undefined;
  /** A vertical id or `GLOBAL`. */
  readonly vertical?: string | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = ['q', 'status', 'role', 'vertical'] as const;

type SearchSource = Readonly<Record<string, string | string[] | undefined>>;

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
  const status = one(source, 'status');
  const role = one(source, 'role');
  const vertical = one(source, 'vertical');
  return {
    q: normalizeUserQuery(one(source, 'q')),
    status: USER_STATUSES.find((known) => known === status),
    role: BUILTIN_ROLE_CODES.find((known) => known === role),
    vertical:
      vertical && (vertical === GLOBAL_VERTICAL || UUID.test(vertical))
        ? vertical
        : undefined,
  };
}

/** The open «Картка користувача» (`?user=<id>`); kept out of `UserSearch`, which is also the API query. */
export function parseDrawerUser(source: SearchSource): string | undefined {
  const user = one(source, 'user');
  return user && UUID.test(user) ? user.toLowerCase() : undefined;
}

export function userSearchParams(search: UserSearch, user?: string) {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const value = search[key];
    if (value) params.set(key, value);
  }
  if (user) params.set('user', user);
  return params;
}

export function userFilterValues(search: UserSearch) {
  return Object.fromEntries(
    KEYS.flatMap((key) => (search[key] ? [[key, search[key]]] : [])),
  ) as Readonly<Record<(typeof KEYS)[number], string | undefined>>;
}
