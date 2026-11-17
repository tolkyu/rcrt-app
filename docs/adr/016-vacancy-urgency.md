# ADR-016 — Vacancy urgency change and red highlight (STORY-VAC-08-2, STORY-VAC-04-4)

- **Status:** Accepted (design for the build after STORY-VAC-03-3); one scope question open (see «Open question»)
- **Date:** 2026-11-17
- **PRD:** VAC-01, VAC-02, VAC-04, VAC-08, ROUTE-01, HIST-01..03, AUD, D75, D90, D92, D94, D97, D99, D100; builds on ADR-002, ADR-003, ADR-007, ADR-012

## Context

- «Терміновість вакансії» (Звичайна/Термінова) is a flag on the vacancy. It is set at creation (D100) and afterwards changed only by Head Recruiter and Admin through `vacancy.update` (D90, D94). It never influences routing; the Team Lead priority (ROUTE-01, `vacancy.priority.override`) is a separate concept.
- Already in the code, no work needed: `vacancy.priority_flag` (`'NORMAL' | 'URGENT'`, NOT NULL, default `NORMAL`, CHECK `vacancy_priority_chk`), `app_rw` column `UPDATE` on `priority_flag` and `version` (migration 0015), `priority` and `version` in the list and detail SELECT (`summaryColumns`, `findVacancy`), `VacancySummary.priority`, list filter `priority`, `UrgencyControl` (native radios, no Radix), `VacancyFlags` + `isUrgentHighlighted` + `urgentEdge` (red for `DRAFT/OPEN/ON_HOLD`, neutral badge for `FILLED/CANCELLED`) used by list row, mobile card, preview and detail header, seed rows for urgent open / on hold / filled / cancelled, contrast unit test, screens E2E.
- Not in the code: any write of `priority_flag` after creation of an opened vacancy. `PATCH /vacancies/{id}` edits only the author's own `DRAFT` (ADR-012 addendum S2) and answers 409 `VACANCY_NOT_DRAFT` otherwise; the general VAC-08 edit matrix for opened vacancies is a later slice.
- Catalog fact that drives the authz design: `TEAM_LEAD` holds `vacancy.update` with scope `OWN` (`roles.ts`, VAC-08: Team Lead edits own vacancy except urgency). `can(…, 'vacancy.update')` alone would therefore let a Team Lead change urgency.
- No per-vacancy Team Lead priority override storage exists (no column, no table, no consumer; `vacancy.priority.override` is only a catalog code). Routing is Phase 3.

## Options

| Topic              | Options                                                                                                                                                | Verdict                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Storage            | A. Reuse `priority_flag`; B. new column/enum                                                                                                           | **A.** No migration, no grant change, no ERD change.                                                                                                                                                                                 |
| Endpoint           | A. Extend `PATCH /vacancies/{id}` to opened vacancies; B. dedicated `PUT /vacancies/{id}/urgency`                                                      | **B.** A would force the whole VAC-08 field/status matrix now and change the draft route's error contract (`VACANCY_NOT_DRAFT`, `hideUnless: authorsAnywhere`). B is one field, one permission rule, one event.                       |
| Authz gate         | A. New code `vacancy.urgency.set` (G, V); B. keep `vacancy.update` (D94, matrix footnote ᵃ) and require a **broad** (GLOBAL or VERTICAL) grant for it | **B.** D94 and `docs/authz-matrix.md` state `vacancy.update`; no catalog/matrix-table/custom-role change. The rule is one helper (same style as `canSetCreateProbation`). Revisit A if custom roles need urgency without general edit. |
| Event              | A. `vacancy.updated {fields:['priority']}` (names only); B. new `vacancy.urgency_changed {from,to}`                                                    | **B.** The timeline must show «Звичайна → Термінова»; `vacancy.updated` carries field names only (SEC-CORE-07). Enum values are allowed in payloads (precedent `vacancy.status_changed {from,to}`).                                   |
| Live other-tab fix | A. Build the Realtime bridge now; B. rely on invalidation + `refetchOnWindowFocus` (default on, `staleTime` 30 s)                                      | **B** for this slice. ADR-007 decision (Realtime: yes) stands; the bridge is its own story (no consumer, no `change_feed` pruning job yet).                                                                                          |

