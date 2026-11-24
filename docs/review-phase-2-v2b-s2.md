# Review: V2b S2 (author-only vacancy draft lifecycle), uncommitted, branch phase-2

Verified: `vitest run tests/unit` (62 files, 2346 tests) green; `tests/integration/vacancies*` + `database.test.ts` (11 files, 247 tests) green against the local DB. Not run: Newman, lint/typecheck (reported green by caller).

## Blocking

None found. Lock order (users FOR SHARE -> roles -> position FOR SHARE -> vacancy FOR UPDATE), status judged on the locked row, idempotent claim rolled back with the transaction on any refusal, column-level UPDATE grant (no created_by / vertical_id / source / public_no / created_at), draft-era events with vertical_id NULL: all correct and covered by deterministic lock-race tests.

## Should fix

1. docs/stories/phase-2.md STORY-VAC-01-3 negative AC says Team Lead, HR, Head HR and Finance get 404 on edit/publish/cancel/delete; `admit()` (server/services/vacancy-draft.ts:50) answers 403 to HR / Head HR (no `vacancy.create` grant) and 404 only to Finance. The handoff already flags it as an owner-visible decision. Fix: either get owner confirmation and amend the AC to «403 without an authoring role (object-independent, discloses nothing)», or make `admit` throw `NotFoundError` for these calls (the create route keeps 403). Do not ship the S3 UI on an unrecorded deviation.
2. server/events/index.ts:22-28 re-declares the status list literally. Fix: `z.enum(VACANCY_STATUSES)` imported from `lib/vacancy-filters` (the events module already imports from `lib/`). Duplicate source of truth with schema.ts / authz/types.ts.
3. server/services/vacancy-draft.ts:148-215 spells the 13 editable fields three times (`next`, `changed`, `updateVacancy` argument). Fix: one table `[field, nextValue, currentValue, equal]` or a helper `diff(next, row)` that yields both `fields` and the `VacancyChanges`; adding a field today means editing five places (schema, VACANCY_EDIT_FIELDS, next, changed, update) and `satisfies` catches only one of them.
4. server/services/vacancy-draft.ts:137-143 `assertPositionUsable` runs whenever `body.positionId` is sent, even if it equals the stored one: re-sending an unchanged position whose catalog entry was deactivated gives 409 `POSITION_INACTIVE` on an otherwise unrelated edit. Fix: only check when `body.positionId` differs from `current.position?.id` (publish still re-validates).
5. server/authz/can.ts:160 / types.ts:87 `neverOpened` and `vacancyEventReadWhere` (vacancy-scope.ts:86) have no production caller yet (tests only), which CLAUDE.md §4 calls unused code. Acceptable as the guard the architecture test points at, but record it in PROGRESS as «consumers pending (VAC-04 detail, timeline)» so it is not deleted or forgotten.
6. Scope of the diff: docs for D100..D109 / ROLE-07 queued / Head Recruiter single vertical (stories phase-1, phase-2, PRD, test-plan, wireframes) are bundled with S2. Split into a docs commit and the S2 feature commit (`feat(vacancies): draft lifecycle ... [VAC-01..03, D82, D92, D98]`) so history and revert stay clean.

## Nit

1. Comments exceed the CLAUDE.md §4 «one short JSDoc line» rule: vacancy-draft.ts:61-65, 78-81, 255-261 (7 lines), vacancy.ts `lockAuthors`, can.ts:156. The design is already in the ADR addendum; cut each to the single non-obvious why.
2. vacancy-draft.ts:73,128,291,358 repeat `current.vertical.id as VerticalId`. Fix: type `VacancyDetail.vertical.id` as `VerticalId` once in `readVacancy`, drop the casts.
3. vacancy-draft.ts:393 `cancelVacancyDraft` reads the result with `ctx.db` after the transaction committed: one extra round trip and a (tiny) window where the row can change. Have `closeDraft` read inside the transaction and return the detail (delete maps it to `{ id }`).
4. repositories/vacancy.ts `lockVacancy` selects the whole row including the two rich-text documents just to compare `version`, `status`, owner and a few columns; patch needs them for the merge, publish/cancel/delete do not. Acceptable now; select only needed columns if drafts get large.
5. Probation gate asymmetry: create refuses an explicit `probationDays: 90` from a caller without the permission (403, `!== undefined`), patch allows re-sending the stored 90 (gate only on change). Harmless; align or note in the ADR.
6. patchVacancySchema superRefine (lib/schemas/vacancy.ts ~218) checks min <= max for two present bounds and the service repeats it on the merged value via `salaryIssues`; the schema half is redundant but gives a cheaper early 400. Keep or drop deliberately.
7. messages/uk.json `draftErrors.*` (8 lines) have no consumer until S3 UI; fine, but confirm S3 uses them (no hard-coded copy) and that `notDraft` text also fits a cancelled draft.
8. Newman leaves one invisible row and a burned V-NNNN per run (documented gap). Consider a dev-only reset in the Newman prelude instead of accumulating rows in shared environments.

## Checked, no issue

- Layering: routes -> `vacancy-draft` service -> `repositories/vacancy`; no DB access in routes; authority via `vacancyAuthorKind` + the single `vacancyReadWhere` predicate (third arm for cancelled-never-opened drafts; not(cancelledDraft) in role arm).
- Soft delete (deleted_at/by/reason satisfy `vacancy_soft_delete_chk`), no hard DELETE grant, `cancelled_at = closed_at` satisfies `vacancy_cancelled_chk`.
- Events append-only, payloads field-names only, cancellation reason only in `entity_event_pii`; no PII in logs; audit row only at publish.
- Idempotency: claim before reads, replay compares hash (draft id), key reuse for another draft is 409 `IDEMPOTENCY_KEY_REUSED`.
- Tests cover denials (every role, foreign draft 404, Head Recruiter/Admin of same vertical, lost role/vertical, MFA, CSRF, rate limit) and concurrency (publish vs delete, edit vs publish, TL/position/role deactivated while queued).

