import { ApiError, apiRequest } from './api-client';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import {
  updateVacancyContentSchema,
  vacancyContentSchema,
  type UpdateVacancyContentInput,
  type VacancyContent,
} from './schemas/vacancy-content';
import {
  contentChanges,
  contentDirty,
  invalidContentFields,
  type ContentFeedback,
  type ContentFields,
} from './vacancy-content-form';

export type ContentPatchPlan =
  | { kind: 'empty' }
  | { kind: 'invalid'; fields: readonly string[] }
  | { kind: 'patch'; body: UpdateVacancyContentInput };
export function buildContentPatch(
  baseline: VacancyContent,
  fields: ContentFields,
): ContentPatchPlan {
  const invalid = invalidContentFields(fields);
  if (invalid.length) return { kind: 'invalid', fields: invalid };
  if (!contentDirty(baseline, fields)) return { kind: 'empty' };
  const body: UpdateVacancyContentInput = {
    expectedVersion: baseline.version,
    ...contentChanges(baseline, fields),
  };
  const parsed = updateVacancyContentSchema.safeParse(body);
  return parsed.success
    ? { kind: 'patch', body: parsed.data }
    : {
        kind: 'invalid',
        fields: parsed.error.issues.map((issue) =>
          String(issue.path[0] ?? 'body'),
        ),
      };
}
export const submitVacancyContent = async (
  id: string,
  body: UpdateVacancyContentInput,
) =>
  apiRequest(`/vacancies/${encodeURIComponent(id)}/content`, {
    method: 'PATCH',
    body: updateVacancyContentSchema.parse(body),
    schema: vacancyContentSchema,
  });
export function contentFailure(error: unknown): ContentFeedback {
  if (!(error instanceof ApiError)) return { kind: 'network' };
  if (error.code === 'STALE_STATE') return { kind: 'stale' };
  if (error.code === 'VACANCY_CONTENT_LOCKED') return { kind: 'closed' };
  if (error.status === 403) return { kind: 'forbidden' };
  if (error.status === 400 || error.status === 413)
    return {
      kind: 'fields',
      errors: error.fieldErrors.length
        ? error.fieldErrors
        : [
            {
              path: 'body',
              code: error.status === 413 ? 'too_large' : 'invalid',
            },
          ],
    };
  return { kind: error.status === 429 ? 'rateLimited' : 'server' };
}

/** Confirmed late writes mark old entries stale without restarting protected reads. */
export const invalidateLateContentSuccess = (client: QueryClient, id: string) =>
  Promise.all([
    client.invalidateQueries({
      queryKey: queryKeys.vacancy(id),
      refetchType: 'none',
    }),
    client.invalidateQueries({
      queryKey: queryKeys.vacanciesAll(),
      refetchType: 'none',
    }),
  ]).then(
    () => undefined,
    () => undefined,
  );
