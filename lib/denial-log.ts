import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyPage } from '@/lib/schemas/vacancy';

export type DenialStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The browser surface of the denial reload, injected so units never navigate. */
export interface DenialPage {
  readonly href: () => string;
  readonly storage: () => DenialStorage;
  readonly replace: (href: string) => void;
}

interface DenialLog {
  everything: number;
  readonly byId: Map<string, number>;
  page: DenialPage | null;
  reloading: boolean;
}

const logs = new WeakMap<QueryClient, DenialLog>();

export const logOf = (client: QueryClient) => {
  const log: DenialLog = logs.get(client) ?? {
    everything: 0,
    byId: new Map(),
    page: null,
    reloading: false,
  };
  logs.set(client, log);
  return log;
};

export const isPage = (data: unknown): data is VacancyPage =>
  Array.isArray((data as Partial<VacancyPage> | null | undefined)?.items);

export const denialReloadStarted = (client: QueryClient) =>
  logOf(client).reloading;

/** Without an id the whole session ended; the counters stop late writes from refilling the cache. */
export function recordVacancyDenial(client: QueryClient, id?: string) {
  const log = logOf(client);
  const key = id?.toLowerCase();
  if (key === undefined) log.everything += 1;
  else log.byId.set(key, (log.byId.get(key) ?? 0) + 1);
}

export const recheckDetail = (client: QueryClient, id: string) =>
  client
    .invalidateQueries({ queryKey: queryKeys.vacancy(id), exact: true })
    .catch(() => undefined);
