import {
  infiniteQueryOptions,
  queryOptions,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/** Imported only by the lazy user drawer, so these queries and their schemas stay out of the list bundle. */
const noRetryOnClientError = (count: number, error: Error) =>
  !(error instanceof ApiError && error.status < 500) && count < 2;

export const userDetailQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.settingsUser(id),
    retry: noRetryOnClientError,
    queryFn: ({ signal }) =>
      apiRequest(`/users/${id}`, {
        schema: async () =>
          (await import('@/lib/schemas/user')).userDetailSchema,
        signal,
      }),
  });

export const userEventsQuery = (id: string) =>
  infiniteQueryOptions({
    queryKey: queryKeys.settingsUserEvents(id),
    initialPageParam: null as string | null,
    retry: noRetryOnClientError,
    queryFn: ({ pageParam, signal }) =>
      apiRequest(
        `/users/${id}/events${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
        {
          schema: async () =>
            (await import('@/lib/schemas/user')).userEventPageSchema,
          signal,
        },
      ),
    getNextPageParam: (page) => page.nextCursor,
  });

const userSchemas = () => import('@/lib/schemas/user');

/** Invite actions in «Картка користувача» (STORY-ROLE-05-3, D70); the server decides what is allowed. */
export const userInviteRequests = {
  resend: (id: string) =>
    apiRequest(`/users/${id}/invite/resend`, {
      method: 'POST',
      schema: async () => (await userSchemas()).userInviteSentSchema,
    }),
  revoke: (id: string) =>
    apiRequest(`/users/${id}/invite/revoke`, {
      method: 'POST',
      schema: async () => (await userSchemas()).userInviteRevokedSchema,
    }),
  reinvite: (id: string) =>
    apiRequest(`/users/${id}/invite`, {
      method: 'POST',
      schema: async () => (await userSchemas()).userInviteSentSchema,
    }),
  changeEmail: (id: string, email: string, expectedVersion: number) =>
    apiRequest(`/users/${id}/email`, {
      method: 'PUT',
      body: { email, expectedVersion },
      schema: async () => (await userSchemas()).userInviteSentSchema,
    }),
};

/** «Змінити ролі»: the full new set and the card version (STORY-ROLE-01-1/01-2). */
export const updateUserRolesRequest = (
  id: string,
  roles: readonly { role: string; verticalId: string | null }[],
  expectedVersion: number,
) =>
  apiRequest(`/users/${id}/roles`, {
    method: 'PUT',
    body: { roles, expectedVersion },
    schema: async () => (await userSchemas()).userRolesUpdatedSchema,
  });

export const userRolesMutationKey = (id: string) =>
  [...queryKeys.settingsUser(id), 'roles'] as const;

export const userActivationMutationKey = (id: string) =>
  [...queryKeys.settingsUser(id), 'activation'] as const;

export const userActivationRequests = {
  deactivate: (id: string, expectedVersion: number, reason: string) =>
    apiRequest(`/users/${id}/deactivate`, {
      method: 'POST',
      body: { expectedVersion, reason },
      schema: async () => (await userSchemas()).userActivationUpdatedSchema,
    }),
  reactivate: (
    id: string,
    expectedVersion: number,
    roles: readonly { role: string; verticalId: string | null }[],
  ) =>
    apiRequest(`/users/${id}/reactivate`, {
      method: 'POST',
      body: { expectedVersion, roles },
      schema: async () => (await userSchemas()).userActivationUpdatedSchema,
    }),
};

/** Shared by every invite mutation of one user, so the card can disable all of them while any runs (wireframe §1.3). */
export const userInviteMutationKey = (id: string) =>
  [...queryKeys.settingsUser(id), 'invite'] as const;

/** After an invite action: the card, the users list and the audit log all show the new state. */
export function useRefreshUserCard(id: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.settingsUser(id) }),
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] }),
      queryClient.invalidateQueries({ queryKey: ['settings', 'audit'] }),
    ]);
}
