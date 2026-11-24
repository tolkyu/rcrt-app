'use client';

import {
  hashKey,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { ApiError, isSessionLoss } from '@/lib/api-client';
import { vacancyContentQuery } from '@/lib/queries/vacancy-content';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyContentRead } from '@/lib/schemas/vacancy-content';
import { isEditableStatus } from '@/lib/vacancy-content-form';
import { denialReloadStarted, recordVacancyDenial } from '@/lib/denial-log';
import { isVacancyClosed } from '@/lib/vacancy-closed';

type Denial = {
  readonly reason: 'session' | 'notFound';
  readonly code: string;
};
export type VacancyContentAccessState =
  | { readonly kind: 'checking'; readonly error: Error | null }
  | {
      readonly kind: 'readable';
      readonly content: VacancyContentRead;
      readonly refreshing: boolean;
      readonly canEdit: boolean;
    }
  | ({ readonly kind: 'unavailable' } & Denial);
export interface ContentAccessGeneration {
  readonly isCurrent: () => boolean;
}

class AccessScope {
  private active = true;
  private generation = 0;
  private read = 0;
  private gate: {
    readonly writing: boolean;
    readonly denial: Denial | null;
    readonly fresh: boolean;
  } = { writing: false, denial: null, fresh: false };
  private stopWatchingReads: (() => void) | null = null;
  private readonly tokens = new WeakSet<ContentAccessGeneration>();
  private readonly listeners = new Set<() => void>();
  constructor(
    readonly id: string,
    readonly client: QueryClient,
  ) {}
  readonly snapshot = () => this.gate;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** ADR-020: pause automatic reads synchronously, before React renders the write gate. */
  readonly enabled = () =>
    this.active &&
    !this.gate.writing &&
    this.gate.denial === null &&
    !isVacancyClosed(this.client, this.id);
  private update(gate: typeof this.gate) {
    this.gate = gate;
    for (const listener of this.listeners) listener();
  }
  /** Query counters move on hydration and `setQueryData`, so only the latest network outcome of the live query object proves access. */
  activate() {
    this.active = true;
    const hash = hashKey(queryKeys.vacancyContent(this.id));
    const cache = this.client.getQueryCache();
    this.stopWatchingReads = cache.subscribe((event) => {
      const live = cache.get(hash);
      let fresh = this.gate.fresh;
      if (event.type === 'removed') {
        if (event.query.queryHash === hash && !live) fresh = false;
      } else if (event.type === 'updated' && event.query === live) {
        if (
          event.action.type === 'error' ||
          event.action.type === 'failed' ||
          event.query.state.status !== 'success'
        )
          fresh = false;
        else if (event.action.type === 'success' && !event.action.manual)
          fresh = true;
      }
      if (fresh !== this.gate.fresh) this.update({ ...this.gate, fresh });
    });
  }
  close() {
    this.active = false;
    this.generation += 1;
    this.stopWatchingReads?.();
    this.stopWatchingReads = null;
    this.gate = { ...this.gate, fresh: false };
  }
  current(token?: ContentAccessGeneration) {
    return (
      this.active &&
      this.gate.denial === null &&
      (!token || (this.tokens.has(token) && token.isCurrent()))
    );
  }
  lose(denial: Denial) {
    if (!this.current()) return false;
    this.generation += 1;
    this.update({ ...this.gate, writing: false, denial });
    return true;
  }
  begin() {
    if (!this.current() || this.gate.writing) return null;
    const generation = ++this.generation;
    const token: ContentAccessGeneration = {
      isCurrent: () => this.current() && this.generation === generation,
    };
    this.tokens.add(token);
    this.update({ ...this.gate, writing: true });
    return token;
  }
  startRead(token?: ContentAccessGeneration) {
    if (!this.current(token) || (this.gate.writing && !token)) return null;
    const generation = this.generation;
    const read = ++this.read;
    return () =>
      this.current(token) &&
      this.generation === generation &&
      this.read === read;
  }
  resume() {
    this.update({ ...this.gate, writing: false });
  }
}
/** Applies to GET errors only: a read 403 means vacancy.read was lost; PATCH 403 goes through handleWriteError. */
const terminalDenial = (error: unknown): Denial | null =>
  error instanceof ApiError &&
  (error.status === 401 || error.status === 403 || error.status === 404)
    ? {
        reason: isSessionLoss(error) ? 'session' : 'notFound',
        code: error.code,
      }
    : null;

