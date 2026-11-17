import type { AuthContext } from './context';
import type { VerticalId } from './types';
import { grantCovers } from './vacancy-author';

/** D87: OWN vacancy reads identify the request path even when a Team Lead also recruits. */
export function vacancyRequestVerticals(
  auth: AuthContext,
): ReadonlySet<VerticalId> {
  const ids = new Set<VerticalId>();
  for (const grant of auth.grants.get('vacancy.read') ?? []) {
    if (grant.scope.kind !== 'OWN' || grant.verticalIds === 'ALL') continue;
    for (const id of grant.verticalIds)
      if (grantCovers(auth, 'vacancy.create', id)) ids.add(id);
  }
  return ids;
}

export const requestsAnywhere = (auth: AuthContext): boolean =>
  vacancyRequestVerticals(auth).size > 0;

export const canRequestVacancy = (
  auth: AuthContext,
  verticalId: string,
): verticalId is VerticalId =>
  [...vacancyRequestVerticals(auth)].some((id) => id === verticalId);
