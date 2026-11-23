'use client';

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { ApiError } from '@/lib/api-client';
import { vacancyContentQuery } from '@/lib/queries/vacancy-content';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyContentRead } from '@/lib/schemas/vacancy-content';
import { isEditableStatus } from '@/lib/vacancy-content-form';

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
  private gate: { readonly writing: boolean; readonly denial: Denial | null } =
    { writing: false, denial: null };
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
    this.active && !this.gate.writing && this.gate.denial === null;
  private update(gate: typeof this.gate) {
    this.gate = gate;
    for (const listener of this.listeners) listener();
  }
  activate() {
    this.active = true;
  }
  close() {
    this.active = false;
    this.generation += 1;
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
    this.update({ writing: false, denial });
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
        reason: error.status === 401 ? 'session' : 'notFound',
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
  const failure = query.error ?? query.failureReason;
  const state: VacancyContentAccessState = denial
    ? { kind: 'unavailable', ...denial }
    : failure || !query.isSuccess || !query.isFetchedAfterMount
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
        router.refresh();
      } else {
        // The prefix also covers the card's metadata and recruiter picker.
        const filter = { queryKey: queryKeys.vacancy(id) };
        void queryClient.cancelQueries(filter).catch(() => undefined);
        queryClient.removeQueries(filter);
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
      if (!scope.current(token)) return Promise.resolve(null);
      if (error instanceof ApiError && error.status === 401) {
        deny({ reason: 'session', code: error.code });
        return Promise.resolve(null);
      }
      return revalidate(token);
    },
    [deny, revalidate, scope],
  );

  return { state, revalidate, beginWrite, finishWrite, handleWriteError };
}

export type VacancyContentAccess = ReturnType<typeof useVacancyContentAccess>;
