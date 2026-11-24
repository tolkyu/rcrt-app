import {
  hashKey,
  type QueryClient,
  type QueryFilters,
  type QueryKey,
} from '@tanstack/react-query';
import { ApiError, isSessionLoss } from '@/lib/api-client';
import {
  isPage,
  logOf,
  recheckDetail,
  recordVacancyDenial,
  type DenialPage,
  type DenialStorage,
} from '@/lib/denial-log';
import { releaseDenialGuards } from '@/lib/denial-release';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyPage } from '@/lib/schemas/vacancy';

export type { DenialPage };

const RELOAD_MARKS = 'vacancy-denial-reload';
const SESSION_RELOAD_AT = 'vacancy-denial-at';

export const browserDenialPage = (): DenialPage | null =>
  typeof window === 'undefined'
    ? null
    : {
        // A fragment-only difference would make location.replace a same-document jump instead of a reload.
        href: () => window.location.href.replace(/#.*/, ''),
        storage: () => window.sessionStorage,
        replace: (href) => window.location.replace(href),
      };

export function connectDenialPage(
  client: QueryClient,
  page: DenialPage | null,
) {
  logOf(client).page = page;
}

/** Anything but a mark list (corrupt or older data) counts as empty and is overwritten by the next mark. */
function readMarks(storage: DenialStorage) {
  const raw = storage.getItem(RELOAD_MARKS) ?? '';
  return /^[\da-z,]*$/.test(raw) ? raw.split(',') : [];
}

/** FNV-style hash, because URLs and list keys can carry the raw `q` search and must not reach storage. */
function markOf(href: string, queryKey: QueryKey) {
  let hash = 0;
  for (const char of href + hashKey(queryKey))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

/** Each denied key reloads once per URL and a lost session once per 30 s; without readable storage nothing could stop a loop, so there is no reload. */
function recordAndReload(
  client: QueryClient,
  queryKey?: QueryKey,
  id?: string,
) {
  recordVacancyDenial(client, id);
  const log = logOf(client);
  if (log.reloading || !log.page) return;
  try {
    const storage = log.page.storage();
    const href = log.page.href();
    const now = Date.now();
    const marks = readMarks(storage);
    const mark = queryKey && markOf(href, queryKey);
    const slot = mark ? RELOAD_MARKS : SESSION_RELOAD_AT;
    // Absolute, so a stamp from a clock moved back cannot block every later reload.
    if (
      mark
        ? marks.includes(mark)
        : Math.abs(now - Number(storage.getItem(slot))) < 3e4
    )
      return;
    const value = mark ? [...marks, mark].join() : `${now}`;
    storage.setItem(slot, value);
    if (storage.getItem(slot) !== value) return;
    log.reloading = true;
    releaseDenialGuards();
    log.page.replace(href);
  } catch {
    log.reloading = false;
  }
}

/** A persisted page holds the old document in memory, so it is read from the server again. */
export function reloadRestoredPage(
  reload: () => void = () => window.location.reload(),
) {
  const onShow = (event: PageTransitionEvent) => {
    if (event.persisted) reload();
  };
  window.addEventListener('pageshow', onShow);
  return () => window.removeEventListener('pageshow', onShow);
}

/** A mounted query keeps its object in the error state: removing it would make the next render build a new query and refetch, a request loop. */
function purge(client: QueryClient, error: ApiError, filters?: QueryFilters) {
  const cache = client.getQueryCache();
  for (const query of cache.findAll(filters)) {
    void query.cancel({ revert: true });
    // Stripped before removal too: an observer keeps the last query with data as its `keepPreviousData` source.
    query.setState({
      data: undefined,
      dataUpdatedAt: 0,
      error,
      errorUpdatedAt: Date.now(),
      status: 'error',
      fetchStatus: 'idle',
      isInvalidated: true,
    });
    if (!query.getObserversCount()) cache.remove(query);
  }
}

function dropRow(client: QueryClient, id: string) {
  let dropped = false;
  const queryKey = queryKeys.vacanciesAll();
  for (const [key, data] of client.getQueriesData({ queryKey })) {
    if (!isPage(data)) continue;
    const items = data.items.filter((row) => row.id !== id);
    if (items.length === data.items.length) continue;
    dropped = true;
    client.setQueryData<VacancyPage>(key, { ...data, items });
  }
  if (dropped) client.invalidateQueries({ queryKey }).catch(() => undefined);
}

/** Only detail and content need `vacancy.read` alone; picker and write routes also gate on an action grant, so their 404 is proved by a card read. */
export function handleVacancyQueryError(
  client: QueryClient,
  error: unknown,
  queryKey: QueryKey,
) {
  if (!(error instanceof ApiError)) return;
  if (isSessionLoss(error)) {
    purge(client, error);
    recordAndReload(client);
    return;
  }
  const [root, id, part] = queryKey;
  if (root === 'vacancies') {
    // The draft count has a string second segment and its own gate, so its error proves nothing about list access.
    const listRead = typeof id === 'object' && id !== null;
    if (listRead && (error.status === 404 || error.code === 'MFA_REQUIRED')) {
      purge(client, error, { queryKey: queryKeys.vacanciesAll() });
      purge(client, error, { queryKey: queryKeys.vacancyAll() });
      recordAndReload(client, queryKey);
    }
    return;
  }
  if (root !== 'vacancy' || typeof id !== 'string') return;
  if (part === undefined || part === 'content') {
    if (![401, 403, 404].includes(error.status)) return;
    purge(client, error, { queryKey: queryKeys.vacancy(id) });
    dropRow(client, id);
    recordAndReload(client, queryKey, id);
  } else if (error.status === 401 || error.status === 404)
    void recheckDetail(client, id);
}

/** Only a fetch of the key that was denied clears its mark: a sibling read or hydrated data could otherwise re-arm a reload loop. */
export function noteVacancyRead(client: QueryClient, queryKey: QueryKey) {
  const { page } = logOf(client);
  if (!page) return;
  try {
    const storage = page.storage();
    const marks = readMarks(storage);
    const mark = markOf(page.href(), queryKey);
    if (marks.includes(mark))
      storage.setItem(
        RELOAD_MARKS,
        marks.filter((kept) => kept !== mark).join(),
      );
  } catch {
    return;
  }
}