export function useVacancyContentAccess(vacancyId: string) {
  const id = vacancyId.toLowerCase();
  const queryClient = useQueryClient();
  const router = useRouter();
  const scope = useMemo(
    () => new AccessScope(id, queryClient),
    [id, queryClient],
  );
  const gate = useSyncExternalStore(
    scope.subscribe,
    scope.snapshot,
    scope.snapshot,
  );
  const query = useQuery({
    ...vacancyContentQuery(id),
    enabled: scope.enabled,
    subscribed: gate.denial === null,
  });
  const { refetch } = query;
  const observedDenial = terminalDenial(query.error);
  const denial = gate.denial ?? observedDenial;
  // A session 401 gets one retry first, so it must not flash the error card.
  const failure =
    query.error ??
    (isSessionLoss(query.failureReason) ? null : query.failureReason);
  const state: VacancyContentAccessState = denial
    ? { kind: 'unavailable', ...denial }
    : failure || !query.isSuccess || !gate.fresh
      ? { kind: 'checking', error: failure }
      : {
          kind: 'readable',
          content: query.data,
          refreshing: query.isFetching || gate.writing,
          canEdit:
            query.data.canEditContent &&
            isEditableStatus(query.data.status) &&
            !query.isFetching &&
            !gate.writing,
        };

  const deny = useCallback(
    (lost: Denial) => {
      if (!scope.lose(lost)) return;
      if (lost.reason === 'session') {
        void queryClient.cancelQueries().catch(() => undefined);
        queryClient.clear();
        recordVacancyDenial(queryClient);
        // Without the reload (storage blocked, already reloaded) only the server guard can leave the session skeleton.
        if (!denialReloadStarted(queryClient)) router.refresh();
      } else {
        // The prefix also covers the card's metadata and recruiter picker.
        const filter = { queryKey: queryKeys.vacancy(id) };
        void queryClient.cancelQueries(filter).catch(() => undefined);
        queryClient.removeQueries(filter);
        recordVacancyDenial(queryClient, id);
      }
    },
    [id, queryClient, router, scope],
  );

  useLayoutEffect(() => {
    if (observedDenial) deny(observedDenial);
  }, [observedDenial, deny]);
  useLayoutEffect(() => {
    scope.activate();
    return () => {
      scope.close();
    };
  }, [scope]);
  // Server-stamped data can look fresh to this clock and hydration can clear an error; either would otherwise leave no read running.
  const needsRead =
    !denial &&
    !failure &&
    !gate.fresh &&
    !gate.writing &&
    query.fetchStatus === 'idle';
  useEffect(() => {
    if (needsRead && scope.enabled())
      refetch({ cancelRefetch: false }).catch(() => undefined);
  }, [needsRead, refetch, scope]);

  const revalidate = useCallback(
    async (
      token?: ContentAccessGeneration,
    ): Promise<VacancyContentRead | null> => {
      const stillCurrent = scope.startRead(token);
      if (!stillCurrent) return null;
      await queryClient.cancelQueries({
        queryKey: queryKeys.vacancyContent(id),
        exact: true,
      });
      if (!stillCurrent()) return null;
      scope.resume();
      const result = await refetch({ cancelRefetch: true });
      if (!stillCurrent()) return null;
      const lost = terminalDenial(result.error);
      if (lost) {
        deny(lost);
        return null;
      }
      return result.isSuccess ? result.data : null;
    },
    [deny, id, refetch, queryClient, scope],
  );

  const canStartWrite = state.kind === 'readable' && state.canEdit;
  const beginWrite =
    useCallback(async (): Promise<ContentAccessGeneration | null> => {
      if (!canStartWrite) return null;
      const token = scope.begin();
      if (!token) return null;
      await queryClient.cancelQueries({
        queryKey: queryKeys.vacancyContent(id),
        exact: true,
      });
      return token.isCurrent() ? token : null;
    }, [canStartWrite, id, queryClient, scope]);

  const finishWrite = useCallback(
    (token: ContentAccessGeneration): Promise<VacancyContentRead | null> =>
      token.isCurrent() ? revalidate(token) : Promise.resolve(null),
    [revalidate],
  );
  const handleWriteError = useCallback(
    (
      error: unknown,
      token?: ContentAccessGeneration,
    ): Promise<VacancyContentRead | null> => {
      // The read decides: a write 401 can be MFA for this action or a lost token-refresh race.
      if (!scope.current(token)) return Promise.resolve(null);
      return revalidate(token);
    },
    [revalidate, scope],
  );

  return { state, revalidate, beginWrite, finishWrite, handleWriteError };
}

export type VacancyContentAccess = ReturnType<typeof useVacancyContentAccess>;
