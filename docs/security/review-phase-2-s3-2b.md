# Security review — Phase 2 S3.2b-server: D122 Team Lead eligibility and B-1 create-limit lift

Base 5bb0cb0, uncommitted. Reviewed: `server/repositories/team-lead-eligibility.ts`, `team-lead-priority.ts`, `user.ts` (`lockUsersShared`), `server/services/vacancy.ts` (`lockAuthors`, `createVacancy`), `server/services/vacancy-draft.ts`, `lib/schemas/vacancy.ts`, `lib/env.ts`, `server/config/runtime.ts`, CI and env files.

## Verdict

**Pass. No Critical or High.** S1 from `review-phase-2-s3-2a.md` is closed on every assignment path. B-1 had one Medium gap (nothing stopped `APP_ENV=test` on Vercel); fixed in this review with a boot guard and unit tests. One non-security blocker for the engineer: integration workers have no `APP_ENV` (F-3).

## D122 — one eligibility predicate (closes S1)

| Check | Result | Evidence |
| --- | --- | --- |
| Predicate is single-sourced | Pass. SQL fragment (picker, list, priority save) and row predicate (create, draft, publish) live in one file; both mean active + `TEAM_LEAD` in that vertical + `activated_at` not null | `team-lead-eligibility.ts:9-19`; used at `team-lead-priority.ts:46-48,73,96` and `vacancy.ts:209-220` |
| Create OPEN and DRAFT | Covered: locks the TL `FOR SHARE`, then `isEligibleTeamLead`, else 400 `invalid_team_lead` | `vacancy.ts:281-285` |
| Draft PATCH | Covered when the TL changes. An unchanged TL is not re-checked on PATCH (diff drops it), but publish re-checks | `vacancy-draft.ts:247-277`; `diff()` at `:196` |
| Publish | Covered, on fresh locked user and role rows, before the CAS to OPEN | `vacancy-draft.ts:343,358` |
| Other write paths for `vacancy.team_lead_id` | None. The only writers are `insertVacancy` and `updateVacancy` (`repositories/vacancy.ts:161,283`), reached only from create, draft save and publish. No reassign, admin-TL or bulk endpoint exists (route inventory of `app/api`). Seed is dev-only | grep of `server/app/lib/scripts` |
| Race: TL invitee, deactivated or role removed during write | `lockUsersShared` locks users in id order and selects `activatedAt`. Roles are read in a later statement. `activated_at` only goes null to set, and deactivation takes the lock, so no TOCTOU. Role rows are hard-deleted, so there is no stale "revoked" row | `user.ts:361-375`, `vacancy.ts:192-224` |
| Existence oracle | None. Nonexistent user, other vertical, non-TL, invitee and deactivated all give the same 400 `invalid_team_lead` | `vacancy.ts:209-220` |
| SQL injection | `sql.raw` takes only the fixed alias literals `'r'\|'er'` / `'u'\|'eu'`, typed at compile time | `team-lead-eligibility.ts:9` |
| Tests | New file covers create, PATCH, publish and picker-equals-create parity; passes (5/5, with `APP_ENV=local`) | `tests/integration/vacancies-team-lead-eligibility.test.ts` |

## B-1 — daily create limit

| Check | Result | Evidence |
| --- | --- | --- |
| Value comes from server env only | Pass. Not `NEXT_PUBLIC_`, not in `next.config.ts` `env` (only `PERF_BUILD`), no request value feeds it. The service now reads the validated `appEnv()`, so an unknown value throws (fails closed) instead of silently choosing a limit | `server/config/runtime.ts:14`, `vacancy.ts:246`, `lib/schemas/vacancy.ts:132` |
| Only `test` lifts it | Pass. `'TEST'`, `'test '`, empty and undefined give 100 | `tests/unit/vacancy-create-limit.test.ts` |
| Burst and draft limits unaffected | Pass. 30/min and the draft cap still apply | `vacancy.ts:149`, `VACANCY_DRAFT_LIMIT` |
| `.env.example` | `APP_ENV=local`, no value that lifts the cap | `.env.example:2` |
| CI | `APP_ENV=test` is set only on the `quality` job (ephemeral runner, loopback DB). Other `APP_ENV=test` uses are `playwright.config.ts`, `scripts/api-test.ts` (refuses when `VERCEL_ENV` is set) and `scripts/ci-env.ts`. None deploy | `ci.yml:20` |
| Production and preview | Before this review: nothing prevented it. `APP_ENV` is a valid enum value, `test` is not "hosted", so a mis-scoped Vercel variable would boot with the cap lifted and hosted-only checks skipped. See F-1 | `lib/env.ts:108-110` |

## Findings

| # | Sev | Finding | Evidence | Fix / status |
| --- | --- | --- | --- | --- |
| F-1 | Medium (config hazard, needs a mis-set env var and an authenticated author; impact limited to lifting the 100/day cap) | No guard against `APP_ENV=test` on Vercel production or preview | `lib/env.ts:108-126` (before) | **Fixed.** `parseRuntimeEnv` throws `APP_ENV=test on a hosted environment` when `VERCEL` or `VERCEL_ENV` is set. Boot runs it via `instrumentation.ts`. Tests: `tests/unit/env.test.ts` (`VERCEL=1`, `VERCEL_ENV` production, preview, development; plus a pass case outside Vercel). Unit suite 59/59 |
| F-2 | Low | No ops doc states the Vercel `APP_ENV` matrix | `docs/ops/` has no env section | Devops: document Production `APP_ENV=production`, Preview `APP_ENV=preview`, never `test` or `local`; scope variables per Vercel environment. Optional hardening: also reject `VERCEL_ENV` production or preview with `APP_ENV` local or test |
| F-3 | Blocker for the engineer, not a security issue | `vacancy.ts:246` now calls `appEnv()`, which throws a ZodError when `APP_ENV` is unset. The integration worker has no `APP_ENV` (`tests/integration/setup.ts:55` sets it in globalSetup only; the integration project `env` in `vitest.config.ts` lacks it). Result: every `createVacancy` in integration fails, 5/5 in the new file. With `APP_ENV=local` set, `vacancies-create` and `vacancies-draft-lifecycle` pass (127/128) | `server/config/runtime.ts:14`, `vitest.config.ts` | Engineer: add `APP_ENV: 'local'` to the integration project `env` (not `test`, so the 100 cap stays exercised) |
| F-4 | Info, engineer WIP | The new test "the picker, create and the priority save accept exactly the same Team Leads" currently fails with `savepoint "s3" does not exist` plus an unhandled `ConflictError STALE_STATE` from `server/services/team-lead-priority.ts:101`. A refused priority save throws inside the scenario transaction, so the harness savepoint is gone | `tests/integration/vacancies-team-lead-eligibility.test.ts` (last test) | Engineer: run the priority save through a path that does not abort the scenario transaction, or catch the rejection around its own savepoint |
| F-5 | Info | Create-limit tests cover the function only, not that the service passes the env value | `vacancy-create-limit.test.ts` | Optional: an integration case that exhausts the cap under `APP_ENV=local` |

## Changes made in this review

- `lib/env.ts`: boot guard (F-1).
- `tests/unit/env.test.ts`: five cases for the guard.
- `docs/security/threat-model.md`: T-V04 updated.

Not run: full `pnpm typecheck` (existing errors are in other agents' UI WIP: `VACANCY_FORM_WIDTH`, `vacancy-form-skeleton`). Integration was run alone and only on the three vacancy files.
