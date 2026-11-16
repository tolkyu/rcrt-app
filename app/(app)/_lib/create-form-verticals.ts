import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { PREFERENCE_COOKIES } from '@/lib/preference-cookie';
import { ALL_VERTICALS, resolveVerticalFilter } from '@/lib/vertical-filter';
import type { VerticalId } from '@/server/authz/types';
import {
  canSetCreateProbation,
  grantCovers,
  vacancyAuthorVerticals,
} from '@/server/authz/vacancy-author';
import { requireSession } from './session';
import { getVisibleVerticals } from './verticals';

/** Verticals of «Нова вакансія» and the preset one, shared by the page and its loading skeleton so both agree on what the form shows. */
export const getCreateFormVerticals = cache(async () => {
  const ctx = await requireSession();
  const [cookieStore, visible] = await Promise.all([
    cookies(),
    getVisibleVerticals(),
  ]);
  const authoring = vacancyAuthorVerticals(ctx.auth).any;
  const verticals = visible.items
    .filter(
      (vertical) =>
        authoring === 'ALL' || authoring.has(vertical.id as VerticalId),
    )
    .map((vertical) => ({
      ...vertical,
      // Per vertical: a Head Recruiter of one vertical who only recruits in another may not name a Team Lead there.
      canSetTeamLead: grantCovers(
        ctx.auth,
        'vacancy.team_lead.set',
        vertical.id as VerticalId,
      ),
      canSetProbation: canSetCreateProbation(ctx.auth),
    }));
  const [only] = verticals;
  // One option is preset (and shown disabled); with several, the header vertical (D83) presets, «Усі» leaves the choice open.
  const preset =
    verticals.length === 1 && only
      ? only.id
      : resolveVerticalFilter(
          cookieStore.get(PREFERENCE_COOKIES.vertical)?.value,
          verticals,
        );
  return { verticals, verticalId: preset === ALL_VERTICALS ? '' : preset };
});