## Decision

### Schema and migration

- **No migration, no ERD change, no grant change.** Verified: `app_rw` already has `UPDATE (priority_flag, version, updated_at)` (0015); trigger `vacancy_lifecycle_guard` guards only `opened_at`/`status`.
- Seed: no change expected (urgent `OPEN`, `ON_HOLD`, `FILLED`, `CANCELLED` and a `NORMAL` open vacancy exist per vertical). QA verifies `tests/integration/vacancies-seed.test.ts` still covers one `NORMAL` open vacancy for the Head Recruiter toggle E2E.

### Endpoint

`PUT /api/v1/vacancies/{vacancyId}/urgency`, tag `Vacancies`, operationId `setVacancyUrgency`, `defineRoute` with `permission: 'vacancy.read'`, `requireGrant: 'vacancy.update'`, no `hideUnless` (the route gate is object-independent, so a plain 403 for callers without any `vacancy.update` leaks nothing).

| Item     | Value                                                                                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body     | `{ priority: 'NORMAL' \| 'URGENT', expectedVersion: positive int }`, strict. The wire field stays `priority` (existing list/detail DTO and filter contract); the OpenAPI summary says «vacancy urgency flag, not the Team Lead priority». UI copy uses «Терміновість вакансії» only. |
| Response | 200 `VacancyDetail` (fresh, includes new `version` and `canChangeUrgency`)                                                                                                                         |
| Errors   | 400 validation · 401 (`MFA_REQUIRED` for a withheld Admin grant) · 403 · 404 · 409 `STALE_STATE` · 409 `VACANCY_URGENCY_LOCKED` · 429                                                               |
| Limit    | `consumeVacancyWriteLimit` (30 writes per user per minute, shared bucket)                                                                                                                          |
| Idempotency | Not required: setting a value with `expectedVersion` is naturally idempotent. A same-value request after a matching version writes nothing (no bump, no event, no audit), as `PATCH` of positions.                |
| Contract | Zod `setVacancyUrgencySchema` in `lib/schemas/vacancy.ts` (shares `VACANCY_PRIORITIES` and the existing `expectedVersion`); regenerate OpenAPI and Postman.                                          |

### Authorization

| Caller                                                    | Result                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Finance, no `vacancy.read` (and Admin without aal2: 401 `MFA_REQUIRED`) | 404 (route gate `vacancy.read`) / 401                                                                                   |
| HR, Head HR, Recruiter (no `vacancy.update` grant)        | 403 at the route gate, before params and body                                                                           |
| Team Lead (grant `vacancy.update` OWN)                    | own vacancy: **403** (object visible, no broad grant); another Team Lead's vacancy or foreign vertical: **404**         |
| Head Recruiter, own vertical                              | 200 on `OPEN`/`ON_HOLD`                                                                                                 |
| Head Recruiter, foreign vertical                          | 404 (not visible)                                                                                                       |
| Admin (aal2)                                              | 200 on any vertical                                                                                                     |
| Anyone on someone else's `DRAFT` (Admin and Head Recruiter included) | 404 (D92, existing `readVacancy` predicate)                                                                             |
| Author on their own `DRAFT` or never-opened `CANCELLED`   | 409 `VACANCY_URGENCY_LOCKED`; the author changes a draft's urgency through the existing draft `PATCH`                   |
| `FILLED` or `CANCELLED` (opened before)                   | 409 `VACANCY_URGENCY_LOCKED` (VAC-08 status rule); the stored flag is never changed by a status change (D99)            |

- **New pure rule, one place** `server/authz/vacancy-urgency.ts`:
  - `hasBroadUpdate(ctx, verticalId): boolean` — a `vacancy.update` grant whose scope kind is `GLOBAL` or `VERTICAL` and covers the vertical. `OWN` never counts. Mixed roles stay per vertical (Team Lead in A + Head Recruiter in B: A denied, B allowed; same user both in one vertical: allowed).
  - `canChangeUrgency(ctx, vacancy: Pick<VacancyRef,'verticalId'|'status'>): boolean` = `hasBroadUpdate && isUrgencyChangeable(status)`.
