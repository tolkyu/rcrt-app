# Phase 2 — Vacancies & candidates · User stories

> Owner started Phase 2 on 2026-11-06, beginning with «Вакансії». Visual reference: `UI FROM DESIGNER` and `docs/ux/reference/03-vacancies.webp`; approved adaptations and Ukrainian glossary win over mockup copy. PRD §15 remains the scope of the whole phase.
> This checkpoint specifies the vacancy increments. Candidate/files/dedupe/talent-pool/dashboard/custom-role stories are added when those increments start; they are not completed by the vacancy slice.

## Delivery order

| Increment | Deliverable                                                                                                                   | Readiness                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| V1        | Real scoped vacancy list, search/status/vertical filters, working read-only preview/detail, navigation and deterministic seed | Ready for design; include the open-work safety dependency below                                  |
| V2        | Positions catalog and vacancy creation/request form                                                                           | Owner-approved D76/D78; creation follows VAC-03/D2; expand form validation before implementation |
| V3        | Field editing, status changes, Team Lead/recruiter assignment and open-work reassignment                                      | Owner-approved D75/D77/D78 plus D1 assignment and D24/D43 safety; delivered after V1             |
| V4        | Applications, visible-only funnel/counts, full vacancy history and clone/delete flows                                         | Depends on candidate/application tables and relevant answers; deletion also Q-100                |
| Later     | Routing, polygraph/offer/probation actions; bonus engine; archives/notifications; Telegram                                    | Phases 3/4/5/6 respectively                                                                      |

## Shared rules

- **Owner policy confirmed 2026-11-06 (D75–D78):** Team Lead edits own vacancy except bonus scheme/priority/probation and may pause/cancel; assigned Recruiter edits description/requirements only, no status. Head Recruiter/Admin manage operational fields/statuses, including reopening FILLED; specific Admin-only bonus and Admin/Head-HR probation controls take precedence. Admin/Head Recruiter manages the position catalog in scope and assigns the Team Lead on recruiter-initiated vacancies. No Team Lead means no submission/routing. Probation defaults to 90, range 30–90 days; only Admin/Head HR changes it; PROB-05 remains.

- **Visibility:** Admin all; Head Recruiter, Head HR and HR within their role's verticals; Team Lead only current own vacancies (`team_lead_id`, D67); Recruiter assigned vacancies plus unassigned `OPEN` in their verticals (D1). D53 application-owner read access is added with applications, before routing ships. No broader creator-based access is inferred.
- **Scope parity:** list, detail, search, filter options, counts and shared links use the same server-side scope. Finance/foreign vertical/deleted objects do not leak existence and return the inherited 404 behavior. Existing D63 MFA handling remains authoritative.
- **Persistence:** real database records through API/services/repositories; no application mock data. Migrations are additive, vacancy numbers never reused, soft-delete rules remain.
- **Writes:** validation and authorization on the server; stale versions reject atomically; every state change records audit and business history. The read slice emits no synthetic write events.
- **UI:** Ukrainian via messages; desktop and mobile; keyboard access; light/dark; distinct loading/error/empty/filtered-empty states. Heavy future blocks remain absent until real data and behavior exist.
- **Future integrations:** pipeline, candidate counts, bonuses and notifications are not represented by invented amounts, counts, timelines or inert controls.

## V1 — first end-to-end slice

### STORY-VAC-04-1: View and find permitted vacancies

As a **recruiting participant in my vertical**, I want a searchable list of the vacancies I may open, so that I can find the relevant hiring request.

**Acceptance criteria**

