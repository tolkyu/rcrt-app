/** Writes of the «Команда» block (ADR-017 slice 5): claim, assign, remove, first Team Lead; the status dialogs reuse the same reconciliation. Pessimistic: the cache takes the server's answer, never a guess. */
import type { QueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail, VacancyPage } from '@/lib/schemas/vacancy';
import { readCurrentVacancy, refreshVacancy } from '@/lib/vacancy-refresh';

export const detailSchema = async () =>
  (await import('@/lib/schemas/vacancy')).vacancyDetailSchema;
const base = (id: string) => `/vacancies/${encodeURIComponent(id)}`;

/** A claim is sent from an open dialog, so a 404 means a rival claimed first and the vacancy left the unassigned scope (D132, ADR-017 E3): the same conflict as the row lock's 409. */
export const claimVacancyRequest = async (id: string) => {
  try {
    return await apiRequest(`${base(id)}/recruiters/claim`, {
      method: 'POST',
      body: {},
      schema: detailSchema,
    });
  } catch (error) {
    throw error instanceof ApiError && error.status === 404
      ? new ApiError(409, 'VACANCY_ALREADY_ASSIGNED')
      : error;
  }
};

export const assignRecruitersRequest = (
  id: string,
  recruiterIds: readonly string[],
  expectedVersion: number,
) =>
  apiRequest(`${base(id)}/recruiters`, {
    method: 'POST',
    body: { recruiterIds, expectedVersion },
    schema: detailSchema,
  });

export const removeRecruiterRequest = (
  id: string,
  userId: string,
  expectedVersion: number,
) =>
  apiRequest(
    `${base(id)}/recruiters/${encodeURIComponent(userId)}?expectedVersion=${expectedVersion}`,
    { method: 'DELETE', schema: detailSchema },
  );

export const setTeamLeadRequest = (
  id: string,
  teamLeadId: string,
  expectedVersion: number,
) =>
  apiRequest(`${base(id)}/team-lead`, {
    method: 'PUT',
    body: { teamLeadId, expectedVersion },
    schema: detailSchema,
  });

export type TeamFailure =
  | 'stale'
  | 'closed'
  | 'taken'
  | 'teamLeadSet'
  | 'statusInvalid'
  | 'invalid'
  | 'forbidden'
  | 'gone'
  | 'rateLimited'
  | 'network'
  | 'failed';

/** 409 and 400 carry several meanings, told apart by `code`; anything that is not an API answer is a lost connection. */
export function classifyTeamFailure(error: unknown): TeamFailure {
  if (!(error instanceof ApiError)) return 'network';
  if (error.status === 409) {
    if (error.code === 'STALE_STATE') return 'stale';
    if (error.code === 'VACANCY_CLOSED') return 'closed';
    if (error.code === 'VACANCY_ALREADY_ASSIGNED') return 'taken';
    if (error.code === 'TEAM_LEAD_ALREADY_SET') return 'teamLeadSet';
    if (error.code === 'VACANCY_STATUS_INVALID') return 'statusInvalid';
    return 'failed';
  }
  if (error.status === 400)
    return error.fieldErrors.some(({ code }) => code.startsWith('invalid_'))
      ? 'invalid'
      : 'failed';
  if (error.status === 401 || error.status === 403) return 'forbidden';
  if (error.status === 404) return 'gone';
  if (error.status === 429) return 'rateLimited';
  return 'failed';
}

const isPage = (data: unknown): data is VacancyPage =>
  typeof data === 'object' &&
  data !== null &&
  'items' in data &&
  Array.isArray(data.items);

/** Until the list reads again (a claim keeps the row but changes its cell), the row shows the team the server answered with. */
const withTeam = (data: unknown, detail: VacancyDetail): unknown =>
  isPage(data)
    ? {
        ...data,
        items: data.items.map((row) =>
          row.id === detail.id
            ? {
                ...row,
                recruiters: detail.recruiters,
                teamLead: detail.teamLead,
              }
            : row,
        ),
      }
    : data;

/** The answer is the freshest card there is; a read already in flight would overwrite it with older data. */
export async function adoptTeamDetail(
  queryClient: QueryClient,
  detail: VacancyDetail,
) {
  await queryClient.cancelQueries({
    queryKey: queryKeys.vacancy(detail.id),
    exact: true,
  });
  queryClient.setQueryData(queryKeys.vacancy(detail.id), detail);
  queryClient.setQueriesData<unknown>(
    { queryKey: queryKeys.vacanciesAll() },
    (data: unknown) => withTeam(data, detail),
  );
  void refreshVacancy(queryClient, detail.id);
}

export type TeamOutcome =
  | { readonly ok: true; readonly detail: VacancyDetail }
  | { readonly ok: false; readonly failure: TeamFailure };

/**
 * One write and its reconciliation. A stale answer may be the echo of our own earlier attempt (the retry of a lost
 * response), so `adopted` judges the current card: only then the retry counts as done instead of warning.
 * If another manager made the identical change at the same version step, the outcome is the same and the toast may credit us.
 */
export async function attemptTeamWrite(
  queryClient: QueryClient,
  id: string,
  request: () => Promise<VacancyDetail>,
  adopted?: (current: VacancyDetail) => boolean,
): Promise<TeamOutcome> {
  try {
    const detail = await request();
    // The server already did the work: a failing cache write must not turn it into an error.
    await adoptTeamDetail(queryClient, detail).catch(() => undefined);
    return { ok: true, detail };
  } catch (error) {
    const failure = classifyTeamFailure(error);
    if (failure === 'stale') {
      const current = await readCurrentVacancy(queryClient, id);
      if (current && adopted?.(current)) return { ok: true, detail: current };
    }
    if (failure !== 'rateLimited' && failure !== 'network')
      void refreshVacancy(queryClient, id);
    return { ok: false, failure };
  }
}
