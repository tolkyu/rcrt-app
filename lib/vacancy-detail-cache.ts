import type { QueryClient } from '@tanstack/react-query';
import { ApiError, isSessionLoss } from '@/lib/api-client';
import { meQuery } from '@/lib/queries/me';
import { retrySessionLoss } from '@/lib/queries/vacancy-detail';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { logOf, recheckDetail } from '@/lib/denial-log';

export type VacancyAccessWatch = () => boolean;

/** Taken before the request: counts denials, not unmounts, so a late success still reaches a viewer who kept access. */
export function watchVacancyAccess(
  client: QueryClient,
  id: string,
): VacancyAccessWatch {
  const log = logOf(client);
  const key = id.toLowerCase();
  const everything = log.everything;
  const own = log.byId.get(key) ?? 0;
  return () =>
    log.everything === everything && (log.byId.get(key) ?? 0) === own;
}

/** For a write whose vacancy id is unknown until the answer: only a lost session can deny it. */
export function watchVacancySession(client: QueryClient): VacancyAccessWatch {
  const log = logOf(client);
  const everything = log.everything;
  return () => log.everything === everything;
}

/** Cancels first because an older in-flight read would overwrite the answer; re-checks after the await because a denial can land during it. */
export async function adoptVacancyDetail(
  client: QueryClient,
  detail: VacancyDetail,
  stillAllowed: VacancyAccessWatch,
): Promise<boolean> {
  if (!stillAllowed()) return false;
  const queryKey = queryKeys.vacancy(detail.id);
  await client.cancelQueries({ queryKey, exact: true }).catch(() => undefined);
  if (!stillAllowed()) return false;
  client.setQueryData(queryKey, detail);
  return true;
}

/** A write 403 can be action-only and is ignored; a 404 may be a missing action grant, so the card read decides. A write is never replayed, so a session read proves its 401. */
export function noteVacancyWriteFailure(
  client: QueryClient,
  error: unknown,
  id?: string,
) {
  if (!(error instanceof ApiError)) return;
  if (isSessionLoss(error))
    client
      .fetchQuery({ ...meQuery(), staleTime: 0, retry: retrySessionLoss })
      .catch(() => undefined);
  else if (error.status === 404 && id !== undefined)
    void recheckDetail(client, id);
}