- Given persisted vacancies, When I open «Вакансії», Then the first screen already contains permitted data and the list remains consistent after reload.
- Given several vertical/role assignments, When I search by vacancy title/number or apply status/vertical filters, Then the result is the intersection of the filters and my allowed vacancies; URL/reload/Back preserve the selected filters.
- Given more than one page, When I page forward/back, Then a stable cursor order avoids duplicate or missing records; an invalid/unavailable cursor cannot reveal another scope. Output is bounded and long retained lists use the project's rendering policy.
- Given a vacancy, Then its number, title, vertical, available Team Lead/recruiter identities, actual VAC-02 status and urgency/source badges reflect persisted values. «Термінова» and «З бота» are badges rather than statuses (A-14/A-31).
- Given a Team Lead view, Then the list contains only their current own vacancies; a recruiter sees only assigned plus unassigned-open vacancies in their role's verticals. Changing the creator does not widen either scope.
- Given no data or no filter matches, Then the appropriate empty state is shown; filtered empty offers «Скинути фільтри». Given a failed request, Then retry is available and unrelated shell controls stay usable.
- (negative) Given Finance, a foreign-vertical user, or a recruiter seeking another recruiter's assigned vacancy, When they request the list/detail/search/filter options, Then no forbidden record, identity, count or title is returned.

**Data / validation:** position belongs to vacancy vertical; current Team Lead and recruiter assignments refer to the correct vertical; queries are schema-validated. Initial filters are search/status/vertical. Additional filters appear only with real scoped option endpoints.
**Events / notifications / statistics:** read-only; no notifications. Candidate funnel/hire counts wait for application data. Show the opening date while Q-86's pause-sensitive «Відкрита N днів» calculation is unresolved.
**Edges:** equal sort values, mixed roles/verticals, deactivated assignees retained as history, nullable Team Lead for recruiter-initiated vacancies, soft-deleted vacancies excluded, status/filter change resets cursor.

### STORY-VAC-04-2: Open a real read-only vacancy card

As a **user allowed to read a vacancy**, I want to open its details from the list or a direct link, so that I can understand the request and its responsible team.

**Acceptance criteria**

- Given a visible list row, When I select/open it, Then the desktop preview and full card identify the same persisted vacancy; mobile opens a usable full card. A close/back action returns to the list context.
- Given a direct vacancy URL, When I reload it, Then the same authorized record opens. A not-found or forbidden object returns an actual HTTP 404 using the existing protected-shell pattern.
- Given stored fields, Then the card shows the vacancy number, title, status, vertical, current Team Lead/recruiters and available vacancy details; fields absent from the stored request are represented honestly.
- Given an opening date, Then it is displayed in Europe/Kyiv; the ambiguous paused-days counter is not inferred from elapsed wall time.
- Given read-only V1, Then unimplemented create/edit/status/assignment/clone/delete/bulk actions and future candidate/bonus sections are absent, with no inert buttons or made-up pipeline data.
- (negative) Given an out-of-scope UUID or a copied link opened by Finance, Then the card/preview request returns 404 and discloses neither its title nor team.

**Data / validation:** detail returns only current-scope fields. Rich text is rendered safely; a future editor does not justify importing its bundle into the initial read screen.
**Events / notifications / statistics:** no read event is invented; real existing vacancy events may be shown only if their authenticated timeline is implemented in this increment. Full timeline interactions are V4.
**Edges:** missing/deleted record, background permission/assignment change, nullable Team Lead, long titles and mobile content, failed detail loading independent of the list.

### STORY-VAC-07-1: Stable human-readable vacancy identities

As a **recruiting participant**, I want a permanent vacancy number, so that a vacancy can be identified consistently in cards, lists, links and search.

**Acceptance criteria**

- Given any seeded or newly persisted vacancy, Then it has one unique company-wide number formatted `V-0001` or the corresponding longer sequence value.
- Given concurrent creation or soft deletion, Then numbers are unique and never reassigned; gaps do not change existing numbers. The internal UUID remains the API identity.
- Given search by number, Then only a vacancy the caller can read is returned.
- (negative) Given a caller without access, Then knowing a valid number does not reveal a vacancy or bypass the UUID-detail scope.

**Data / validation:** database-enforced uniqueness; later writes reuse the same allocation mechanism. Seed re-runs keep existing identities stable.
**Events / notifications / statistics:** number is part of real creation history when creation ships; no standalone read-side event or statistics change.
**Edges:** concurrent allocation, values over 9999, failed transaction leaving a sequence gap, idempotent seed, soft deletion and later restore.

### STORY-ROLE-06-1: Preserve open vacancy work during user/role changes

