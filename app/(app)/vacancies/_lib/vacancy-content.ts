import 'server-only';
import { cache } from 'react';
import { NotFoundError } from '@/server/http/errors';
import { getVacancyContent } from '@/server/services/vacancy-content';
import { requireSession } from '../../_lib/session';

const readContent = cache(async (vacancyId: string) => {
  const ctx = await requireSession();
  try {
    return await getVacancyContent(ctx, vacancyId);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
});

export const loadVacancyContent = (vacancyId: string) =>
  readContent(vacancyId.toLowerCase());