## Verdict

APPROVED with Should-fix items 1-4 to be handled before the S3 UI (item 1 needs the owner). No blocking defects.

## Round 2 (re-review after fixes, 2026-11-10)

Verified: `corepack pnpm lint`, `typecheck` and `test` green (91 files, 2978 tests, local test DB).

### Round-1 findings

All code findings fixed: Should 1 (uniform 404, `hideWithoutGrant` + `authorsAnywhere`), 2 (`z.enum(VACANCY_STATUSES)`), 3 (`COLUMN_FIELD` / `diff`), 4 (position re-check only on change), 5 (PROGRESS records the pending consumers); Nit 2 (`VacancyView`), 3 (cancel reads inside the transaction). Security SEC-V2S2-01..04 and perf P2-1..P2-4, P3-2, P3-3 fixed. Open: Should 6 (split docs commit from the S2 commit, process only); SEC-V2S2-05 is Q-177 with the owner.

### Blocking

None.

### Should fix

1. Team Lead is not hidden at the route gate. `server/http/define-route.ts:209` + the four routes: a Team Lead holds `vacancy.create` (D87), so `hideWithoutGrant` passes and params, `Idempotency-Key` and body are parsed before the service `admit()` answers 404. A TL with a malformed body or no key gets 400, a TL with a valid one gets 404 (no draft oracle, but ADR-012 line 104 and the HTTP test at `vacancies-draft-routes.test.ts:434` claim «before any input is read» and cover only HR). Fix: replace the boolean by a predicate, e.g. `readonly hideUnless?: (auth: AuthContext) => boolean` checked right after `permission` (routes pass `authorsAnywhere`), and add a Team Lead (and TL + bad body) case to the HTTP test; or soften the ADR sentence and add the TL case with the real expectation.
2. `docs/erd.md:625` still lists `vacancy_cancelled_draft_author_idx` (dropped from 0015, schema and snapshot). Remove the clause and add «cancelled drafts have no index of their own».
3. `docs/security/threat-model.md` has none of T-Z19..T-Z22 proposed in the security report (draft disclosure, draft events, lifecycle bypass, orphaned drafts); add them, with T-Z21 pointing at `vacancy_lifecycle_guard`.

### Nit

1. `tests/integration/vacancies-draft-lifecycle.test.ts:1504` asserts `<= 13` statements while PROGRESS states 10; tighten to the measured count plus one so a regression is caught.
2. Multi-line JSDoc remains at `server/services/vacancy-draft.ts:288-292`, `server/repositories/vacancy.ts` (`lockVacancy` is one line, fine), `server/authz/vacancy-scope.ts:~96-101`; CLAUDE.md §4 wants one short line each.
3. `tests/integration/vacancies-plans.test.ts`: the 30k seed has no never-opened CANCELLED rows, so the new cancelled-list plan test proves the plan shape but not the author arm on data; add a handful of such rows for one author.
4. Lifecycle trigger fires only when `status` or `opened_at` is in the SET list (`BEFORE UPDATE OF`), which is exactly right for soft delete and edits; keep the `database.test.ts` cases that cover «update status = same value» if a VAC-08 writer ever re-sends it (allowed by the guard: no transition).

### Focus-area verdicts

- (a) `hideWithoutGrant`: HR, Head HR, Finance, no-role get 404 before any input is read; TL, authors elsewhere, foreign drafts get 404 after parsing (Should 1). Only the four draft routes set it; positions and create routes are unchanged (create keeps 403).
- (b) Publish CAS: correct. Stale version before validation, CAS on status + author + version + `deleted_at IS NULL`, miss classified 404 (gone/foreign/deleted) / 409 NOT_DRAFT / 409 STALE_STATE; hash binds `{vacancyId, expectedVersion}`; failed attempts roll the claim back; replay with same key and version returns the opened vacancy, a different version is 409 `IDEMPOTENCY_KEY_REUSED`.
- (c) `guard_vacancy_lifecycle`: DRAFT→OPEN (sets `opened_at` from NULL), DRAFT→CANCELLED, soft delete (trigger not fired), OPEN⇄ON_HOLD, →FILLED, FILLED→OPEN (D75 reopen), OPEN/ON_HOLD→CANCELLED all pass; opened_at change, anything→DRAFT, CANCELLED→other are refused. Not SECURITY DEFINER, `search_path = pg_catalog`, qualified names, no extra grants: consistent with 0011. Tests cover the allowed and refused matrix.
- (d) `vacancyEventReadWhere`: row-local, every event column via `sql.identifier`, vertical-wide roles never touch `vacancy`, per-vacancy scopes probe by primary key; draft-era events (vertical NULL) author-only; no leak across roles/verticals in the integration matrix.
- (e) Adjusted tests: plans seed (same data, `opened_at` set at insert because the trigger forbids the later clear), scope test (rolled-back transaction because CANCELLED is final, plus a post-rollback `true` assertion), privileges test (stronger: immutable columns denied, lifecycle UPDATE and `FOR UPDATE` allowed), index test (negative assertion for the dropped index). None weakened.

### Verdict

APPROVED. Should 1-3 are cheap and should land with the S2 commit; none blocks S3.
