/** Kept apart from `vacancy-form` so the list can use it without that module's field tables (PERF-04). The PUBLISH contract differs from DRAFT only in the position, and a stored draft always holds a valid title and headcount; a unit test pins this against `parseVacancyForm(…, 'PUBLISH')`. */
export const publishBlocker = (draft: {
  readonly position: unknown;
}): 'positionRequired' | null => (draft.position ? null : 'positionRequired');
