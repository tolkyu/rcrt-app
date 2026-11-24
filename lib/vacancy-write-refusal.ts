/** Loaded only with the write chunks that need it, never with the create form (PERF-04). */
import { ApiError, apiRequest } from '@/lib/api-client';

/**
 * ADR-020 access loss: a write route may hide a missing action grant behind 404, so only a card read that still answers
 * tells a refused action from a vacancy that is gone. Read outside the query cache: the card's own re-read
 * (`noteVacancyWriteFailure`) keeps the purge and reload, and a page without the card gains none.
 */
export async function readableAfterWrite404(
  error: unknown,
  id: string,
): Promise<boolean> {
  if (!(error instanceof ApiError) || error.status !== 404) return false;
  try {
    await apiRequest(`/vacancies/${encodeURIComponent(id)}`, {
      schema: async () =>
        (await import('@/lib/schemas/vacancy')).vacancyDetailSchema,
      background: true,
    });
    return true;
  } catch {
    return false;
  }
}
