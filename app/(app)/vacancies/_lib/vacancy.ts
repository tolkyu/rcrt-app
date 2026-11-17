import 'server-only';
import { cache } from 'react';
import { NotFoundError } from '@/server/http/errors';
import { getVacancyDetail } from '@/server/services/vacancy';
import { requireSession } from '../../_lib/session';

const readVacancy = cache(async (vacancyId: string) => {
  const ctx = await requireSession();
  try {
    return await getVacancyDetail(ctx, vacancyId);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
});

/** One scoped read per request for the detail and edit layouts, pages and loading boundary; missing, malformed and out-of-scope ids are all `null`. The id is lower-cased first, so a link in capitals shares the cache entry of the canonical one. */
export const loadVacancy = (vacancyId: string) =>
  readVacancy(vacancyId.toLowerCase());
