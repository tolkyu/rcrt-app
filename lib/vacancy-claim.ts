import type { VacancySummary } from '@/lib/schemas/vacancy';

/** Verticals where the viewer holds `vacancy.self_assign`, decided on the server and sent with the page (a list row carries no per-viewer flag). */
export type SelfAssignVerticals = 'ALL' | readonly string[];

export const grantsClaim = (
  vacancy: Pick<VacancySummary, 'vertical'>,
  verticals: SelfAssignVerticals,
): boolean => verticals === 'ALL' || verticals.includes(vacancy.vertical.id);

/** Mirror of the server's `canSelfAssign` (covering grant, `OPEN`, nobody assigned); the claim itself is judged again under the vacancy lock. */
export const canClaimRow = (
  vacancy: Pick<VacancySummary, 'status' | 'recruiters' | 'vertical'>,
  verticals: SelfAssignVerticals,
): boolean =>
  vacancy.status === 'OPEN' &&
  vacancy.recruiters.length === 0 &&
  grantsClaim(vacancy, verticals);

const rowLinks = (id: string) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(`[data-vacancy-link="${id}"]`),
  );

/** The table and the card list are both in the DOM and CSS shows one; the visible link is the one with a box. */
const visible = (elements: HTMLElement[]) =>
  elements.find((element) => element.getClientRects().length > 0) ??
  elements[0];

/** After a lost claim the row leaves: focus goes to the next row's title, or to the results region when it was the last (never `<body>`). */
export function focusAfterRow(id: string): void {
  const link = visible(rowLinks(id));
  const row = link?.closest('tr, li');
  const next = row?.nextElementSibling?.querySelector<HTMLElement>(
    '[data-vacancy-link]',
  );
  (
    next ?? link?.closest<HTMLElement>('[data-slot="filter-bar-results"]')
  )?.focus();
}

export const focusRowTitle = (id: string): void =>
  visible(rowLinks(id))?.focus();
