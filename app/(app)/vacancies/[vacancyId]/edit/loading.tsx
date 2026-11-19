import { headers } from 'next/headers';
import { EditFormSkeleton } from '@/components/vacancies/edit-form-skeleton';
import type { VerticalId } from '@/server/authz/types';
import {
  vacancyAuthorKind,
  vacancyFormGrants,
} from '@/server/authz/vacancy-author';
import { requireSession } from '../../../_lib/session';
import { loadVacancy } from '../../_lib/vacancy';

const EDIT_PATH = /^\/vacancies\/([0-9a-f-]{36})\/edit\/?$/i;

/** A loading boundary gets no route params, so the draft is found through the request path; the layout above has already loaded it, so this is a cache hit and the skeleton carries the real heading. */
export default async function EditVacancyLoading() {
  const [ctx, path] = await Promise.all([
    requireSession(),
    headers().then((list) => list.get('x-pathname')),
  ]);
  const id = path ? EDIT_PATH.exec(path.split('?')[0]!)?.[1] : undefined;
  const found = id ? await loadVacancy(id) : null;
  // Same gate as the layout and the page: a vacancy the caller may read but not author never lends its heading to this skeleton.
  const vacancy =
    found && vacancyAuthorKind(ctx.auth, found.vertical.id as VerticalId)
      ? found
      : null;
  const grants = vacancy
    ? vacancyFormGrants(ctx.auth, vacancy.vertical.id as VerticalId)
    : { canSetTeamLead: false, canSetProbation: false };
  return (
    <EditFormSkeleton
      vacancy={vacancy}
      withTeamLead={grants.canSetTeamLead}
      withProbation={grants.canSetProbation}
    />
  );
}
