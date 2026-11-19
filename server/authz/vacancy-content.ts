import { can } from './can';
import type { AuthContext } from './context';
import type { VacancyRef } from './types';

export const canEditVacancyContent = (
  auth: AuthContext,
  resource: VacancyRef,
): boolean =>
  can(auth, 'vacancy.update', resource) ||
  can(auth, 'vacancy.content.update', resource);