- Order in `setVacancyUrgency` (same lock discipline as ADR-012, users before vacancy): admit (`vacancy.read`) → write limit → parse body and id (bad uuid → 404) → in one transaction: `readVacancy` (scoped, 404) → 403 unless `hasBroadUpdate` → `lockAuthors(ctx, tx, [])` (caller `FOR SHARE`, fresh role rows; a lost broad grant → 403) → `lockVacancy` (`FOR NO KEY UPDATE`; missing or deleted → 404) → status not `OPEN`/`ON_HOLD` → 409 `VACANCY_URGENCY_LOCKED` → `version !== expectedVersion` → 409 `STALE_STATE` → same value: return the current detail, write nothing → compare-and-set `updateVacancy(tx, id, {status, version}, {priorityFlag}, now)`; no row → 409 `STALE_STATE` → event + audit → re-read through `readVacancy`.
- The response and the detail DTO carry **`canChangeUrgency: boolean`** (computed from `ctx.auth` in `readVacancy`), so the UI shows the control from the server's decision, never from role names. It is advisory; the service re-checks.
- `docs/authz-matrix.md`: footnote ᵃ already states the rule. Add only a one-line pointer to this ADR and the allowed/denied test names; the permission catalog and `matrix-table.ts` do not change.

### Concurrency

- Optimistic concurrency by `expectedVersion` (the convention of positions, users and drafts): judged on the locked row and enforced again by the compare-and-set `WHERE version = expected`. Of two racing changes the second gets 409 `STALE_STATE`; the UI refetches the card and tells the user (below). Any version bump (urgency now, status/edit later) makes an in-flight change stale, so the control always acts on the version the user saw.

### Event, audit, notifications

| Item   | Decision                                                                                                                                                                                                                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event  | `vacancy.urgency_changed`, payload `{ from, to }` (`z.enum(VACANCY_PRIORITIES)`, strict, `from !== to`) added to `EVENT_PAYLOADS`. `subjectType: 'vacancy'`, `subjectId` and `vacancyId` = vacancy, `verticalId` = vacancy vertical (the vacancy has opened, so the vertical is never null; no draft-era author-only rule applies). Actor and time come from the envelope. `priority` stays in `VACANCY_EDIT_FIELDS` for the draft edit. |
| Audit  | `writeAudit` action `vacancy.urgency_changed`, entity `vacancy`, `before: {priority}`, `after: {priority}`. Not added to `AUDIT_ACTION_GROUPS` (no vacancy entity in the viewer yet; it shows as «Інша дія», like `vacancy.created`).                                                              |
| Feed   | No `change_feed` row yet (no consumer; ADR-012 rule). When the bridge ships the call is `emitChange(tx, ctx, {entityType:'vacancy', entityId, kind:'urgency_changed', topic:{verticalId}})`. Recorded as a PROGRESS gap, not a TODO in code.                                                        |
| Notify | None in Phase 2 (D93). Phase 5 can read the event.                                                                                                                                                                                                                                                 |
| Routing | Untouched: the service never reads or writes Team Lead priority tables or `vertical.tl_priority_changed`; a test asserts the TL priority rows are unchanged.                                                                                                                                      |

### Reads (no extra query)

- List and detail already select `priority`, `status` and `version` in the same single statement; the red/neutral decision needs nothing else. `canChangeUrgency` is computed in memory from the loaded `AuthContext` and the row's `verticalId`/`status`. Hot path: PK lock, one UPDATE, two inserts, one re-read (about 9 statements including the rate limit; integration test caps at 12, like publish). No index, no scan.

### Closed-status display rule (STORY-VAC-04-4, D99)

- Move the rule out of the client component into the pure module **`lib/vacancy-urgency.ts`** (no React, no server imports, so server and client share one definition of «closed»):
  - `CLOSED_VACANCY_STATUSES = ['FILLED', 'CANCELLED']` (VAC-02 only, never dates);
  - `isUrgentHighlighted({priority, status})` = `URGENT` and not closed;
  - `isUrgencyChangeable(status)` = `OPEN` or `ON_HOLD`.
