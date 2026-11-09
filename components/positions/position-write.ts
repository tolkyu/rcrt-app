'use client';

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ApiError, apiRequest } from '@/lib/api-client';
import { mergePosition } from '@/lib/position-list';
import { MANAGER_POSITIONS, positionsQuery } from '@/lib/queries/positions';
import type { Position, PositionList } from '@/lib/schemas/position';
import { toast } from '@/lib/toast';

export const POSITION_TOGGLE_KEY = ['positions', 'toggle'] as const;
export const POSITION_SAVE_KEY = ['positions', 'save'] as const;

export const loadPositionSchema = async () =>
  (await import('@/lib/schemas/position')).positionSchema;

export type WriteFailure =
  | 'stale'
  | 'forbidden'
  | 'notFound'
  | 'rateLimited'
  | 'mfaRequired'
  | 'limitReached'
  | 'nameTaken'
  | 'invalid'
  | 'failed';

const FAILURES: Readonly<Record<string, WriteFailure>> = {
  STALE_STATE: 'stale',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'notFound',
  RATE_LIMITED: 'rateLimited',
  MFA_REQUIRED: 'mfaRequired',
  POSITION_LIMIT_REACHED: 'limitReached',
  POSITION_NAME_TAKEN: 'nameTaken',
  VALIDATION_FAILED: 'invalid',
};

export const classifyFailure = (error: unknown): WriteFailure =>
  (error instanceof ApiError && FAILURES[error.code]) || 'failed';

const TOAST_KEY = {
  stale: 'stale',
  forbidden: 'forbidden',
  notFound: 'notFound',
  rateLimited: 'rateLimited',
  limitReached: 'saveFailed',
  nameTaken: 'saveFailed',
  invalid: 'saveFailed',
  failed: 'saveFailed',
} as const satisfies Partial<Record<WriteFailure, string>>;

/** Toast for a failed write; the 2FA case has its own page alert. */
export function usePositionFailureToast() {
  const t = useTranslations('positions.errors');
  return (failure: WriteFailure) => {
    if (failure !== 'mfaRequired') toast.error(t(TOAST_KEY[failure]));
  };
}

export function updatePositionList(
  queryClient: QueryClient,
  update: (items: Position[]) => Position[],
): void {
  queryClient.setQueryData<PositionList>(
    positionsQuery(MANAGER_POSITIONS).queryKey,
    (current) => (current ? { items: update([...current.items]) } : current),
  );
}

/** Refetches the manager list and returns the row as the server now has it (`undefined` = gone or out of scope). */
export async function refreshPosition(
  queryClient: QueryClient,
  id: string,
): Promise<Position | undefined> {
  await queryClient.invalidateQueries({ queryKey: ['positions'] });
  return queryClient
    .getQueryData<PositionList>(positionsQuery(MANAGER_POSITIONS).queryKey)
    ?.items.find((item) => item.id === id);
}

export interface ToggleVariables {
  readonly position: Position;
  readonly isActive: boolean;
}

export const isToggleVariables = (value: unknown): value is ToggleVariables =>
  typeof value === 'object' &&
  value !== null &&
  'position' in value &&
  'isActive' in value;

/** Deactivate and reactivate flip the row at once and restore only that row on failure, so a cached count survives both ways. */
export function usePositionToggle() {
  const t = useTranslations('positions.toast');
  const queryClient = useQueryClient();
  const key = positionsQuery(MANAGER_POSITIONS).queryKey;
  return useMutation({
    mutationKey: POSITION_TOGGLE_KEY,
    mutationFn: ({ position, isActive }: ToggleVariables) =>
      apiRequest(`/positions/${position.id}`, {
        method: 'PATCH',
        body: { expectedVersion: position.version, isActive },
        schema: loadPositionSchema,
      }),
    onMutate: async ({ position, isActive }) => {
      await queryClient.cancelQueries({ queryKey: key });
      updatePositionList(queryClient, (items) =>
        items.map((item) =>
          item.id === position.id ? { ...item, isActive } : item,
        ),
      );
    },
    onError: (_error, { position }) =>
      updatePositionList(queryClient, (items) =>
        items.map((item) => (item.id === position.id ? position : item)),
      ),
    onSuccess: (updated) => {
      updatePositionList(queryClient, (items) => mergePosition(items, updated));
      toast.success(
        t(updated.isActive ? 'reactivated' : 'deactivated', {
          name: updated.name,
        }),
      );
    },
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: ['positions'] }),
  });
}
