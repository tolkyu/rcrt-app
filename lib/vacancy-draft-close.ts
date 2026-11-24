/** Loaded with the dialog chunk, outside the list's initial JavaScript (PERF-04). */
import type { QueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  vacancyDeletedSchema,
  vacancyDetailSchema,
  type VacancyDetail,
  type VacancyDraftCount,
} from '@/lib/schemas/vacancy';
import {
  adoptVacancyDetail,
  noteVacancyWriteFailure,
  type VacancyAccessWatch,
} from '@/lib/vacancy-detail-cache';
import { isPage } from '@/lib/denial-log';
import { markVacancyClosed } from '@/lib/vacancy-closed';
import { isCount } from '@/lib/vacancy-draft-optimistic';
import { vacancyPageUrlSearch } from '@/lib/vacancy-filters';

export type CloseKind = 'cancel' | 'delete';

export interface ClosableDraft {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: 'DRAFT' | 'CANCELLED';
  readonly vertical: { readonly id: string };
}

export type CloseFailure =
  | 'invalid'
  | 'notDraft'
  | 'stale'
  | 'gone'
  | 'rateLimited'
  | 'forbidden'
  | 'network'
  | 'failed';

export type CloseOutcome =
  | { readonly status: 'done'; readonly vacancy: VacancyDetail | null }
  | { readonly status: 'busy' }
  | { readonly status: 'failed'; readonly failure: CloseFailure };

/** Neither route has an idempotency key, so a second press must not start a second request while the first is out (survives the unmount of the row that started it). */
const inFlight = new Set<string>();

const draftPath = (id: string) => `/vacancies/${encodeURIComponent(id)}`;

export function classifyCloseFailure(
  error: unknown,
  kind: CloseKind,
): CloseFailure {
  if (!(error instanceof ApiError)) return 'network';
  if (error.status === 404) return 'gone';
  if (error.status === 429) return 'rateLimited';
  if (error.status === 403) return 'forbidden';
  if (error.code === 'VACANCY_NOT_DRAFT') return 'notDraft';
  if (error.code === 'STALE_STATE') return 'stale';
  // Only the reason can be a 400: a delete has no body.
  return error.status === 400 && kind === 'cancel' ? 'invalid' : 'failed';
}

/** A failure whose request may still have been applied: the next press checks before it warns. */
export const isUnsure = (failure: CloseFailure) =>
  failure === 'network' || failure === 'failed';

/** The cancelled draft as the server stored it; a delete answers with nothing the UI needs. */
async function send(
  kind: CloseKind,
  id: string,
  reason: string,
): Promise<VacancyDetail | null> {
  if (kind === 'cancel')
    return apiRequest(`${draftPath(id)}/cancel`, {
      method: 'POST',
      body: { reason },
      schema: vacancyDetailSchema,
    });
  await apiRequest(draftPath(id), {
    method: 'DELETE',
    schema: vacancyDeletedSchema,
  });
  return null;
}

/** The retry of a cancel that may have gone through meets its own result as a conflict; the stored state says whether it did. A delete has no such proof: its 404 can also be lost access. */
async function alreadyCancelled(
  queryClient: QueryClient,
  id: string,
  failure: CloseFailure,
): Promise<CloseOutcome | null> {
  if (failure !== 'notDraft') return null;
  try {
    await queryClient.cancelQueries({
      queryKey: queryKeys.vacancy(id),
      exact: true,
    });
    // Completion publishes the result only after the dialog closes and focus is armed.
    const latest = await apiRequest(draftPath(id), {
      schema: vacancyDetailSchema,
      background: true,
    });
    return latest.status === 'CANCELLED' && latest.openedAt === null
      ? { status: 'done', vacancy: latest }
      : null;
  } catch {
    return null;
  }
}

/** `retrying`: this press repeats a request that may already be stored, so a conflict is checked against the stored draft first. */
export async function closeDraft(
  queryClient: QueryClient,
  kind: CloseKind,
  draft: ClosableDraft,
  reason: string,
  retrying: boolean,
): Promise<CloseOutcome> {
  // Set before the first await: a double press cannot slip past it.
  if (inFlight.has(draft.id)) return { status: 'busy' };
  inFlight.add(draft.id);
  try {
    // A read already out could answer 404 after the commit but before the DELETE response marks the id.
    if (kind === 'delete')
      await queryClient.cancelQueries({
        queryKey: queryKeys.vacancy(draft.id),
      });
    const vacancy = await send(kind, draft.id, reason);
    if (kind === 'delete') markVacancyClosed(queryClient, draft.id);
    return { status: 'done', vacancy };
  } catch (error) {
    noteVacancyWriteFailure(queryClient, error, draft.id);
    const failure = classifyCloseFailure(error, kind);
    const adopted =
      retrying && kind === 'cancel'
        ? await alreadyCancelled(queryClient, draft.id, failure)
        : null;
    return adopted ?? { status: 'failed', failure };
  } finally {
    inFlight.delete(draft.id);
  }
}

/** The data changed under the user: lists, count and card read the server again. */
export function refreshDraft(queryClient: QueryClient, id: string): void {
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.vacanciesAll() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.vacancy(id) }),
  ]).catch(() => undefined);
}

/** The row leaves every cached list at once and the count follows, then everything reads the server; `onRemoved` runs while the row is still on the page, so selection and focus can pick its neighbour. */
export async function applyClosed(
  queryClient: QueryClient,
  draft: ClosableDraft,
  vacancy: VacancyDetail | null,
  onRemoved: () => void,
  stillAllowed: VacancyAccessWatch,
): Promise<void> {
  // An older list or card answer must not restore the draft after the write.
  await Promise.all([
    queryClient.cancelQueries({ queryKey: queryKeys.vacanciesAll() }),
    queryClient.cancelQueries({
      queryKey: queryKeys.vacancy(draft.id),
      exact: true,
    }),
  ]);
  onRemoved();
  queryClient.setQueriesData({ queryKey: queryKeys.vacanciesAll() }, (data) =>
    isPage(data) && data.items.some((row) => row.id === draft.id)
      ? { ...data, items: data.items.filter((row) => row.id !== draft.id) }
      : data,
  );
  // A cancelled draft was not counted, so deleting it changes nothing.
  if (draft.status === 'DRAFT')
    queryClient.setQueryData<VacancyDraftCount>(
      queryKeys.vacancyDraftCount(),
      (count) =>
        count && isCount(count) && count.count > 0
          ? { count: count.count - 1 }
          : count,
    );
  if (vacancy) await adoptVacancyDetail(queryClient, vacancy, stillAllowed);
  else queryClient.removeQueries({ queryKey: queryKeys.vacancy(draft.id) });
  queryClient
    .invalidateQueries({ queryKey: queryKeys.vacanciesAll() })
    .catch(() => undefined);
}

/** After deleting from the card: the list the draft lived in (a cancelled one under «Скасовані»), its vertical kept so the header preset cannot hide it. */
export const closedLandingHref = (draft: ClosableDraft) =>
  `/vacancies?${vacancyPageUrlSearch({
    filters: { status: draft.status, vertical: draft.vertical.id },
  })}`;
