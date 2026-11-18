# Review V3 slice 3 - Status API (branch v3-status)

Verdict: **APPROVED**. No blocking items. `corepack pnpm typecheck` in the worktree: green. Integration tests not run (as instructed).

## Blocking
None.

## Should fix (non-blocking)
- `server/services/vacancy-status.ts`: the CSRF half of pre-review 3.14 has no test in `vacancies-status.test.ts`. It sits in `defineRoute`, so it is covered generically only if a route-level test exists. Confirm one exists or add one 403 test on this route.
- No test that a cancelled published vacancy's reason reaches a draft-style reader wrongly. Add one assertion that a never-opened cancelled draft still returns `cancelReason` only to its author after the `getVacancyDetail` refactor. Slice 2/4 D123 tests may already cover it; check.

## Nit
- `lib/schemas/vacancy-status.ts:6`: local `expectedVersion` duplicates slice 4's export. Dedupe on merge (decision 3 accepted).
- `vacancy-cancel-reason.ts`: `findCancelReason` and `findCancelReasonOfVacancy` are thin wrappers. Fine, but the optional `cancelledBy` is the only switch; keep both names so the D123 key cannot be dropped by accident.

## Blast radius
- The one fact: `latestCancelReason` filters by `vacancyEventReadWhere`. A draft's events have `vertical_id` null, so non-authors are hidden at the SQL level. The caller-keyed `actor_id` filter is still applied on the draft path. `getVacancyDetail` picks the keyed reader through `isNeverOpenedCancelled`, so a draft never reaches the unkeyed reader.
- Proof: the test "the reason is read by everyone who reads the vacancy and by nobody else" (Head, HR, Head HR, Admin, assigned Recruiter, own TL see it; other-vertical Head, Finance, other TL get 404). The CANCEL test asserts the reason is absent from the event payload and audit, and present only in `entity_event_pii`.
- Beyond the diff: Admin purge of the vacancy or its author must delete `entity_event_pii` rows (A7e, T-Z22). The PROGRESS gap must exist. Free-text reason may carry PII and is now shown to every reader of the vacancy; UI must render it as text.

## Engineer decisions
1. Order grant, repeat, legality, version: correct per E4/A1. 200 on a repeat at a stale version is fine (test present).
2. 403 gate before the read for callers with no grant, Finance 404: correct (3.1). It is object-independent, so it leaks nothing.
3. Local `expectedVersion`: accepted.
4. Race loser STALE_STATE or VACANCY_STATUS_INVALID: accepted; no write either way (test at line 751).
5. Headcount event and audit only on change: accepted. A repeat carrying a headcount is 409, per A1c.
6. A13 (final re-read 404): accepted as a gap. The re-read happens under the lock in the same transaction, so a 404 there cannot happen without a delete. Note it in PROGRESS.

## Pre-review denied cases
3.1, 3.2, 3.3, 3.4 (line 768), 3.5, 3.6 (incl. DB trigger, draft 409), 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13 (repeat HOLD on ON_HOLD by Recruiter/HR/Head HR), 3.14 rate limit: covered. 3.14 CSRF: see Should fix. None missing that blocks.

## engineering-self-check line
- A read helper shared between a caller-keyed and a scope-keyed path must keep the key as a required argument on the restricted wrapper, and a test must pin the restricted path after the refactor.