As an **Admin**, I want open vacancy work protected when a user or a role is removed, so that no active vacancy loses its responsible participant (D24/D43).

**Acceptance criteria**

- Given real open vacancy/assignment rows, When I inspect deactivation or role removal, Then the affected open work is detected rather than returning the Phase-1 no-domain-data result.
- Given affected work has not been reassigned under the relevant policy, When I submit deactivation or remove the responsible role, Then the change cannot complete, the user sees a clear Ukrainian explanation, and existing assignments/history remain intact. The check runs before any Auth-provider ban/session/factor change.
- Given the full reassignment flow in V3, When every affected group has a valid replacement, Then reassignment and the account/role operation meet D24/D43 with audited history.
- (negative) Given a non-Admin, foreign-vertical replacement, or a concurrently changed assignment, Then authorization/version checks prevent an invalid reassignment or partial deactivation.

**Data / validation:** relevant open vacancy responsibilities, active replacement's role/vertical, current versions; do not misclassify closed/deleted vacancies as open work.
**Events / notifications / statistics:** failed operations emit no successful role/account/vacancy state-change events; successful reassignment later records real changes atomically. No new Phase-1 notification behavior is invented.
**Edges:** last Admin/self restrictions remain; role removal affects only the work tied to that role; multiple roles in one vertical; concurrency between reassignment and deactivation.

V1 must preserve this safety property before introducing open work; the complete reassignment UI is delivered with V3. Its absence does not permit successful orphaning.

### STORY-SEED-2: Deterministic vacancy demonstration data

As the **owner reviewing V1**, I want realistic persisted vacancies across the demo users' scopes, so that I can inspect the design and permission differences.

**Acceptance criteria**

- Given the local seed, Then the Gambling/Crypto position catalogs and visible vacancy examples include Vasyl/Taras own vacancies, assigned and unassigned-open recruiter cases, and a recruiter-initiated vacancy without a Team Lead.
- Given repeat seeding without a reset, Then UUIDs/numbers remain stable and no duplicate positions/vacancies/assignments/events appear.
- Given the browser screenshot clock and dataset, Then desktop/mobile and light/dark captures are reproducible and included in the Phase-2 gallery.
- (negative) Given a hosted/nonlocal target, Then the inherited seed guards refuse to write; demo data never weakens application authorization.

**Data / validation:** real local database seed, Ukrainian labels, fixed causal timestamps and role-compatible assignments. No invented applications, counts, bonus schemes or active-work history is inserted merely to fill a future UI block.
**Events / notifications / statistics:** real creation/history seeds if the increment exposes a timeline; no emails/Telegram or placeholder aggregates.
**Edges:** existing demo data preserved; no database reset without owner authorization; numbering stays stable; role-scoped screenshot accounts see only their fixture records.

## V2–V4 — subsequent vacancy stories

