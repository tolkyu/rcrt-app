import 'server-only';
import { cache } from 'react';
import { NotFoundError } from '@/server/http/errors';
import { getVacancyDetail } from '@/server/services/vacancy';
import { requireSession } from '../../_lib/session';

/** One scoped read per request for the detail layout and metadata; missing, malformed and out-of-scope ids are all `null`. */
export const loadVacancy = cache(async (vacancyId: string) => {
  const ctx = await requireSession();
  try {
    return await getVacancyDetail(ctx, vacancyId);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
});
