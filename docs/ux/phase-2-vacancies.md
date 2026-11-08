# Phase 2 — vacancy UI, first read slice

PRD: VAC-01/04/07, VIS-01..03, UI-04..07/09. This note scopes the first working increment; `wireframes/vacancies-list.md` and `vacancy-card.md` remain the complete module target.

## Inspected reference

- Original: `UI FROM DESIGNER/ChatGPT Image Oct 31, 2026, 10_37_48 AM-2.png`.
- Committed equivalent: `reference/03-vacancies.webp`.
- Visual target: existing Hiring shell; light/dark surfaces, rounded bordered content, compact table, selected-row indigo accent, right-hand preview and stacked mobile cards. Keep existing tokens, theme controls and role identities.
- The image is a visual reference. D64 and `design-adoption.md` A-13/14/15/21/30/31/32 govern its labels and behavior.

## First useful increment

| Area                | First slice                                                                                              | Later vacancy/candidate slices                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Navigation          | Working «Вакансії» destination for roles with vacancy access; Finance has no item or access              | Other sections appear once built, per D28                                                                     |
| List                | Real, server-scoped vacancies; title/number, vertical, team lead, status and opening date when available | Recruiter stacks, application counts, mini-funnel, hiring progress and open-days counter                      |
| Filters             | Vacancy search, vertical and status; URL, reload and Back preserve the selection                         | Position/team-lead/recruiter/period/priority controls when their real scoped options and queries ship         |
| Detail              | Real vacancy fields and team; working `/vacancies/[id]`; scoped missing/forbidden objects return 404     | Editing, cloning, assignment and lifecycle actions after their service rules ship                             |
| Preview             | Same real overview data as detail on wide screens; selecting a different row updates it                  | Candidate and history tabs only when those real modules/endpoints exist                                       |
| History             | Read-only history may ship if it is backed by real vacancy events and actor resolution                   | Candidate/pipeline activity as those modules ship                                                             |
| Unavailable modules | Omit their controls/blocks                                                                               | Candidate actions, bonus scheme/reward, bulk selection and create actions appear with working implementations |

Do not render fabricated counts, empty charts, disabled future-feature CTAs, an inert ellipsis menu, or checkboxes without a bulk action. A real empty candidate list can appear once the application relationship exists; it must not imply the module already exists before then.

## Layout and interaction

- Page heading «Вакансії»; neutral subtitle «Переглядайте вакансії, команду та умови найму». Place labelled search/filter controls below it; avoid duplicating the vertical filter in the shell header.
- Desktop 1440: table fills remaining space beside a roughly 340–360 px preview. First-slice columns stay lean enough for the existing settings-width shell; the full target's candidate/hiring columns arrive with real data. Preserve readable titles and wrap long names instead of shrinking type.
- Narrow desktop/tablet: list takes the full content width; a working detail destination remains available. Do not compress the table and preview into two unreadable columns.
- Title is an actual detail link; keyboard Enter opens the card. Preview selection needs an explicit, named keyboard-operable control, visible focus and selected styling. Avoid a button-like table row containing other interactive controls.
- Mobile 390: one stacked card presentation, with title/number, vertical, status, team lead and date; tap the real card link to open the full detail. No side preview or sticky create footer until creation is implemented. Existing mobile navigation exposes only built destinations.
- A loaded count uses Ukrainian plural forms («Показано … вакансій»). Status chips can carry totals only when the API supplies authorization-scoped totals; do not label a loaded-page count as the total.
- Cursor navigation uses the implemented cursor contract, with an announced loading/error state. No numbered pages or invented total-page count. Lists exceeding 100 retained rows follow the project's existing lazy virtualization rule.

## Labels and scope

- Status is exactly «Чернетка», «Відкрита», «Призупинена», «Заповнена» or «Скасована». «Термінова» and «З бота» are separate title badges; normal priority needs no badge.
- Show users as name plus role/vertical where appropriate, with initials when there is no real photo. Do not add the mockup's job-title field.
- Preserve vacancy number `V-0001` beside the title and on detail. A missing team lead is «Не призначено»; no invented assignment.
- Show an actual opening date («Відкрита з …») rather than inventing an elapsed-days rule while Q-86 is unresolved. Hide the field when the vacancy has never opened.
- Candidate/funnel counts must use only applications the viewer can open (D19). The first read slice must not infer visibility from an unscoped total.
- «Поділитися» copies the real detail URL if included; success/failure feedback is accessible, and the link does not grant access (UI-09).
- Future preview tabs are «Огляд», «Кандидати», «Історія»; no per-vacancy «Статистика». Bonus text/actions remain with the implemented bonus scheme and its visibility rules.

## Required states and screenshots

| State                    | Presentation / verification                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Loading                  | Stable page heading/filter geometry; table/card skeleton after the existing loading threshold; no page-layout jump |
| No visible vacancies     | «Вакансій поки немає»; no create button until a permitted creation flow is built                                   |
| Filtered empty           | «Нічого не знайдено за фільтрами» and working «Скинути фільтри»                                                    |
| List error               | Existing SectionError with working «Спробувати ще раз»; preserve filter draft/URL                                  |
| Preview error            | Local preview error/retry; list remains usable                                                                     |
| Missing/forbidden detail | Existing actual HTTP 404 behavior and a permitted recovery destination                                             |
| Long data                | Long vacancy title, team-lead name and multi-role identities wrap; no page-level horizontal overflow on mobile     |

Capture fixed Ukrainian data in desktop/mobile × light/dark, including Admin, Head Recruiter, Recruiter, Team Lead, HR/Head HR and Finance denial. Verify allowed/denied roles and verticals, keyboard link/preview/filter use, 44 px touch targets, focus after retry/navigation, and WCAG 2.1 AA. Gallery: `screenshots/phase-2/index.html`, with fresh Phase-2 images mirrored to latest.

## Owner questions already tracked

The BA owns product decisions in `OPEN_QUESTIONS.md`: Q-26 (edit/status rights), Q-48 (catalog management), Q-49 (team-lead assignment), Q-50 (probation controls), Q-86 (elapsed open days). These do not prevent the scoped read slice. Do not turn unanswered write rules into UI behavior.