- `components/vacancies/vacancy-badges.tsx` imports it (`urgentEdge`, `VacancyFlags` keep their API); the label «Термінова» is shown for every `URGENT` status, the tone is `danger` or `neutral` by the helper. Future board headers, pickers and candidate chips reuse `VacancyFlags`.
- STORY-VAC-04-4 residual work after this extraction: unit matrix (5 statuses × 2 urgencies), E2E for the cross-tab and same-tab flips, gallery states for the new control. The red styling, label, seed rows and contrast test already exist.

### Client: optimistic mutation and cache keys

| Item                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Control               | The existing `UrgencyControl` in the detail header actions of `VacancyOverview` (card and preview), rendered only when `vacancy.canChangeUrgency`. Label «Терміновість вакансії». No control in list rows (rows carry no `version`). Closed or draft: no control, the badge stays. It is `aria-disabled` while a change is in flight, so versions never overlap. |
| Keys read/written     | `queryKeys.vacancy(id)` (detail: patched, then replaced by the response) and every `['vacancies', …]` list under `queryKeys.vacanciesAll()` (rows with that `id` patched in place; sort is by public number, so no reorder).                                                                                                                                                                              |
| Flow                  | `onMutate`: cancel those queries, snapshot the detail and the touched rows, set `priority` (the red highlight flips at once through the shared helper). Success: `setQueryData(detail, response)`. Error: restore only the fields this change touched. Settled: `invalidateQueries(queryKeys.vacanciesAll())` and, on 403/404/409, the detail key (ADR-007 invalidation map: «vacancy fields»); the `['vacancies','draft-count']` refetch under that prefix is accepted (one cheap query).      |
| Error toasts          | 409 `STALE_STATE`: rollback, refetch, toast «Вакансію щойно змінили. Дані оновлено.»; 409 `VACANCY_URGENCY_LOCKED`: rollback, refetch (card shows the new status); 403/404: rollback, refetch; network/5xx: rollback and retry action. Copy in `messages/uk.json` (Ukrainian, proposed; `ux-ui-designer` confirms).                                                                                       |
| Bundle (PERF-04)      | Create/edit routes sit at 178.2/180 kB. Keep the optimistic logic in a lazily imported module (`retried(() => import(...))`, preloaded on hover/focus like draft publish), not in the card's first chunk; `performance-engineer` checks the card route budget.                                                                                                                                            |
| Other tabs            | No Realtime yet: another open list/card updates on focus or visibility refetch (stale after 30 s) or the next navigation. STORY-VAC-04-4 AC «without a reload» is met by background refetch/invalidation; the instant push arrives with the Realtime bridge story.                                                                                                                                       |

## Open question

- STORY-VAC-08-2 AC 2 (Admin sets «Пріоритет тімліда для цієї вакансії», event `vacancy.priority_overridden`) needs storage and a consumer that do not exist: no override table/column, no routing engine before Phase 3 (ROUTE-01, ROUTE-02). **Recommendation: this build ships only the urgency half (AC 1, 3 partly, 4, 5); the Admin override control, its table, the event and its aal2 tests move to the Phase 3 routing slice**, where the schema is designed with `routing.nextVacancy()`. The orchestrator asks the owner before the story text is narrowed.

## Consequences

- (+) No migration; one dedicated, small, fully tested write path; Team Lead denial is explicit and tested instead of relying on role names.
- (+) Urgency and Team Lead priority stay separate in code (different permission, event, tables, copy).
- (+) One shared pure «closed» definition for server rule and UI.
- (−) A new DTO field `canChangeUrgency` changes `VacancyDetail`: existing deep-equal fixtures, OpenAPI and Postman need regeneration.
- (−) Until the Realtime bridge ships, other tabs see the flip on focus or after 30 s.
- (−) `vacancy.update` now has two meanings (Team Lead OWN general edit, broad urgency). Acceptable while the field is single; the general VAC-08 edit slice should split urgency into its own code if a third rule appears.

## Build plan

