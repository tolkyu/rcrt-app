import type { QueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api-client';
import { activePositionsQuery } from '@/lib/queries/positions';
import { queryKeys } from '@/lib/query-keys';
import {
  requestVacancySchema,
  type RequestVacancyInput,
} from '@/lib/schemas/vacancy-request';
import { vacancyDetailSchema } from '@/lib/schemas/vacancy';
import {
  applyCreatedVacancy,
  createAttemptKeys,
} from '@/lib/vacancy-create-result';
import {
  noteVacancyWriteFailure,
  watchVacancySession,
} from '@/lib/vacancy-detail-cache';
import {
  REQUEST_FIELDS,
  type RequestErrors,
  type RequestField,
  type RequestNotice,
  type VacancyRequestValues,
} from '@/lib/vacancy-request-form';
export { toast } from '@/lib/toast';
export { createAttemptKeys };

const fieldError = (
  field: RequestField,
  code: string,
  message = '',
): NonNullable<RequestErrors[RequestField]> => {
  switch (field) {
    case 'positionId':
      return code === 'position_inactive' || code === 'invalid_position'
        ? 'positionUnavailable'
        : 'positionRequired';
    case 'headcount':
      return 'headcountRange';
    case 'priority':
      return 'priorityInvalid';
    case 'comment':
      if (code === 'too_big') return 'commentLong';
      return message === 'too_many_lines' ? 'commentLines' : 'commentInvalid';
  }
};

export function parseRequest(values: VacancyRequestValues) {
  const result = requestVacancySchema.safeParse({
    ...values,
    headcount: /^\d+$/.test(values.headcount) ? Number(values.headcount) : NaN,
  });
  if (result.success) return { ok: true, body: result.data } as const;
  const errors: RequestErrors = {};
  for (const issue of result.error.issues) {
    const field = REQUEST_FIELDS.find((key) => key === issue.path[0]);
    if (field && !errors[field])
      errors[field] = fieldError(field, issue.code, issue.message);
  }
  return { ok: false, errors } as const;
}

export type RequestFailure =
  | { kind: 'fields'; errors: RequestErrors }
  | { kind: 'notice'; notice: RequestNotice }
  | { kind: 'keyReused' };
export function requestFailure(error: unknown): RequestFailure {
  if (!(error instanceof ApiError))
    return { kind: 'notice', notice: 'network' };
  if (error.status === 401 || error.status === 403)
    return { kind: 'notice', notice: 'forbidden' };
  if (error.status === 429) return { kind: 'notice', notice: 'rateLimited' };
  if (error.code === 'IDEMPOTENCY_KEY_REUSED') return { kind: 'keyReused' };
  if (error.status === 404 || error.code === 'POSITION_INACTIVE')
    return { kind: 'fields', errors: { positionId: 'positionUnavailable' } };
  const errors: RequestErrors = {};
  for (const issue of error.fieldErrors) {
    const field = REQUEST_FIELDS.find((key) => `body.${key}` === issue.path);
    if (field) errors[field] = fieldError(field, issue.code);
  }
  return Object.keys(errors).length
    ? { kind: 'fields', errors }
    : { kind: 'notice', notice: 'failed' };
}

export async function submitRequest(
  queryClient: QueryClient,
  attempts: ReturnType<typeof createAttemptKeys>,
  body: RequestVacancyInput,
) {
  const stillAllowed = watchVacancySession(queryClient);
  for (let retried = false; ; retried = true) {
    try {
      const created = await apiRequest('/vacancies/request', {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': attempts.keyFor(body) },
        schema: vacancyDetailSchema,
      });
      await applyCreatedVacancy(queryClient, created, stillAllowed);
      return { ok: true, created } as const;
    } catch (error) {
      noteVacancyWriteFailure(queryClient, error);
      const failure = requestFailure(error);
      if (failure.kind !== 'keyReused') return { ok: false, failure } as const;
      if (retried)
        return {
          ok: false,
          failure: { kind: 'notice', notice: 'failed' },
        } as const;
      attempts.reset();
    }
  }
}

export const fetchRequestPositions = async (
  client: QueryClient,
  verticalIds: readonly string[],
) => {
  const lists = await Promise.all(
    verticalIds.map((id) => client.fetchQuery(activePositionsQuery(id))),
  );
  return lists
    .flatMap((list) => list.items)
    .filter(
      (position) =>
        position.isActive && verticalIds.includes(position.verticalId),
    );
};
export const refreshRequestPositions = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: queryKeys.positionsAll() });