| Story           | User outcome and acceptance boundary                                                                                                                                                                                                                                                                                                                                                                                                         | Questions / dependencies                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| STORY-VAC-01-1  | Authorized users create/request a complete vacancy; validated fields, real position lookup, initial status per D87/Q-168 (D2 approval no longer gates Team Lead requests), default headcount 1 and probation default 90/range 30–90; Finance/HR/foreign scopes denied                                                                                                                                                                        | D76/D78 confirmed; required/optional field rules documented before form implementation                                |
| STORY-VAC-01-2  | Allowed users edit only their permitted fields; stale writes reject; before/after history is atomic; foreign scope and prohibited field patches denied                                                                                                                                                                                                                                                                                       | D75/D78 confirmed; operational edit rights never override Admin-only bonus or Admin/Head-HR probation controls        |
| STORY-VAC-02-1  | Authorized status actions respect VAC-02; automatic FILLED requires real probation/headcount integration; unauthorized/manual shortcuts denied                                                                                                                                                                                                                                                                                               | D75 confirmed; candidate/pipeline integration for auto-fill                                                           |
| STORY-VAC-03-1  | Admin/Head Recruiter assign eligible recruiters; recruiter self-assigns only to an unassigned OPEN vacancy in their vertical; concurrent claims cannot double-assign                                                                                                                                                                                                                                                                         | D1; V1 database scope and assignment model                                                                            |
| STORY-VAC-03-2  | Recruiter-initiated vacancy has no Team Lead until authorized assignment; its creation status depends on Q-168                                                                                                                                                                                                                                                                                                                               | D77 confirmed: Admin/Head Recruiter assigns Team Lead; no submission/routing before assignment; Q-168                 |
| STORY-VAC-03-3  | Team Lead «Запросити вакансію» (position from catalog, headcount, urgency, comment) creates an `OPEN` vacancy with `team_lead = self`, visible at once to the vertical's recruiters (D1); the Team Lead sees only own vacancies. Negative: Recruiter/HR/Finance and a Team Lead outside the vertical cannot request; no `DRAFT` is ever created by the request. Edge: unknown position, duplicate submit (idempotent), deactivated Team Lead | D86/D87 confirmed; Q-168 (notification recipients, fate of the approval setting), Q-169 (completeness of the vacancy) |
| STORY-VAC-04-3  | Candidate list/mini-funnel and every related count include only applications the viewer can open; histories show real changes                                                                                                                                                                                                                                                                                                                | D19/D52/D53; real candidates/applications, timeline sensitivity rules                                                 |
| STORY-VAC-05-1  | Clone creates a separately numbered vacancy without changing the original; optional rejected-good suggestions use real eligible applications                                                                                                                                                                                                                                                                                                 | Candidate/application data; clone-field/candidate rules reviewed before shipping                                      |
| STORY-ARCH-03-1 | Soft-delete never abandons active applications; permitted resolution is required and atomic; unauthorized recruiter deletion is rejected per D13                                                                                                                                                                                                                                                                                             | ARCH-03; Q-100; archive/restore user flows remain Phase 5                                                             |
| STORY-UI-09-1   | «Поділитися» copies the actual vacancy link; the recipient's access is checked independently and denied access returns 404                                                                                                                                                                                                                                                                                                                   | D58; usable vacancy card and accessible copy-failure state                                                            |

Each subsequent write story is expanded into Given/When/Then, field validation, event/notification/statistics effects and edge cases before its implementation; this table is the delivery backlog rather than acceptance of unanswered policy.

## Traceability

| PRD / decision                           | Stories          | Test evidence                                                       |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| VAC-01/02/04, VIS-01..03, D1/D19/D53/D67 | STORY-VAC-04-1/2 | QA fills actual integration/API/browser cases after implementation  |
| VAC-07                                   | STORY-VAC-07-1   | QA fills uniqueness, scope and number-search cases                  |
| ROLE-06, D24/D43/D45                     | STORY-ROLE-06-1  | QA fills open-work account/role-denial and later reassignment cases |
| CLAUDE §8, SHOT-01..03                   | STORY-SEED-2     | QA fills idempotence and Phase-2 gallery cases                      |
| VAC-01..05, ARCH-03, UI-09               | V2–V4 backlog    | Expanded and linked as each increment starts                        |

## Ready for design

- V1 scoped list/search/status/vertical, real read-only preview/detail and numbers, deterministic seed and existing-account open-work safety.
- V2/V3 write-policy design is unblocked by owner decisions D75–D78; implementation still follows V1 rather than silently expanding the first slice.
- Match the designer's visual hierarchy with actual configured vertical names, approved statuses/badges, cursor pagination and role-aware fields.

## Blocked by questions

- **V1 days-open counter:** resolved by D85 — exact opening date only.
- **V2 vacancy creation:** Q-168 (D87 vs D2: approval setting, `DRAFT` entry path, recruiter-initiated status, notifications) and Q-169 (completeness of Team Lead requests). Q-166 is resolved by D86/D87. HR/Head HR landing (D88) is outside the vacancy slices; Q-167 covers it.
- **Later deletion increment:** Q-100 per-application deletion resolution when active applications arrive. Q-26/48/49/50 are resolved by D75–D78 and no longer block writable vacancy design.
- **Future blocks:** Q-98 routing-group visibility (Phase 3), Q-106/107/110/111 reward-change details (Phase 4), Q-152 dashboard KPI definitions. These do not block V1 and are not silently accepted.