**Sequence:** build after STORY-VAC-03-3 is merged (it touches `server/events/index.ts`, `server/services/vacancy.ts`, `lib/schemas/vacancy.ts`, `messages/uk.json`). Slices, each ≤ 400 lines: (1) server (rule, schema, event, service, route, OpenAPI), (2) client (helper extraction, control, optimistic hook, messages), (3) tests, Postman, screenshots.

| Area      | Files                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New       | `server/authz/vacancy-urgency.ts` · `server/services/vacancy-urgency.ts` · `app/api/v1/vacancies/[vacancyId]/urgency/route.ts` · `lib/vacancy-urgency.ts` · `components/vacancies/use-change-urgency.ts` (+ lazy `lib/vacancy-urgency-optimistic.ts`) · `components/vacancies/urgency-field.tsx` (control + pending/error wiring)                                                                          |
| Changed   | `server/events/index.ts` (payload) · `lib/schemas/vacancy.ts` (`setVacancyUrgencySchema`, `canChangeUrgency` on detail) · `server/services/vacancy.ts` (`readVacancy` computes the flag) · `components/vacancies/vacancy-badges.tsx` (import helper) · `components/vacancies/vacancy-overview.tsx` (header actions) · `messages/uk.json` · `docs/authz-matrix.md` (pointer) · `lib/query-keys.ts` (no change expected) |
| Generated | `pnpm api:openapi`, `pnpm api:postman`                                                                                                                                                                                                                                                                                                                                                                       |

## Tests

| Layer       | Cases                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `hasBroadUpdate` / `canChangeUrgency` for every built-in role and mixed roles (Team Lead A + Head Recruiter B; Team Lead and Head Recruiter in one vertical); `lib/vacancy-urgency.ts` matrix (5 statuses × 2 flags: highlight only for `DRAFT/OPEN/ON_HOLD` + `URGENT`; changeable only `OPEN/ON_HOLD`); event payload allowlist (accepts `{from,to}`, rejects extra keys and `from === to`); request schema (strict, version required)  |
| Integration | Allowed: Head Recruiter own vertical, Admin (aal2) → 200, flag, `version + 1`, one `vacancy.urgency_changed {from,to}` event with actor/time/vertical, one audit row. Denied: Team Lead of the vacancy 403, other Team Lead 404, Recruiter/HR/Head HR 403, Finance 404, Head Recruiter of another vertical 404, someone else's draft 404 (Admin too), Admin without aal2 401, no write/event/audit in every denial. Conflict: stale `expectedVersion` 409 `STALE_STATE`; two parallel calls with one version → one 200, one 409, exactly one event. Status: `FILLED`, `CANCELLED`, author's `DRAFT` → 409 `VACANCY_URGENCY_LOCKED`; `ON_HOLD` allowed; reopen keeps the stored flag. Same value → 200, no bump, no event. Independence: Team Lead priority rows and routing order unchanged. Lost grant between read and lock → 403. Statement cap 12. List and detail: `priority` and `canChangeUrgency` correct per role, no leak for out-of-scope vacancies (urgency filter reveals nothing hidden) |
| API/Newman  | `PUT /urgency` allowed/denied/409 cases in the generated collection; OpenAPI contract test for the route and the new detail field                                                                                                                                                                                                                                                                                                  |
| Component   | Control visible only with `canChangeUrgency`; optimistic flip + rollback on 409/403/5xx; `aria-disabled` while pending; toasts; row and card turn red and back through the shared helper                                                                                                                                                                                                                                          |
| E2E         | Head Recruiter flips «Звичайна» → «Термінова» on the card: red at once, history later; second tab (same context) turns red after focus refetch without reload; Team Lead sees no control; closed urgent vacancy neutral with no control                                                                                                                                                                                         |
| Screenshots | Lean matrix (D125): Head Recruiter card with control (desktop light + one dark; mobile 390×844 for the header layout), pending/conflict toast wording as E2E assertions only. Existing urgent open/on-hold/filled/cancelled captures are not re-taken unless the header layout changes                                                                                                                                         |
| Review      | `security-engineer` (authz/IDOR, Team Lead denial), `performance-engineer` (card route bundle, statement count)                                                                                                                                                                                                                                                                                                  |
