import type { VacancySummary } from '@/lib/schemas/vacancy';
import { publishBlocker } from '@/lib/vacancy-publish-rule';

export const vacancyEditHref = (id: string) => `/vacancies/${id}/edit`;

/** A draft, or a draft its author cancelled before it ever opened (D92, D112): only the author can open it, so nothing about it can be shared. Client twin of `isNeverOpenedCancelled` in `server/authz/vacancy-author.ts` (SQL twin: `server/authz/vacancy-scope.ts`); a unit test compares them. */
export const isPrivateDraft = (
  vacancy: Pick<VacancySummary, 'status' | 'openedAt'>,
): boolean =>
  vacancy.status === 'DRAFT' ||
  (vacancy.status === 'CANCELLED' && vacancy.openedAt === null);

/** `DRAFT` may be edited, published, cancelled and deleted; an own `CANCELLED` draft only deleted (D82, D112(1)). */
export type DraftActions =
  | {
      readonly stage: 'DRAFT';
      /** Why «Опублікувати» is unavailable; `null` when the draft may be published. */
      readonly publishBlocked: 'positionRequired' | null;
    }
  | { readonly stage: 'CANCELLED' };

/** The read gate returns a private draft only to its author (D92, D98), so such a row or card is the viewer's own; `canAuthorDrafts` repeats the page-level grant (`authorsAnywhere`) and the server decides every write. */
export function ownDraftActions(
  vacancy: Pick<VacancySummary, 'status' | 'position' | 'openedAt'>,
  canAuthorDrafts: boolean,
): DraftActions | null {
  if (!canAuthorDrafts || !isPrivateDraft(vacancy)) return null;
  return vacancy.status === 'DRAFT'
    ? { stage: 'DRAFT', publishBlocked: publishBlocker(vacancy) }
    : { stage: 'CANCELLED' };
}

/** The row gets a `⋯` menu; the mobile card leaves room for it next to the title. */
export const hasRowMenu = (
  vacancy: Pick<VacancySummary, 'status' | 'position' | 'openedAt'>,
  canAuthorDrafts: boolean,
): boolean => ownDraftActions(vacancy, canAuthorDrafts) !== null;
