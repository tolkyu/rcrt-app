# Test plan

Owner: `qa-engineer` · Inputs: `docs/PRD.md` (v1.1 + BONUS-16), `docs/authz-matrix.md` (90 codes), `docs/pipeline-state-machine.md`, `docs/architecture.md`, `docs/stories/phase-1.md`, `docs/ux/screens.md`, `docs/ux/designer-brief.md` (D-10a, D-24..D-30), `docs/perf/plan.md`, `docs/OPEN_QUESTIONS.md`, `docs/PROGRESS.md` (owner decisions 2026-10-31).
Tag `[assumes Q-xx]` = the test encodes the BA recommendation for an open question. If the owner answers differently, update the test before build. Tag `⚠ OWNER` = default in the architect's docs, waiting for owner confirmation; the test encodes that default.

## 0. Owner decisions applied (2026-10-31)

| Decision | Effect on this plan |
|---|---|
| Candidate belongs to one vertical; transfer by ADM / HREC / HHR, blocked while active applications exist (CAND-06, Q-13) | Candidate scope = `candidate.vertical_id`; `candidate.transfer_vertical` (AZ row 089); transfer suite §3.6; cross-vertical application → 409 `CANDIDATE_VERTICAL_MISMATCH` |
| No vertical deactivation (Q-37) | All `VERTICAL_READ_ONLY` / deactivated-vertical tests removed; G-scope denial uses soft-deleted target / deactivated user |
| HREC may be sourcer/owner and earn bonuses; nobody approves, pays, adjusts, splits, holds/releases, self-referral-approves or reassigns to themselves (Q-21, Q-44, Q-130) | Self-benefit denied cases §3.5 (403 `SELF_BENEFIT_FORBIDDEN`) |
| HREC assigns recruiters; REC self-assigns unassigned OPEN vacancies (Q-01) | `vacancy.self_assign` REC `uo` confirmed; dialog D-30 screenshots |
| Head HR polygraph review mandatory: HR records PDF + outcome → HHR «Підтвердити» / «Не підтверджено» → «Перепройти» (new attempt, back to scheduling, old PDF kept) or «Відмовити»; OFFER only after a confirmed Pass (POLY-05, D4) | T13, T14, T14b, T14c, T14d + attempt machine (state machine §9.1) in §4; dialog D-10a in §9 |
| 2FA mandatory for Admin and Finance; no CAPTCHA (Q-128, Q-132) | MFA tests for both roles §3.4; Finance TOTP screenshots; no CAPTCHA tests |
| HR sees candidate contacts, TL does not; Finance reports = full name + application ID only; mini-funnel counts only what the viewer can open (Q-17, Q-23, Q-15) | `candidate.contacts.read` (AZ row 090); field-level suite §3.3 |
| Tests on local Postgres in Docker, nothing paid (Q-92, Q-114..117) | §1 tooling |

## 1. Test levels and tooling

| Level | Tool / env | Covers | Location | PR | Nightly |
|---|---|---|---|---|---|
| Unit | Vitest, pure functions, FixedClock, no I/O | `server/domain/pipeline` (all transitions, guards, `availableActions`, probation dates), `server/domain/routing`, `server/domain/bonus` (`compute`, `evaluateTriggers`, `vacancyRewardChangeAllowed`), `server/authz` (`can`, `permissionsFor`, registry validation, grant merge), Zod schemas, formatters (uk-UA, Kyiv) | `tests/unit/**` | ✅ | ✅ |
| Integration | Vitest + `postgres:17` Docker (GitHub Actions service / `docker-compose.test.yml`), bootstrap SQL stubs Supabase `auth` schema and roles (same as perf plan §8.1). Storage / email go through the integration interfaces, with test doubles defined in `tests/support/` (never in app code) | Services + repositories + migrations: authz matrix (allowed + denied), `scopeWhere` ⇔ `can` contract, VIS-02 surfaces, transactions, 409 races, DB triggers (append-only events, PROB-05), counters, cron jobs with fixed run keys, query-count limits (perf plan §1.1) | `tests/integration/**` | ✅ | ✅ |
| E2E | Playwright against `next build && next start`, Supabase CLI local stack (Docker, free: Postgres 17, GoTrue, Storage, Inbucket) | User journeys §7, a11y (axe) on every visited screen, i18n runtime check, Finance gating, mobile TL flows | `tests/e2e/**` | Smoke: E2E-01, E2E-02, E2E-03, E2E-P1-01, desktop Chromium | Full suite, desktop 1440×900 + mobile 390×844 |
| Screenshots | Playwright `tests/e2e/screens.spec.ts` → `pnpm test:screens` | SHOT-01..03 per §8; gallery + `screenshots/latest/` | `screenshots/phase-N/` | ✅ sharded ×4; artefact + pixel diff vs committed set | ✅ |
| API | Newman on collection generated from OpenAPI (`pnpm api:postman`) against the same local Supabase stack | Every `/api/v1` operation: status, response schema, problem+json `code`, route gating per seeded role, validation 400, stale 409 | `tests/postman/**` | ✅ | ✅ |
| Performance | Per `docs/perf/plan.md` §8.6 (`pnpm perf:check`): size-limit, EXPLAIN harness, k6, LHCI, `perf:nav`, drift | PERF-01..05 | `tests/perf/**` | smoke profile | full profile + drift |
| Static | ESLint (incl. no literal JSX strings, no `test.skip`/`.only`/`waitForTimeout`, `import/no-restricted-paths`), `tsc`, i18n key check, secret scan | Code rules CLAUDE.md §3–4 | — | ✅ | ✅ |

**Coverage gates (Vitest v8, CI fails below):** `server/domain/**` 100 % branches / lines / functions; `server/authz/**` 100 %. Report published as an artefact on every PR.
**Determinism:** server `FixedClock`; Playwright `page.clock`, `timezoneId: 'Europe/Kyiv'`, `locale: 'uk-UA'`, `reducedMotion: 'reduce'`, CSS animations off, `document.fonts.ready` before capture; deterministic seed PRNG; no sleeps (auto-waits only); one retry on CI, and a retried pass is reported as flaky.
**Screenshot byte-stability (SHOT-DET-01):** `settleRendering` (`tests/e2e/screens.ts`) waits for fonts and every running finite CSS transition before each capture; Chromium runs with `--disable-partial-raster` (partial re-raster left run-to-run 1-level anti-aliasing seams on just-changed rounded borders); captured API data that depends on database history (users' last sign-in) is rewritten to fixed values. Consecutive `pnpm test:e2e` + `pnpm test:screens` runs (verified 3×) leave `git status screenshots` empty.
**Isolation:** integration = one database per Vitest worker cloned from a migrated + seeded template (`CREATE DATABASE … TEMPLATE`); tests create their own fixtures and never assert global counts. E2E/Newman = `supabase db reset` + `pnpm db:seed` per run; E2E specs that mutate shared fixtures run serially in one project.
**i18n check (no untranslated UI):** (1) static: every `t()` key exists in `messages/uk.json`, no unused keys; (2) every API error `code` and `PipelineErrorCode` has `errors.<code>`; (3) runtime: next-intl `onError` throws on `MISSING_MESSAGE` in test builds, so E2E fails; (4) DOM scan during screenshots: text nodes in Latin script outside an allowlist (emails, URLs, Meet links, «П0», «CSV/XLSX», ISO currency codes) fail the run.

## 2. Traceability

Test ID prefixes: `UT-` unit · `IT-` integration · `AZ-nnn-ROLE-A|D` authz cell · `VIS2-` leak · `FLD-` field rules · `FIN-` Finance · `MR-` multi-role · `SB-` self-benefit · `TR-` vertical transfer · `SM-` transition · `RT-` routing · `BN-` bonus · `B16-` BONUS-16 · `PR-` probation · `E2E-` · `SHOT-` · `API-`.

| PRD ID | Stories | Tests |
|---|---|---|
| ROLE-01 | ROLE-01-1, ROLE-01-2 | IT-P1-ROLE-01..08, AZ-* (grants per assignment), API-users/roles |
| ROLE-02 | ROLE-02-1 | MR-01..08 |
| ROLE-03 | ROLE-03-1 (create/rename only, no deactivation, Q-37) | IT-P1-VERT-01..03 |
| ROLE-04 | ROLE-04-1 | UT-AZ-REG-01..04, lint rule test |
| ROLE-05 | ROLE-05-1..6, SEC-AUTH-1, SEC-AUTH-2 | IT-P1-INV-01..10, IT-P1-AUTH-01..05, E2E-P1-01, E2E-P1-03 |
| ROLE-06 | STORY-ROLE-06-1 (phase 2) | IT-ROLE6-01..04 |
| VIS-01 | VIS-01-1 | AZ-* (§3.1), API-GATE-* |
| VIS-02 | VIS-02-1 | VIS2-01..20, CT-01 |
| VIS-03 | VIS-03-1 | AZ coverage check (a granted cell without A and D, or an empty cell without D, fails CI) |
| VAC-01..06 | phase 2 stories | IT-VAC-01..12, VS-01..10, B16-* (VAC-01 reward field) |
| CAND-01..05 | phase 2 stories | IT-CAND-01..14, VIS2-08 (dedupe), FLD-01..04 |
| CAND-06 (transfer, owner 2026-10-31) | phase 2 stories (to be written) | TR-01..11, AZ-089 |
| PIPE-01..06 | phase 3 stories | SM-T01..T28, SM-IA-01..06, UT-SM-EXH-01..03 |
| RESCH-01..04 | phase 3 | SM-IA-01..06, E2E-01 step 7 |
| HIST-01..03 | HIST-03-1 | IT-HIST-01..05 (append-only trigger, one event per transition, PII side table) |
| ROUTE-01..10 | ROLE-01-3 (data) + phase 3 | RT-01..26 |
| POLY-01..05 | phase 3 | SM-T11..T14d, SM-PA-01..05, VIS2-10, E2E-01 step 9, E2E-06 |
| OFFER-01..04 | phase 3 | SM-T15..T19 |
| PROB-01..07 | phase 3 | PR-01..28, BN-15..17 |
| BONUS-01..15 | phase 4 | BN-01..50, SB-01..13 |
| BONUS-16 | phase 4 | B16-01..19 |
| UI-01..07 | UI-04-1, UI-05-1, UI-06-1 | E2E-*, SHOT-*, perf `perf:nav`, axe, I18N-01..04 |
| STAT-01..08 | phase 4 | IT-STAT-01..12, FIN-01..09, FLD-05..06 |
| ARCH-01..05 | phase 5 | E2E-02, IT-ARCH-01..10 |
| NOTIF | phase 5 | IT-NOTIF-01..10, PR-10..18 |
| AUD | AUD-1..3 | IT-P1-AUD-01..07 |
| SEC | SEC-AUTH-1..4, FND-3, FND-5 | IT-P1-AUTH-*, IT-P1-SEC-01..04, MFA-01..06 |
| PERF-01..06 | FND-3 | perf plan §8 |
| API | FND-4 | API-*, IT-P1-API-01..02 |
| SHOT-01..03 | SHOT-01-1..03-1 | SHOT-* §8, SHOT-GAL-01, SHOT-DET-01 |

**Phase 1 story → tests**

| Story | Tests |
|---|---|
| FND-1 | IT-P1-FND-01 `pnpm setup` twice → seed row counts unchanged · IT-P1-FND-02 missing env var → error names the variable, no values printed · IT-P1-FND-03 seed refuses a non-local DB URL |
| FND-2 | Manual (documented reason: CI config is tested by a deliberately failing canary PR once per phase); secret-scan fixture commit fails |
| FND-3 | UT-P1-FND-04 Sentry `beforeSend` + pino redaction drop email/phone/salary · region check = staging list (perf plan §8.7), manual |
| FND-4 | IT-P1-API-01 OpenAPI regeneration has no diff · IT-P1-API-02 invalid payload → 400 with field paths, no partial write · API-GATE Phase-1 operations |
| FND-5 | IT-P1-SEC-01 rate limit with neutral message · IT-P1-SEC-02 cookie POST without matching `Origin` → rejected · E2E-P1-08 CSP blocks an injected inline script · (no CAPTCHA, Q-132) |
| SEC-AUTH-1 | E2E-P1-01 magic link via Inbucket · IT-P1-AUTH-01 unknown/deactivated/pending email → same neutral message, no email · IT-P1-AUTH-02 used/expired link · IT-P1-AUTH-03 only the latest link valid |
| SEC-AUTH-2 | UT-P1-AUTH-04 email match rules (case-insensitive, alias ≠ match) · Google OAuth round trip: manual (no Google IdP in CI) |
| SEC-AUTH-3 (+Q-128) | MFA-01..06 (§3.4), E2E-P1-02 TOTP enrol for Admin and Finance |
| SEC-AUTH-4 | IT-P1-AUTH-05 idle 12 h / absolute 7 d [assumes Q-31] via FixedClock, deactivation revokes on next request, DST unaffected |
| DEV-1 | IT-P1-DEV-01 `/api/dev/login` absent from the production `.next` manifest, 404 on `next start` · dev lists only seed users |
| ROLE-05-1..6 | IT-P1-INV-01..10 (72 h expiry at acceptance 71:59 vs 72:01, resend invalidates the old link, revoke, duplicate email, reactivate instead of invite), E2E-P1-03 |
| ROLE-03-1 | IT-P1-VERT-01..03 (create, rename with history, duplicate name case-insensitive) |
| ROLE-01-1..3 | IT-P1-ROLE-01..08 (ADMIN/FINANCE global only, scoped role requires vertical, duplicate, last Admin protected, cannot change own roles, priority validation, new TL gets lowest priority [assumes Q-93]) |
| ROLE-04-1, ROLE-02-1, VIS-01-1..03-1 | UT-AZ-REG-01..04, MR-01..08, AZ-*, VIS2-*, CT-01 |
| AUD-1..3 | IT-P1-AUD-01..07 (same-tx audit row, refused admin call = security event, no UPDATE/DELETE, Kyiv-midnight period filter after DST 25.10.2026, login history scope) |
| HIST-03-1 | IT-HIST-01..03 (UPDATE/DELETE on `entity_event` fail for the app role; user/vertical changes on «Історія») |
| UI-04-1 | E2E-P1-05 nav per role, FIN-01..03 |
| UI-05-1 | E2E-P1-06 theme persisted, no flash; axe AA on all Phase-1 screens; I18N-01..04 |
| UI-06-1 | E2E-P1-07 404 copy identical for missing vs forbidden; SHOT states |
| SEED-1 | IT-P1-SEED-01 idempotent; refuses production |
| SHOT-01-1..03-1 | SHOT-GAL-01 every PNG linked, every link exists · SHOT-DET-01 two runs pixel-identical |

## 3. Authorization tests (VIS-01..03)

### 3.1 Fixture rules

Seeded actors (§10): ADM `admin@demo` · HREC `head.recruiter.gambling@demo` · REC `recruiter1.gambling@demo` (REC2 = `recruiter2.gambling@demo`) · HHR `head.hr@demo` · HR `hr@demo` · TL `vasyl.tl@demo` (TLT = `taras.tl@demo`) · FIN `finance@demo`. Integration fixtures add vertical **«Е-комерція»** (no seeded user holds a role there) because HHR/HR hold both seeded verticals [assumes Q-43].

**Allowed fixture (A)** and **denied fixture (D)** per scope in a granted cell:

| Scope | A (2xx / `can = true`) | D (expected) |
|---|---|---|
| `G` | Object in Крипто | Soft-deleted object outside archive → 404. Non-object permissions (statistics, settings): deactivated user → 401 `USER_DEACTIVATED` |
| `V` | Object in Гемблінг | Same object type in «Е-комерція» → 404 |
| `V≥P` | Application on V-V with `max_stage_reached = POLYGRAPH` (also one rejected after Polygraph → still visible) | Same vertical, `max_stage_reached = TL_INTERVIEW` → 404 |
| `own` | REC's own object (owner or sourcer); TL: own vacancy; stats: own subject id | REC2's object in the same vertical / TLT's vacancy / filter on another subject id → 404 |
| `ownN` | Own recruiter-initiated vacancy with no application past NEW (D13, D65) | Same vacancy with an application in IN_WORK, a TL-requested vacancy, or another recruiter's → 403 |
| `asg + uo` | Vacancy assigned to REC; unassigned OPEN vacancy | Vacancy assigned only to REC2; unassigned ON_HOLD vacancy → 404 |
| `uo` (`vacancy.self_assign`) | Unassigned OPEN vacancy | Unassigned ON_HOLD vacancy → 404 |
| `sub` | Application on V-V at SUBMITTED_TO_TL or later | Application on V-V at IN_WORK; application on V-T → 404 |

**Empty cell (`—`)** = one D case. The status is written in the cell: `403` when the target is visible to the role through another grant (forbidden, not hidden), `404` when it is not visible or the role has no grant on the route. Write tests on application/candidate run on the **maximally visible fixture**: application C-13 (Polygraph, V-V, owner REC) → visible to every role except FIN. Stage-dependent 404s are covered in §4. Create permissions: `403` when the role holds the route's base read permission, else `404` (ADR-002 route gating). Files without the file permission → 404 (authz §4).

### 3.2 Matrix: permission × role

Cell = scope → A + D cases, or `403`/`404`/`absent` → D case only. ⚠ = working default from the matrix, still pending the owner.

| # | Permission | ADM | HREC | REC | HHR | HR | TL | FIN |
|---|---|---|---|---|---|---|---|---|
| 001 | `vacancy.read` | G | V | asg+uo | V | V | own | 404 |
| 002 | `vacancy.create` | G | V | V | 403 | 403 | V | 404 |
| 003 | `vacancy.update` | G | V | 403 | 403 | 403 | own ⚠ | 404 |
| 004 | `vacancy.assign_recruiters` | G | V | 403 | 403 | 403 | 403 | 404 |
| 005 | `vacancy.self_assign` | 403 | 403 | uo | 403 | 403 | 403 | 404 |
| 006 | `vacancy.team_lead.set` | G | V ⚠ | 403 | 403 | 403 | 403 | 404 |
| 007 | `vacancy.approve` | G | V ⚠ | 403 | 403 | 403 | 403 | 404 |
| 008 | `vacancy.hold` | G | V | 403 | 403 | 403 | own ⚠ | 404 |
| 009 | `vacancy.resume` | G | V | 403 | 403 | 403 | own ⚠ | 404 |
| 010 | `vacancy.cancel` | G | V | 403 | 403 | 403 | own ⚠ | 404 |
| 011 | `vacancy.reopen` | G | V | 403 | 403 | 403 | 403 | 404 |
| 012 | `vacancy.delete` (D13, D65) | G | V | ownN | 403 | 403 | 403 | 404 |
| 013 | `vacancy.priority.override` | G | 403 | 403 | 403 | 403 | 403 | 404 |
| 014 | `vacancy.bonus_scheme.override` | G | 403 | 403 | 403 | 403 | 403 | 404 |
| 015 | `vacancy.bonus.update` | G | 403 | 403 | 403 | 403 | 403 | 404 |
| 016 | `vacancy.probation_length.set` | G | 403 | 403 | V | 403 | 403 | 404 |
| 017 | `position.manage` | G | V ⚠ | 403 | 403 | 403 | 403 | 404 |
| 018 | `candidate.read` | G | V | own | V≥P | V≥P | sub | 404 |
| 019 | `candidate.create` | G | V | V | 403 | 403 | 403 | 404 |
| 020 | `candidate.update` | G | V | own | 403 | 403 | 403 | 404 |
| 021 | `candidate.bonus_flags.set` (D66) | G | V | own | 403 | 403 | 403 | 404 |
| 022 | `candidate.file.read` | G | V | own | V≥P | V≥P | sub | 404 |
| 023 | `candidate.file.upload` | G | V | own | 403 | 403 | 403 | 404 |
| 024 | `candidate.merge` | G | V | 403 | 403 | 403 | 403 | 404 |
| 025 | `candidate.delete` (D65) | G | V | 403 | 403 | 403 | 403 | 404 |
| 026 | `archive.deleted.read` | G | V | 404 | 404 | 404 | 404 | 404 |
| 027 | `archive.restore` | G | V | 404 | 404 | 404 | 404 | 404 |
| 028 | `candidate.purge` | G | 403 | 404 | 404 | 404 | 404 | 404 |
| 029 | `comment.create` | G | V | own | V≥P | V≥P | sub | 404 |
| 030 | `application.read` | G | V | own | V≥P | V≥P | sub | 404 |
| 031 | `application.create` | G | V | V | 403 | 403 | 403 | 404 |
| 032 | `application.reactivate` | G | V | own ⚠ | 403 | 403 | 403 | 404 |
| 033 | `application.move.in_work` | G | V | own | 403 | 403 | 403 | 404 |
| 034 | `application.move.submitted_to_tl` | G | V | own | 403 | 403 | 403 | 404 |
| 035 | `application.tl_decision` | G | 403 ⚠ | 403 | 403 | 403 | sub | 404 |
| 036 | `application.move.tl_interview` | G | V | own | 403 | 403 | 403 | 404 |
| 037 | `application.interview.manage` | G | V | own | 403 | 403 | 403 | 404 |
| 038 | `application.interview.reschedule_request` | G | 403 | 403 | 403 | 403 | sub | 404 |
| 039 | `application.move.polygraph` | G | V | own | 403 | 403 | sub | 404 |
| 040 | `application.interview.reject` | G | V | own | 403 | 403 | sub | 404 |
| 041 | `application.reject.recruiting` | G | V | own | 403 | 403 | 403 | 404 |
| 042 | `application.reject.hr` | G | V ⚠ | 403 | V | V | 403 | 404 |
| 043 | `application.withdraw` | G | V | own | 403 | 403 | 403 | 404 |
| 044 | `application.move_back.recruiting` | G | V | 403 | 403 | 403 | 403 | 404 |
| 045 | `application.move_back.hr` | G | V ⚠ | 403 | V | 403 | 403 | 404 |
| 046 | `application.force_move` | G | 403 | 403 | 403 | 403 | 403 | 404 |
| 047 | `application.reassign_owner` | G | V | 403 | 403 | 403 | 403 | 404 |
| 048 | `application.bonus_split.set` | G | V | 403 | 403 | 403 | 403 | 404 |
| 049 | `polygraph.assign` | G | 403 | 403 | V | 403 | 403 | 404 |
| 050 | `polygraph.assign.self` | 403 | 403 | 403 | 403 | V | 403 | 404 |
| 051 | `polygraph.schedule` | G | 403 | 403 | V | V | 403 | 404 |
| 052 | `polygraph.result.record` | G | 403 ⚠ | 403 | V | V | 403 | 404 |
| 053 | `polygraph.review` (mandatory, D4) | G | 403 | 403 | V | 403 | 403 | 404 |
| 054 | `polygraph.file.read` | G | 404 | 404 | V≥P | V≥P | 404 | 404 |
| 055 | `offer.read` | G | V | own | V≥P | V≥P | sub | 404 |
| 056 | `offer.salary.read` | G | V | own | V≥P | V≥P | sub | 404 |
| 057 | `offer.draft` | G | 403 | 403 | V | V | 403 | 404 |
| 058 | `offer.send` | G | 403 | 403 | V | 403 | 403 | 404 |
| 059 | `offer.outcome.record` | G | 403 | 403 | V | V | 403 | 404 |
| 060 | `application.move.probation` | G | 403 | 403 | V | V | 403 | 404 |
| 061 | `probation.length.set` | G | 403 | 403 | V | 403 | 403 | 404 |
| 062 | `probation.pass` | G | 403 ⚠ | 403 | V | 403 | sub | 404 |
| 063 | `probation.pass.override` | G | 403 | 403 | V | 403 | 403 | 404 |
| 064 | `probation.fail` | G | 403 ⚠ | 403 | V | 403 | sub | 404 |
| 065 | `bonus.read` | G | V | own | 404 | 404 | 404 | 404 |
| 066 | `bonus.approve` | G | V | 403 | 404 | 404 | 404 | 404 |
| 067 | `bonus.hold` | G | V ⚠ | 403 | 404 | 404 | 404 | 404 |
| 068 | `bonus.release` | G | V ⚠ | 403 | 404 | 404 | 404 | 404 |
| 069 | `bonus.mark_paid` | G | 403 | 403 | 404 | 404 | 404 | 404 |
| 070 | `bonus.clawback.settle` | G | 403 | 403 | 404 | 404 | 404 | 404 |
| 071 | `bonus.adjust` | G | 403 | 403 | 404 | 404 | 404 | 404 |
| 072 | `bonus.self_referral.approve` | G | 403 | 403 | 404 | 404 | 404 | 404 |
| 073 | `bonus.payout_report.read` | G | V ⚠ | 404 | 404 | 404 | 404 | G |
| 074 | `bonus.payout_report.export` | G | V ⚠ | 404 | 404 | 404 | 404 | G |
| 075 | `statistics.funnel.read` | G | V | own | 404 | 404 | own | G |
| 076 | `statistics.hr.read` | G | V | 404 | V | own | 404 | G |
| 077 | `statistics.bonus.read` | G | V | own | 404 | 404 | 404 | G |
| 078 | `statistics.export` | G | V | own | V | own | own | G |
| 079 | `settings.verticals.manage` | G | 404 | 404 | 404 | 404 | 404 | 404 |
| 080 | `settings.vertical_flags.manage` | G | 404 | 404 | 404 | 404 | 404 | 404 |
| 081 | `settings.users.manage` | G | 404 | 404 | 404 | 404 | 404 | 404 |
| 082 | `settings.priorities.manage` | G | 404 | 404 | 404 | 404 | 404 | 404 |
| 083 | `settings.bonus_schemes.manage` | G | 404 | 404 | 404 | 404 | 404 | 404 |
| 084 | `settings.reference_data.manage` | G | 404 | 404 | 404 | 404 | 404 | 404 |
| 085 | `settings.retention.manage` | G | 404 | 404 | 404 | 404 | 404 | 404 |
| 086 | `settings.jobs.run` | G | 404 | 404 | 404 | 404 | 404 | 404 |
| 087 | `audit.read` | G | 404 | 404 | 404 | 404 | 404 | 404 |
| 088 | `user.directory.read` | G | V | V | V | V | V | 404 |
| 089 | `candidate.transfer_vertical` (source-vertical role ⁹) | G | V | 403 | V≥P | 403 | 403 | 404 |
| 090 | `candidate.contacts.read` (field ⁸) | G | V | own | V≥P | V≥P | absent | 404 |
| 091 | `vertical.read` (STORY-VIS-02-1, added in T3) | G | V | V | V | V | V | 404 |
| 092 | `candidate.bonus_flags.clear` (D66; self-benefit guarded, aal2) | G | 403 | 403 | 403 | 403 | 403 | 404 |

Count (rows 001–092, the 92 codes of `authz-matrix.md` after D65/D66 and `vertical.read`): 644 cells = 253 granted (253 A + 253 D) + 391 empty (391 D) = **897 cases** (implemented in `tests/unit/authz/matrix.test.ts`). Field permissions (`offer.salary.read`, `candidate.contacts.read`): `absent` = 200 with the fields omitted (FLD-01..03), counted as a D case. ⁸ ⁹ = footnotes of `authz-matrix.md`. Admin settings rows 079–087 additionally require aal2 (MFA-02).

### 3.3 Field-level rules (owner 2026-10-31)

| ID | Rule | Allowed | Denied (field absent from DTO, list, export, search snippet, notification params) |
|---|---|---|---|
| FLD-01 | Candidate contacts, `candidate.contacts.read` (email, phone, Telegram; LinkedIn/portfolio URLs treated as contacts ⚠ OWNER ⁸) | ADM, HREC, REC own, HHR/HR (V≥P) | TL (sub): fields absent on card, list, search, export, notification params |
| FLD-02 | Contacts in field-change events (`entity_event_pii`) and dedupe panel | same as FLD-01 | TL sees «Телефон змінено» without values |
| FLD-03 | Offer salary (`offer.salary.read`) | ADM, HREC, REC own, HHR, HR, TL sub | FIN (404 on any offer object) |
| FLD-04 | Polygraph PDF id/URL | ADM, HHR, HR | REC, TL, HREC: outcome only; file id absent; direct file URL → 404 |
| FLD-05 | Finance payout report / «хто кого привів» [Q-23] | full name + application ID | no contacts, salary, polygraph, card links; CSV/XLSX columns asserted by exact header list |
| FLD-06 | Mini-funnel / vacancy counts [Q-15] | counts = applications the viewer can open | TL sees no NEW/IN_WORK counts on own vacancy; HR/HHR see only ≥ Polygraph; REC only own (+ HREC/ADM full). Per-role snapshot test on V-V |
| FLD-07 | BONUS-16 reward amount [assumes Q-113] | ADM, HREC, assigned REC | TL, HR, HHR: field absent; FIN: only aggregated in Statistics |
| FLD-08 | Bonus tab / tranche amounts on card | ADM, HREC (V), REC own | HHR, HR, TL: tab absent, `/bonus` endpoint 404 |

Per-role DTO snapshot tests for candidate, application, offer, vacancy, payout row (authz §6, DG-10).

### 3.4 Surfaces, Finance, MFA, multi-role

**VIS-02 leaks** (each case runs for every role; expected = only objects that pass `can(read)`)

| ID | Surface | Assertion |
|---|---|---|
| CT-01 | Contract over the full seed | For every user U and object X: X ∈ list(U) ⇔ `can(U, read, X)` (vacancies, candidates, applications, tranches) |
| VIS2-01 | Vacancy list incl. `?withTotal=true` | No foreign rows; total = visible rows |
| VIS2-02 | Candidate list, filters (`?vacancyId=<invisible>`) | Empty result / 404, never rows |
| VIS2-03 | Kanban board + "load more" cursor | Cursor from another user can't widen the scope |
| VIS2-04 | Mini-funnel counters | FLD-06 |
| VIS2-05 | Global search Ctrl K (Cyrillic, email, phone fragments) | Only visible; no total |
| VIS2-06 | Autocomplete: candidate picker, position picker | Scoped |
| VIS2-07 | User directory / mentions / split-recipient / `hrUserId` pickers | Only users holding the required role in that vertical |
| VIS2-08 | Dedupe (CAND-02) | Visible → `{match:'VISIBLE', candidateId}`; hidden → `{match:'HIDDEN'}` without id, field or which-field; hidden-match rate limit + security event |
| VIS2-09 | Timeline | Events of unreadable applications excluded; sensitivity redaction (SALARY, POLYGRAPH, BONUS); routed TL sees routing fact + previous TL name, not reason/feedback [assumes Q-28] |
| VIS2-10 | Files | CV via `candidate.file.read`; polygraph PDF without `polygraph.file.read` → 404; signed URL only after a scoped fetch |
| VIS2-11 | Calendar | Only interviews/polygraphs of readable applications |
| VIS2-12 | Notifications | Recipient resolved through `can`; payload ids only; label resolution scoped |
| VIS2-13 | Realtime topics | Subscription to a non-member vertical rejected; payload opaque ids |
| VIS2-14 | Statistics + exports | Scope predicate per subject column; export rows = screen rows |
| VIS2-15 | Bonus payout report HREC | Only own vertical; no mark-paid action |
| VIS2-16 | Archive lists (rejected, deleted, closed) | «Відмови» and «Закриті вакансії» per normal visibility rules; «Видалені» only ADM/HREC, other roles → 404 (Q-24 recommendation, adopted) |
| VIS2-17 | Error bodies | 409 `ACTIVE_APPLICATION_IN_GROUP` doesn't name the invisible vacancy; 404 body identical for missing and forbidden |
| VIS2-18 | Soft-deleted objects | Absent from every list/search/count outside archive |
| VIS2-19 | Routed application for a REC not assigned to the target vacancy | REC sees the vacancy read-only via the application [assumes Q-16] |
| VIS2-20 | Candidate after vertical transfer | Old-vertical roles lose visibility (TR-06) |

**Finance (STAT-08, D12)**

| ID | Case | Expected |
|---|---|---|
| FIN-01 | Section URLs `/`, `/vacancies`, `/candidates`, `/calendar`, `/archive`, `/settings/*` | Redirect to `/statistics` (screens.md §1, story UI-04-1) — see gap G-01 |
| FIN-02 | Object URLs `/vacancies/{id}`, `/candidates/{id}` | 404 page |
| FIN-03 | Every `/api/v1` operation outside `statistics/*`, `me`, `profile` | 404 (generated from OpenAPI; one case per operation) |
| FIN-04 | All statistics tabs, all verticals | 200, read-only, no mutation controls |
| FIN-05 | Export CSV/XLSX | Allowed; FLD-05 columns |
| FIN-06 | Numbers not clickable (no drill-down links) | DOM assertion |
| FIN-07 | No search, bell or calendar in shell [assumes Q-25] | DOM + API 404 |
| FIN-08 | Without aal2 | 401 `MFA_REQUIRED` (MFA-03) |
| FIN-09 | FIN + REC@Крипто (fixture) | Statistics all + recruiter scope in Крипто; "statistics only" limits only the FIN grant [assumes Q-22] |

**MFA (Q-30, Q-128 b)**

| ID | Case | Expected |
|---|---|---|
| MFA-01 | Admin / Finance first sign-in | TOTP before Admin/Finance grants; optional second TOTP for recovery, no recovery codes (D22/D63) |
| MFA-02 | Admin-only action with aal1 token | 401 `MFA_REQUIRED` |
| MFA-03 | Finance statistics call with aal1 | 401 `MFA_REQUIRED` |
| MFA-04 | HREC / REC / HHR / HR / TL with aal1 | Allowed (2FA optional) |
| MFA-05 | Reset by another Admin with reason; own reset refused | Re-enrol at next sign-in; event `user.mfa_reset` |
| MFA-06 | 5 wrong codes | Temporary lock |
| MFA-07 | Admin + Recruiter with aal1 | Recruiter grants remain usable; Admin grants require aal2 (owner-confirmed D63) |

**Multi-role (ROLE-02)** — fixture `multi.role@fixture.test` = HEAD_RECRUITER@Гемблінг + RECRUITER@Крипто

| ID | Case | Expected |
|---|---|---|
| MR-01 | Candidate list | Гемблінг all + Крипто own only |
| MR-02 | Approve bonus of another recruiter in Крипто | 403 (own Крипто tranche: SB applies) / foreign Крипто tranche → 404 |
| MR-03 | Reassign owner in Крипто | 403 |
| MR-04 | Delete own Крипто candidate | 403 (recruiters never delete candidates, D65); Гемблінг candidate as HREC → allowed |
| MR-05 | Statistics | Гемблінг vertical + Крипто own rows |
| MR-06 | Nav | Union |
| MR-07 | Grants never unioned across verticals (DG-10) | HREC permissions evaluated with Гемблінг ids only |
| MR-08 | TL + REC in one vertical (fixture `tlrec.gambling@fixture.test`) | May submit to own vacancy; can't approve own bonus [assumes Q-21] |

### 3.5 Self-benefit denials (Q-21, Q-130, DG-19)

Fixture: HREC is sourcer of C-22 (tranche recipient); a second Admin `admin2@fixture.test` (fixture) exists.

| ID | Action by beneficiary | Expected | Allowed counterpart |
|---|---|---|---|
| SB-01 | HREC approves own tranche | 403 `SELF_BENEFIT_FORBIDDEN`; DB CHECK `approved_by <> recipient_id` | ADM approves → 200 |
| SB-02 | ADM (holding a recruiter role via fixture) approves own tranche | 403 | admin2 → 200 |
| SB-03 | HREC holds own tranche | 403 | ADM |
| SB-04 | HREC releases own tranche | 403 | ADM |
| SB-05 | ADM holds own tranche | 403 | admin2 |
| SB-06 | ADM releases own tranche | 403 | admin2 |
| SB-07 | ADM marks own tranche paid (single) | 403; DB CHECK `paid_by <> recipient_id` | admin2 |
| SB-08 | ADM bulk mark-paid incl. own rows | Own rows skipped, others PAID; response lists skipped ids | — |
| SB-09 | ADM adjusts own bonus | 403 | admin2 |
| SB-10 | ADM approves self-referral on own tranche | 403 | admin2 |
| SB-11 | HREC sets split including self | 403 | ADM / another HREC |
| SB-12 | ADM sets split including self | 403 | admin2 |
| SB-13 | HREC reassigns owner to self | 403 | ADM → 200 |

HREC as sourcer/owner earns bonuses (Q-44): BN-31 variant with HREC as sourcer → T1 recipient HREC.

### 3.6 Candidate vertical transfer (CAND-06, `candidate.transfer_vertical`, authz ⁹)

Defaults from authz ⁹ (⚠ OWNER, all four pending confirmation): actor needs the role in the **source** vertical only; blocked by any active application; `sourcer_id` unchanged; new owner (REC/HREC of the target vertical) is picked in dialog D-29.

| ID | Given | Action | Expected |
|---|---|---|---|
| TR-01 | C-01 (talent pool, Гемблінг) | ADM transfers to Крипто, new owner recruiter.crypto, reason | 200; `candidate.vertical_id` = Крипто; owner = recruiter.crypto; `sourcer_id` = REC unchanged; event `candidate.vertical_transferred {from,to}`; history kept; audit |
| TR-02 | C-01 | HREC (role in Гемблінг only) transfers to Крипто | 200 (source-vertical role suffices ⚠ OWNER) |
| TR-03 | Candidate whose only application is REJECTED after Polygraph | HHR transfers (V≥P in source) | 200; HHR on a candidate below Polygraph → 404 |
| TR-04 | C-02 (active NEW application) | ADM transfers | 409 `CANDIDATE_HAS_ACTIVE_APPLICATIONS`; nothing written; D-29 shows the action disabled with reason |
| TR-05 | C-01 | REC (sourcer), HR, TL | 403 (REC, visible) / 404 (HR, TL: not visible) |
| TR-06 | After TR-01 | REC (sourcer, no Крипто role) opens card; Гемблінг lists/search | 404; absent; recruiter.crypto (new owner) sees it via `own` |
| TR-07 | After TR-01 | REC (Гемблінг) adds candidate to V-V | 409 `CANDIDATE_VERTICAL_MISMATCH` |
| TR-11 | C-01 | new owner without REC/HREC in Крипто (e.g. `tl.crypto`) | 400/409, picker never offers such users (VIS2-07) |
| TR-08 | Same | FIN | 404 |
| TR-09 | Two concurrent transfers | — | one 200, one 409 `STALE_STATE` |
| TR-10 | Candidate with bonus history (C-22) | ADM transfers | Existing snapshots/tranches keep their vertical (stats integrity) |

## 4. State machine tests (PIPE-01..06)

Fixture application on V-V owned/sourced by REC unless noted (fixtures §10). Request = `POST /applications/{id}/transitions {action, expectedStage, expectedVersion, data}`. Visibility by stage: NEW/IN_WORK → ADM, HREC, REC; SUBMITTED/TL_INTERVIEW → + TL; POLYGRAPH+ → + HHR, HR. REC2, TLT and FIN never see it (always 404). Every successful case asserts: stage, `version+1`, events, `vacancy_stage_count` deltas, audit row, `change_feed` row, notification intents.
**Stale column** = `expectedStage` ≠ current **and** `expectedVersion` = current−1 → both 409 `STALE_STATE`, nothing written.

| ID | Action | Fixture (stage) | Allowed | 403 | 404 | Missing / invalid data → 400 | Guard → 409 | Stale |
|---|---|---|---|---|---|---|---|---|
| T01 | ADD_TO_VACANCY ∅→NEW | C-01 → V-V | ADM, HREC, REC | — | REC2 (candidate not own), HHR, HR, TL (candidate invisible), FIN | no `candidateId` / `vacancyId` | V-V ON_HOLD → `VACANCY_NOT_OPEN` ⚠; active app in group → `ACTIVE_APPLICATION_IN_GROUP`; candidate in other vertical → `CANDIDATE_VERTICAL_MISMATCH` (TR-07) | n/a; 2 concurrent → one 201, one 409 |
| T02 | SUBMIT_TO_POSITION ∅→NEW | C-01 → «Медіабаєр — Facebook» | ADM, HREC, REC | — | as T01 | no `positionId` | all closed → `NO_OPEN_VACANCY_IN_GROUP` (RT-14) | as T01 |
| T03 | REACTIVATE | C-24 (REJECTED on V-T) | ADM, HREC, REC ⚠ [assumes Q-24] | TLT (sub, sees C-24) | REC2, HHR, HR, FIN | neither vacancyId nor positionId | source active → `INVALID_TRANSITION`; active in group → `ACTIVE_APPLICATION_IN_GROUP` [assumes Q-70] | n/a |
| T04 | START_SCREENING NEW→IN_WORK | C-02 | ADM, HREC, REC | — | REC2, HHR, HR, TL, TLT, FIN | `meetUrl` `https://meet.google.com/abc-defg-hi`, missing `scheduledAt`, `scheduledAt` < now (note Q-54) | — | ✅ |
| T05 | SUBMIT_TO_TL IN_WORK→SUBMITTED | C-04; C-05 (no TL) | ADM, HREC, REC | — | REC2, HHR, HR, TL, TLT, FIN | missing `tlSummary`, `screeningNotes` | C-05 → `VACANCY_HAS_NO_TEAM_LEAD`; V-V ON_HOLD → `VACANCY_NOT_OPEN` ⚠ | ✅ |
| T06 | TL_ACCEPT (stay) | C-06 | ADM, TL | HREC ⚠, REC | REC2, HHR, HR, TLT, FIN | — | already ACCEPTED → `INVALID_TRANSITION` (G-08) | ✅ |
| T07 | TL_DECLINE SUBMITTED→REJECTED | C-06 | ADM, TL | HREC ⚠, REC | as T06 | missing `reasonCode`; comment required for TL decisions [assumes Q-118] | already ACCEPTED → `INVALID_TRANSITION` | ✅ |
| T08 | SCHEDULE_TL_INTERVIEW SUBMITTED→TL_INTERVIEW | C-07 (ACCEPTED, V-T, owner REC2 → actor REC2) | ADM, HREC, REC2 | TLT | REC, HHR, HR, TL, FIN | invalid `meetUrl` | C-06 (PENDING) → `TL_NOT_ACCEPTED` | ✅ |
| T09 | TL_INTERVIEW_PASS →POLYGRAPH | C-10 (past, no result) | ADM, HREC, REC, TL [assumes Q-20] | — | REC2, HHR, HR, TLT, FIN | feedback missing or < 10 chars [assumes Q-97] | C-08 (future) / reschedule pending → `INTERVIEW_NOT_HELD` | ✅ |
| T10 | TL_INTERVIEW_REJECT →REJECTED | C-10 | as T09 | — | as T09 | as T09 + `reasonCode` | as T09 | ✅ |
| T11 | POLYGRAPH_ASSIGN (stay) | C-11 | ADM, HHR (→ hr), HR (self) | HREC, REC, TL; HR assigning another user | REC2, TLT, FIN | missing `hrUserId` | assignee without HR/HHR in vertical (code G-08); attempt not UNASSIGNED/ASSIGNED → `INVALID_TRANSITION` | ✅ |
| T12 | POLYGRAPH_SCHEDULE (stay) | C-11 after assign | ADM, HHR, HR | HREC, REC, TL | REC2, TLT, FIN | `locationId` and `address` both null; missing/past `scheduledAt` | UNASSIGNED → `INVALID_TRANSITION` | ✅ |
| T13 | POLYGRAPH_RESULT (stay; attempt SCHEDULED → PENDING_REVIEW) | C-13 (attempt 1 past, no PDF) | ADM, HHR, HR | HREC ⚠, REC, TL | REC2, TLT, FIN | missing `pdfFileId` / `outcome` | file not READY / not PDF → `POLYGRAPH_PDF_REQUIRED`; `scheduled_at` > now → `INVALID_TRANSITION`; stage **never** reaches OFFER here; notify `polygraph.to_review` → HHR | ✅ |
| T14 | POLYGRAPH_REVIEW_CONFIRM «Підтвердити» | C-13 attempt PENDING_REVIEW | ADM, HHR | HR, HREC, REC, TL | REC2, TLT, FIN | — (comment optional) | attempt not PENDING_REVIEW → `POLYGRAPH_REVIEW_PENDING_REQUIRED` | ✅ |
| | → outcome PASS | | POLYGRAPH → OFFER; attempt PASSED; `polygraph.reviewed {attemptNo, decision:'CONFIRMED'}`; `polygraph.result` → owner, TL (outcome only), HR; `offer.to_create` → HHR | | | | | |
| | → outcome FAIL | | POLYGRAPH → REJECTED (`POLYGRAPH_FAILED`), attempt FAILED, no routing (ROUTE-05) | | | | | |
| T14b | POLYGRAPH_REVIEW_NOT_CONFIRMED «Не підтверджено» | C-13 attempt PENDING_REVIEW | ADM, HHR | HR, HREC, REC, TL | REC2, TLT, FIN | missing comment | attempt not PENDING_REVIEW → `POLYGRAPH_REVIEW_PENDING_REQUIRED` | ✅ |
| | | | stage stays POLYGRAPH; attempt → NOT_CONFIRMED (final for the attempt); `polygraph.reviewed {decision:'NOT_CONFIRMED'}`; `polygraph.not_confirmed` → HR of the attempt, owner | | | | | |
| T14c | POLYGRAPH_RETAKE «Перепройти» | C-13 after T14b | ADM, HHR | HR, HREC, REC, TL | REC2, TLT, FIN | missing comment; `hrUserId` without HR/HHR in vertical | latest attempt not NOT_CONFIRMED → `INVALID_TRANSITION`; a second open attempt → 409 (partial unique) | ✅ |
| | | | new attempt `attempt_no + 1`, ASSIGNED (default HR = previous), back to T12; attempt-1 PDF kept read-only (ADM/HHR/HR only); `polygraph.retake_requested {attemptNo}`; `polygraph.assigned` → HR; `polygraph.retake` → owner; retakes unlimited ⚠ OWNER | | | | | |
| T14d | POLYGRAPH_REVIEW_REJECT «Відмовити» | C-13 after T14b | ADM, HHR | HR, HREC, REC, TL | REC2, TLT, FIN | `reasonCode` OTHER without comment | latest attempt not NOT_CONFIRMED → `INVALID_TRANSITION` | ✅ |
| | | | POLYGRAPH → REJECTED (default `POLYGRAPH_FAILED`); no routing; Rejected archive; `application.rejected` → owner, TL | | | | | |
| T15 | OFFER_DRAFT (stay) | OFFER (after T14 PASS) | ADM, HHR, HR (probationDays unchanged) | HREC, REC, TL; HR changing `probationDays` | REC2, TLT, FIN | non-integer/negative `amountMinor`, missing `startDate`, `probationDays` 0 / 91 | `probationDays` > vacancy days (code G-08); stage POLYGRAPH (unconfirmed attempt) → `INVALID_TRANSITION` | ✅ |
| T16 | OFFER_SEND | C-14 (DRAFT) | ADM, HHR | HR, HREC, REC, TL | REC2, TLT, FIN | missing `offerId` | candidate without email → `CANDIDATE_EMAIL_REQUIRED`; not DRAFT → `INVALID_TRANSITION` | ✅ |
| T17 | OFFER_ACCEPTED | C-15 (SENT) | ADM, HHR, HR | HREC, REC, TL | REC2, TLT, FIN | missing `confirmedStartDate` | EXPIRED / DRAFT → `INVALID_TRANSITION`; second acceptance → 409 (partial unique) | ✅ |
| T18 | OFFER_DECLINED | C-15 | ADM, HHR, HR | HREC, REC, TL | REC2, TLT, FIN | missing `reasonCode` | not SENT → `INVALID_TRANSITION` | ✅ |
| T19 | OFFER_EXPIRE (system) | C-15, clock 2026-11-19 00:00 Kyiv | `offer-expiry` job only [assumes Q-10] | any user incl. ADM | — | — | `valid_until` not passed → no change; rerun → no duplicate event | n/a |
| T20 | CONFIRM_FIRST_DAY OFFER→PROBATION | C-16 / C-17 | ADM, HHR, HR | HREC, REC, TL | REC2, TLT, FIN | missing date; date > today | no ACCEPTED offer → `OFFER_NOT_ACCEPTED`; date before acceptance [assumes Q-57] (code G-08) | ✅ |
| T21 | PROBATION_PASS | C-19 (day 35) / C-18 (day 12) | TL (elapsed ≥ 30), HHR, ADM (comment when < 30) | HREC ⚠, REC, HR | REC2, TLT (C-18 on V-V), FIN | override without comment | TL on C-18 → `PROBATION_MIN_30_DAYS` | ✅ |
| T22 | PROBATION_FAIL | C-18 | TL, HHR, ADM | HREC ⚠, REC, HR | REC2, TLT, FIN | missing reason (coded list [assumes Q-121]) | — | ✅ |
| T23 | REJECT (NEW…TL_INTERVIEW) | C-02, C-06 | ADM, HREC, REC | TL (on C-06) | HHR, HR, REC2, TLT, FIN | missing `reasonCode`; OTHER without comment | — (no routing) | ✅ |
| T23b | REJECT (POLYGRAPH, OFFER) | C-13, C-15 | ADM, HHR, HR, HREC ⚠ [assumes Q-18] | REC, TL | REC2, TLT, FIN | as T23 | — ; PLANNED tranches → CANCELLED on C-16 | ✅ |
| T24 | WITHDRAW (NEW…OFFER) | C-04, C-15 | ADM, HREC, REC | HHR, HR (C-15; see Q-56), TL | REC2, TLT, FIN | missing comment | from PROBATION → `INVALID_TRANSITION` | ✅ |
| T25 | MOVE_BACK recruiting | C-04, C-06, C-08 | ADM, HREC | REC, TL (C-06+) | HHR, HR, REC2, TLT, FIN | missing comment | from NEW → `INVALID_TRANSITION` | ✅ |
| T25b | MOVE_BACK hr | C-13, C-16 | ADM, HHR, HREC ⚠ | HR, REC, TL | REC2, TLT, FIN | missing comment | from PROBATION → `PROBATION_IMMUTABLE`; C-16 → snapshot voided, tranches CANCELLED [assumes Q-60]; OFFER→POLYGRAPH keeps the PASSED attempt and opens a new ASSIGNED attempt | ✅ |
| T26 | FORCE_MOVE | C-04, C-18 | ADM | every visible non-ADM role | REC2, TLT, FIN | missing comment / target | IN_WORK→OFFER without a Head HR-confirmed PASSED attempt with PDF → `POLYGRAPH_MANDATORY`; →PROBATION without accepted offer → `OFFER_NOT_ACCEPTED`; from PROBATION → `PROBATION_IMMUTABLE`; from terminal → `INVALID_TRANSITION` | ✅ |
| T27 | REASSIGN_OWNER | C-19 (owner REC2) → REC | ADM, HREC | REC, HHR, HR, TL; HREC → self (SB-13) | TLT, FIN | missing reason | new owner without REC/HREC in vertical (recruiter.crypto) or inactive (code G-08); sourcer unchanged | ✅ |
| T28 | SET_BONUS_SPLIT | C-16, C-19 | ADM, HREC | REC, HHR, HR, TL; split incl. actor (SB-11/12) | REC2, TLT, FIN | sum ≠ 100; missing reason; recipient not REC/HREC | stage NEW → `INVALID_TRANSITION`; all tranches PAID (code G-08) | ✅ |

**Interview sub-actions**

| ID | Action | Allowed | 403 | Data → 400 | Guard → 409 |
|---|---|---|---|---|---|
| SM-IA-01 | INTERVIEW_UPDATE | ADM, HREC, REC | TL | invalid `meetUrl` | not SCHEDULED; event `interview.updated {field, old, new}` |
| SM-IA-02 | REQUEST_RESCHEDULE | TL, ADM | REC, HREC | 0 or 4 slots; past slot | RESCHEDULE_PENDING; 2nd request → `interview.reschedule_escalated` → HREC [assumes Q-67] |
| SM-IA-03 | CONFIRM_RESCHEDULE | ADM, HREC, REC | TL | `slotIndex` out of range | not pending |
| SM-IA-04 | COUNTER_PROPOSE | ADM, HREC, REC | TL | as IA-02 | not PENDING_RECRUITER |
| SM-IA-05 | TL_CONFIRM_COUNTER | TL (permission code G-08) | REC | `slotIndex` | not PENDING_TL |
| SM-IA-06 | MARK_NO_SHOW | ADM, HREC, REC | TL | missing `who` | interview in future (G-08) |

**Unit exhaustive (pure machine):** UT-SM-EXH-01 every (11 stages × 34 `PipelineAction`s) pair not in the table → `INVALID_TRANSITION`; UT-SM-EXH-02 `availableActions` = set of actions whose `plan()` succeeds, for each fixture × permission set (buttons derive from it); UT-SM-EXH-03 guard order G6→G1→G2→G3→G4→G5 (e.g. stale + forbidden → 403 first). Vacancy status machine VS-01..10: create OPEN/DRAFT (D2), approve, hold/resume, auto FILL in the T20 transaction, reopen requires headcount > hires, cancel requires resolved applications, headcount edit ≤ hires → FILLED, SET_BONUS_AMOUNT (§6.2).

**Polygraph attempt machine (state machine §9.1)**

| ID | Case | Expected |
|---|---|---|
| SM-PA-01 | T09 creates attempt 1 UNASSIGNED; T14c creates attempt n+1 ASSIGNED | attempt numbers 1..n, one row per attempt |
| SM-PA-02 | Second non-final attempt for the same application (direct insert / concurrent T14c) | partial unique violation → 409 |
| SM-PA-03 | HR edits PDF/outcome after PENDING_REVIEW | 409 `INVALID_TRANSITION`; attempt immutable |
| SM-PA-04 | PDFs of all attempts | ADM/HHR/HR read (signed URL); REC/TL/HREC → 404 (POLY-04) |
| SM-PA-05 | Application leaves POLYGRAPH (T23b, T24, T25b, T26) with an open attempt | open attempt → CANCELLED; finished attempts kept |

**Counts:** 33 rows (T01–T28, plus T14b/T14c/T14d, T23b, T25b) × 7 roles = 231 role cases + 64 extra REC2/TLT denials + 51 missing/invalid-data + 50 guard + 29 stale + 2 create races = **427 integration cases**; + 6 sub-actions × 4 cases = 24; + 5 attempt-machine cases; + every invalid (stage × action) pair generated in unit tests (11 stages × 34 actions minus valid pairs, ≈ 330).

## 5. Routing tests (ROUTE-01..10)

Pure `routing.nextVacancy` (unit) + service effects (integration). Group = «Медіабаєр — Facebook» × Гемблінг. Base fixture (Kyiv): **V-V** Vasyl P0, created 2026-10-01, OPEN · **V-T** Taras P1, created 2026-10-05, OPEN · **V-3** TL3 (fixture `tl3.gambling@fixture.test`) P2, created 2026-10-10, OPEN. `now` = 2026-11-16 10:00 Kyiv (08:00Z), cooldown 180, auto-routing ON, candidate X, owner/sourcer REC.

| ID | Given | Action | Expected application / vacancy result | Events / notifications |
|---|---|---|---|---|
| RT-01 | Base | T02 X → position | A1 on V-V at NEW, `source_type=POSITION` [assumes Q-71 b]; ranked [V-V 0, V-T 1, V-3 2] | `application.created {routedBy:'PRIORITY'}` |
| RT-02 | A1 at SUBMITTED on V-V | Vasyl T07 (`TL_DECLINED_PROFILE`) | A1 REJECTED `routed=true`; A2 on V-T at SUBMITTED_TO_TL [assumes Q-71 a], `ROUTED`, `routed_from=A1`, same owner/sourcer, tlSummary copied, `tl_decision=PENDING`; one transaction | `application.tl_declined`, `stage_changed` (A1), `application.routed {fromTl:Vasyl,toTl:Taras}`, `application.created` (A2) · `tl.decision` → REC; `application.routed` → REC + Taras |
| RT-03 | A2 on V-T at TL_INTERVIEW | Taras T10 | A2 REJECTED routed; A3 on V-3 at SUBMITTED | `interview.completed`, `application.routed` |
| RT-04 | A3 on V-3 | TL3 T10 | NONE: A3 REJECTED `routed=false`, reason `TL_INTERVIEW_FAILED` → Rejected archive (ROUTE-04); skipped V-V, V-T `TL_REJECTED_RECENTLY`, V-3 `EXCLUDED` | `interview.completed`, `stage_changed`; no `application.routed` |
| RT-05 | Taras priority = 0 (tie with Vasyl) | T02 | V-V (created 10-01 < 10-05, D5) | — |
| RT-06 | As RT-05, V-T created 2026-09-20 | T02 | V-T | — |
| RT-07 | As RT-05, equal `createdAt` | T02 | lower id wins (deterministic) | — |
| RT-08 | Vasyl has V-V (10-01) and V-V2 (2026-11-16) | T02; then Vasyl declines | V-V; after decline V-V2 skipped `TL_REJECTED_RECENTLY` (per TL person [assumes Q-06]) → V-T | as RT-02 |
| RT-09 | V-V ON_HOLD | T02 | V-T; skipped V-V `ON_HOLD` | — |
| RT-10 | V-V FILLED | T02 | V-T; skipped `FILLED` | — |
| RT-11 | V-V CANCELLED | T02 | V-T; skipped `CANCELLED` | — |
| RT-12 | V-V DRAFT / soft-deleted / no TL / Vasyl deactivated | T02 | V-T; reasons `DRAFT`, `DELETED`, `NO_TEAM_LEAD`, `TEAM_LEAD_INACTIVE` [assumes Q-73] | — |
| RT-13 | Vasyl rejected X on 2026-05-21 10:00 Kyiv (179 Kyiv days) | T02 | V-T; V-V `TL_REJECTED_RECENTLY` | — |
| RT-14 | Vasyl rejected X on 2026-05-19 10:00 Kyiv (181 days) | T02 | V-V | — |
| RT-15 | V-V ON_HOLD, V-T FILLED, V-3 CANCELLED | T02 | 409 `NO_OPEN_VACANCY_IN_GROUP`; no application | none |
| RT-16 | A1 on V-V at SUBMITTED; Admin changes Taras P1 → P3 | priority change, then Vasyl declines | A1 not moved [assumes Q-73]; A2 on V-3 (P2 now ahead of Taras P3) | `vertical.tl_priority_changed`, vacancy events on Taras' open vacancies; then as RT-02 with `toTl:TL3` |
| RT-17 | Admin sets V-3 `priority_override=0` | T02; then Vasyl declines | V-V (tie 0, older); after decline V-3 (0) before V-T (1) | `vacancy.updated` (override) |
| RT-18 | T01 X directly on V-T (`DIRECT`) | Taras T07 | A1 REJECTED `routed=false`; response `routingSuggestion {vacancyId: V-V}`; no A2; REC task «Оберіть наступного тімліда» | `application.tl_declined`; no `application.routed` |
| RT-19 | RT-18 | REC accepts the suggestion | A2 on V-V (stage per Q-71 a: SUBMITTED_TO_TL), `routed_from=A1` | `application.routed`, `application.created` |
| RT-20 | Vertical auto-routing OFF; A1 POSITION on V-V | Vasyl T07 | A1 REJECTED, no A2; response ranked [V-T 1, V-3 2] for manual pick [assumes Q-99]; REC picks V-3 → application on V-3 | `application.tl_declined`; then `application.created` |
| RT-21 | A1 at POLYGRAPH / OFFER / PROBATION | T14 (FAIL) / T14d / T23b / T22 | no routing, no suggestion (ROUTE-05) | — |
| RT-22 | X active on V-V | T01 X → V-T; 2 concurrent T02 | 409 `ACTIVE_APPLICATION_IN_GROUP`; race → one 201, one 409 (partial unique index) | — |
| RT-23 | REC rejects A1 via T23 at SUBMITTED | later T02 | no routing; Vasyl **not** in cooldown (not a TL decision) → V-V | — |
| RT-24 | TL4 (fixture) without priority | T02 with V-V, V-T, V-3 closed | TL4 vacancy ranked after all prioritised [assumes Q-93] | — |
| RT-25 | Shuffled input order | `nextVacancy` | identical decision and ranked list (property test, 200 permutations) | — |
| RT-26 | Vasyl declined X on 2026-10-17; X REJECTED | T03 REACTIVATE to position | V-T (Vasyl skipped) [assumes Q-70] | `application.reactivated` |

Cooldown is measured in Kyiv calendar days from the rejection date [assumes Q-06]; RT-13/14 cross the DST change (EEST → EET). The exact 180-day boundary is a gap (G-05).

## 6. Bonus tests (§9, BONUS-16)

Common fixture unless noted: scheme **S30** «Стандартна 30/70» `FIXED` 100000 USD (1 000 $), tranches [PROBATION_STARTED 3000 bp, PROBATION_PASSED 7000 bp], clawback NONE, `minDaysForTranche1` null, urgent 12500 bp. **S100** «Повністю після ВТ» `FIXED` 100000 USD, [PROBATION_PASSED 10000 bp]. Offer accepted 2026-11-02, start 2026-11-09 (Mon), 90 days → planned end **2027-02-06** [assumes Q-58: start + N − 1; PRD-literal start + N = 2027-02-07, G-06]. Sourcer = owner = REC unless noted. Amounts in minor units (USD cents). Rounding: half-up to the cent once on the total; tranche 1 half-up; last tranche/recipient takes the remainder [assumes Q-76].

### 6.1 Engine and lifecycle

| ID | Given | Action / date | Expected |
|---|---|---|---|
| BN-01 | S30 | T17 2026-11-02 | snapshot total 100000, `amountSource=SCHEME`; T1 30000 PLANNED (REC, due 2026-11-09); T2 70000 PLANNED (REC, due 2027-02-06); event `bonus.snapshot_created` |
| BN-02 | BN-01 | T20 2026-11-09 | T1 ELIGIBLE in the same tx; `bonus.eligible` → REC, `bonus.to_approve` → HREC |
| BN-03 | BN-02 | T21 2027-02-06 (day 90) | T2 ELIGIBLE 2027-02-06 |
| BN-04 | S100 | T17, T20, T21 | one tranche 100000; nothing at start; ELIGIBLE at pass |
| BN-05 | `PERCENT_OF_MONTHLY_SALARY` 10000 bp, USD, 30/70; offer 6000000 UAH/month GROSS; FX 2026-11-02 1 USD = 41.50 UAH (fixture rate; source NBU [assumes Q-74]) | T17 | base = 6000000 / 41.50 = 144578.31 → **144578**; T1 = 43373 (43373.4); T2 = **101205**; `fxRateUsed {UAH→USD, "41.50", 2026-11-02}` |
| BN-06 | BN-05 | fx_rate for 2026-11-02 edited to 42.00 afterwards | snapshot unchanged |
| BN-07 | `PERCENT_OF_ANNUAL_SALARY` 1000 bp, USD; offer 250000 USD/month | T17 | annual 3000000 → 300000; T1 90000; T2 210000; `fx = null` |
| BN-08 | `PERCENT_OF_MONTHLY` 10000 bp; offer 3600000 USD/year | T17 | monthly 300000 → 300000 |
| BN-09 | BN-05 with NET instead of GROSS | T17 | same base [assumes Q-75] |
| BN-10 | S30, vacancy Urgent | T17 | total 125000 (`multiplierBp` 12500); T1 37500; T2 87500 |
| BN-11 | S30 base 99999, Urgent | T17 | 124998.75 → **124999**; T1 37500 (37499.7); T2 **87499** |
| BN-12 | BN-10 | urgency removed after T17 | snapshot unchanged [assumes Q-75] |
| BN-13 | 3 tranches 3300/3300/3400 bp (STARTED, DAYS_AFTER_START(45), PASSED), base 10001 | T17 | 3300, 3300, **3401** (remainder to the last) |
| BN-14 | S30 base 33333 | T17 | T1 10000 (9999.9); T2 23333 |
| BN-15 | BN-02 | Vasyl T21 on 2026-12-09 (elapsed 30, «день 31») | allowed; T2 ELIGIBLE 2026-12-09; due moved 2027-02-06 → 2026-12-09 (earlier only); `probation.passed {early:true, override:false}`; `actual_end_date` 2026-12-09 |
| BN-16 | BN-02 | Vasyl T21 on 2026-12-08 (elapsed 29, «день 30») | 409 `PROBATION_MIN_30_DAYS`; T2 still PLANNED due 2027-02-06. HHR same day with comment → allowed `{early:true, override:true}`, T2 ELIGIBLE 2026-12-08 |
| BN-17 | BN-02 | Vasyl T22 on 2026-11-09 (day 1) | allowed; T2 PLANNED → CANCELLED (`PROBATION_FAILED`); T1 ELIGIBLE unchanged (NONE, unpaid) |
| BN-18 | T1 PAID «2026-11», NONE | T22 2026-11-28 (day 20) | no clawback; T1 PAID |
| BN-19 | FULL_IF_LEFT_WITHIN_N_DAYS N=60, T1 PAID | T22 2026-11-28 (worked 20 [assumes Q-77: fail day counts]) | T1 PAID → CLAWBACK_PENDING, clawback 30000; ADM settles → CLAWED_BACK in «2026-12»; payout report line −30000 |
| BN-20 | as BN-19 | T22 on day 59 (2027-01-06) vs day 60 (2027-01-07) | 30000 clawback vs none (`worked < N`) |
| BN-21 | FULL N=120, passed at end | HHR marks «Звільнився» 2027-03-01 (worked 113) [assumes Q-78] | clawback 30000 |
| BN-22 | PRORATED, probation 60 (end 2027-01-07), T1 PAID | T22 2026-11-28 (worked 20, unworked 40) | 30000 × 40/60 = **20000** CLAWBACK_PENDING |
| BN-23 | PRORATED, probation 90, T1 PAID | T22 day 20 | 30000 × 70/90 = 23333.33 → **23333** |
| BN-24 | PRORATED, 60 days, T1 ELIGIBLE unpaid | T22 day 20 | payable 30000 − 20000 = 10000 [assumes Q-79]; representation ⚠ (state machine §10) |
| BN-25 | `minDaysForTranche1`=14, T1 ELIGIBLE unpaid | T22 2026-11-18 (worked 10) | T1 CANCELLED (`LEFT_WITHIN_MIN_DAYS`); T2 CANCELLED |
| BN-26 | as BN-25 | T22 2026-11-22 (worked 14) | T1 kept (`worked < N`, G-05) |
| BN-27 | min 14, T1 PAID | T22 worked 10 | BONUS-09 not applied (paid); clawback policy decides (NONE → nothing) |
| BN-28 | min 14, T1 APPROVED unpaid | T22 worked 10 | APPROVED → CANCELLED |
| BN-29 | candidate `former_employee_left_on` 2026-03-01 [assumes Q-47] | T17 2026-11-02 | `BLOCKED REHIRE_WITHIN_12_MONTHS`; snapshot with `blocked_reason`, no tranches |
| BN-30 | left 2025-10-31 | T17 2026-11-02 | computed normally (exact 12-month boundary = G-05) |
| BN-31 | sourcer REC, owner REC2 | T17 → T21 | T1 30000 → REC; T2 70000 → REC2 provisional, fixed at pass (`RECIPIENT_FIXED`). Variant: HREC as sourcer → T1 HREC (Q-44) |
| BN-32 | BN-31 | HREC T27 owner REC2 → REC during probation | T2 provisional → REC; sourcer unchanged; at pass T2 → REC |
| BN-33 | sourcer = owner | T21 | both tranches REC (100 %) |
| BN-34 | candidate created by REC, last activity 181 days ago | REC2 re-engages | REC2 becomes sourcer → T1 REC2 [assumes Q-08, Q-45]; 179 days → REC stays |
| BN-35 | REC2 creates a duplicate later, merged | T17 | sourcer = earliest creator REC [assumes Q-46] |
| BN-36 | after T17 | HREC T28 [REC 5000 bp, REC2 5000 bp], reason | T1 15000/15000; T2 35000/35000 [assumes Q-81 per tranche]; `application.bonus_split_set`; `bonus.split_changed` → REC, REC2 |
| BN-37 | base 33333 | split 50/50 | T1 10000 → 5000/5000; T2 23333 → 11666 / **11667** |
| BN-38 | T1 PAID | split 50/50 | only T2 rewritten; sum 90 → 400; REC → 403 |
| BN-39 | REC flagged as referrer [assumes Q-12] | T17 → T20 | REC rows ON_HOLD `SELF_REFERRAL`; at T20 `status_before_hold` PLANNED → ELIGIBLE while held; ADM `bonus.self_referral.approve` → T1 ELIGIBLE, T2 PLANNED; HREC → 403 |
| BN-40 | C-22 | ADM adjustment +5000 «Складний пошук», −2000 | ADJUSTMENT rows ELIGIBLE, separate lines; missing reason → 400; HREC → 403; FIN → 404; own bonus → SB-09 |
| BN-41 | BN-01 | S30 edited (base 150000, 50/50) | existing snapshot unchanged; next acceptance uses scheme version +1 |
| BN-42 | vacancy override S100, vertical default S30, global default | T17 for each fallback | precedence vacancy → vertical → global (BONUS-01) |
| BN-43 | scheme editor | percents sum 90 | 409 `TRANCHE_PERCENTS_NOT_100` |
| BN-44 | vacancy 90 days | HHR T15 `probationDays=60` before acceptance | T2 due 2027-01-07 instead of 2027-02-06 (BONUS-10); HR doing it → 403 |
| BN-45 | BN-02 | any end-date extension (PR-20..24) | 409 `PROBATION_EXTENSION_FORBIDDEN`; T2 due unchanged |
| BN-46 | C-22 T2 ELIGIBLE | HREC approve → ADM mark paid «2026-12» | APPROVED → PAID; missing period → 400; HREC mark paid → 403; PLANNED → APPROVED → 409; hold/release restores `status_before_hold` |
| BN-47 | any | `evaluateTriggers` twice / `bonus-triggers` rerun with the same run key | second run yields []; no duplicate rows/notifications |
| BN-48 | DAYS_AFTER_START(45) tranche | start 2026-11-09 | due 2026-12-24; fail on day 40 → CANCELLED [assumes Q-102] |
| BN-49 | C-16 (accepted, not started) | T23b REJECT | PLANNED tranches CANCELLED (`APPLICATION_CLOSED`) |
| BN-50 | C-16 | T25b MOVE_BACK, then re-accept | snapshot voided, tranches CANCELLED; new snapshot on re-acceptance [assumes Q-60] |

### 6.2 BONUS-16 vacancy reward

Fixture V-V, actor ADM, reason mandatory. Recommended policy: first set doesn't count [Q-106 b], calendar months in Kyiv [Q-107 a], per vacancy [Q-108 a], 24 h typo fix that doesn't reset the window [Q-110 b]. `vacancyRewardChangeAllowed` is unit-tested with **both** values of each policy parameter; the service uses the recommended values.

| ID | Given | Action (Kyiv) | Expected |
|---|---|---|---|
| B16-01 | V-V no reward | set 100000 USD on 2026-09-15 10:00 | 200; `vacancy.bonus_amount_changed {old:null,new:{100000,USD}}`, `isFirstSet`, `countsTowardLimit=false` [assumes Q-106] |
| B16-02 | B16-01 | 100000 → 50000 USD on 2026-11-16 10:00 | 200; event old → new, actor, `sensitivity=BONUS`, reason in `entity_event_pii`; audit row |
| B16-03 | B16-02 | 50000 → 70000 on 2026-12-16 10:00 | 409 `VACANCY_BONUS_CHANGE_TOO_SOON`, `nextAllowedAt` 2027-01-16T08:00:00Z [assumes Q-107]; nothing written |
| B16-04 | B16-02 | 2027-01-16 09:59 / 10:00 | 409 / 200. Policy `DAYS 60` (unit only): boundary 2027-01-15 10:00 |
| B16-05 | A1 offer accepted 2026-11-10 (reward 100000) | B16-02, then A2 accepted 2026-11-20 | A1 unchanged (T1 30000 / T2 70000, `amountSource=VACANCY_AMOUNT`); A2 total 50000 (T1 15000 / T2 35000) |
| B16-06 | first set 2026-10-20 | change 2026-11-16 | 200 (Q-106 b); unit with `firstSetCounts=true` → 409, next 2026-12-20 |
| B16-07 | B16-02 typo 50000 → 5000 at 2026-11-16 10:00 | fix 5000 → 50000 at 2026-11-17 09:00 / 10:01 | 200 `countsTowardLimit=false`, `nextAllowedAt` stays 2027-01-16 10:00 / 409 [assumes Q-110] |
| B16-08 | B16-02 on V-V | change V-T same day | 200 (per vacancy [assumes Q-108]) |
| B16-09 | — | 100000 USD → 4000000 UAH | counts as a change |
| B16-10 | — | empty reason; negative / fractional amount; currency outside UAH/USD/EUR [assumes Q-51] | 400 |
| B16-11 | — | HREC, REC (assigned), HHR, HR, TL; REC2 (not assigned, not uo); FIN; foreign-vertical HREC | 403 ×5; 404; 404; 404 |
| B16-12 | percent scheme + reward 50000 USD | T17 | base 50000, no FX, `fxRateUsed=null`, split from scheme [assumes Q-109] |
| B16-13 | Urgent + reward 50000 | T17 | 62500; T1 18750; T2 43750 [assumes Q-111] |
| B16-14 | V-V reward 50000 | clone (VAC-05), change clone same day | amount copied; change 200 (window restarts [assumes Q-112]) |
| B16-15 | — | GET V-V per role | FLD-07 |
| B16-16 | — | two concurrent changes | one 200, one 409 (`FOR UPDATE`) |
| B16-17 | — | clear to null | no test until decided (G-09) |
| B16-18 | V-V soft-deleted | change | 404 |
| B16-19 | B16-02 | UI | button disabled «Наступна зміна можлива з 16.01.2027»; D-24 warning «Кандидати з уже прийнятим офером зберігають попередню винагороду» (E2E-09, SHOT) |

## 7. Probation tests (PROB-01..07)

Fixture start 2026-11-09, 90 days, end 2027-02-06 [assumes Q-58]. Day N = elapsed + 1; days left = N_total − N.

| ID | Case | Expected |
|---|---|---|
| PR-01 | 2026-11-09 | «День 1 з 90 · залишилось 89 дн.»; elapsed 0 |
| PR-02 | 2026-12-13 | day 35, left 55 |
| PR-03 | 2026-12-08 23:30 Kyiv (21:30Z) vs 2026-12-09 00:30 Kyiv (22:30Z on the 8th) | day 30 → TL disabled `PROBATION_MIN_30_DAYS`, tooltip shows unlock date 09.12.2026 / day 31 → enabled |
| PR-04 | Start 2027-01-01, end 2027-03-31; 2027-03-28 (DST) | day 87; no skipped or doubled day |
| PR-05 | Offer 60 days | end 2027-01-07 |
| PR-06 | `probationDays` 0 / 91 on vacancy or offer | 400 (minimum: state machine 1, Q-50 recommends 30, G-06) |
| PR-07 | ProbationProgress on card, vacancy card, dashboard (PROB-07) | same numbers everywhere (E2E) |
| PR-10 | `probation-daily` 2027-01-23 (D-14) | `probation.reminder {days:14}` → owner + TL, in-app [Q-117: staff in-app only]; dedupe key `probation-reminder:{id}:D14:2027-01-23` |
| PR-11 | 2027-01-30 (D-7) | reminder 7 |
| PR-12 | 2027-02-05 (D-1) | reminder 1 |
| PR-13 | 2027-01-22, 2027-01-24 | none |
| PR-14 | 2027-02-07, 2027-02-08 (not closed) | daily `probation.overdue` to owner + TL; close task on dashboard (the end date itself = G-06) |
| PR-15 | Job rerun same run key | no duplicate notifications |
| PR-16 | Job missed 2027-01-23, manual rerun `runKey=2027-01-23` next day | D-14 sent once; the 2027-01-24 run sends nothing |
| PR-17 | Passed early 2026-12-09 | no reminders afterwards |
| PR-18 | C-17: start 2026-11-12, not confirmed | `probation.first_day_unconfirmed` on 2026-11-15 (recipients G-08) |
| PR-19 | DST fixture (PR-04) D-7 2027-03-24, D-1 2027-03-30 | sent on the Kyiv date regardless of UTC schedule |
| PR-20 | API change `plannedEndDate` +1 day | 409 `PROBATION_EXTENSION_FORBIDDEN` |
| PR-21 | Offer redraft with 90 days while in PROBATION | 409 `INVALID_TRANSITION` (T15 only in OFFER) |
| PR-22 | Vacancy `probation_days` raised after start | active probation unchanged |
| PR-23 | Start date moved later after start | 409 `PROBATION_EXTENSION_FORBIDDEN` |
| PR-24 | Direct SQL: `UPDATE probation SET planned_end_date = +1`; `actual_end_date > planned`; `planned > start + 90` | trigger P0001 → mapped 409; CHECK violation |
| PR-25 | Pass on 2027-02-10 (late) | `actual_end_date` = 2027-02-06; T2 ELIGIBLE date 2027-02-06 [assumes Q-59] |
| PR-26 | Fail after end date | Admin only with comment [assumes Q-59]; TL/HHR → 409 (G-08) |
| PR-27 | Force/move-back out of PROBATION | 409 `PROBATION_IMMUTABLE` |
| PR-28 | CONFIRM_FIRST_DAY date > today / before offer acceptance | 400 / 409 [assumes Q-57] |

## 8. E2E journeys

| ID | Phase | Journey (clock in Kyiv) | Key assertions |
|---|---|---|---|
| E2E-01 | 3–4 | **Happy path Гемблінг.** 1) 2026-11-16 10:00 Vasyl requests vacancy V-V2 «Медіабаєр — Facebook» → REC sees it as unassigned with «Взяти в роботу». 2) REC creates a candidate (CV PDF, consent) → «Подати на посаду» → application on **V-V** (oldest Vasyl vacancy; VAC-G-FILLED skipped). 3) Screening: invalid Meet link rejected inline; `https://meet.google.com/abc-defg-hij` 12:00 → IN_WORK. 4) 12:30 submit to TL. 5) Vasyl declines (reason + comment); preview «Кандидата буде передано: Тарас … · П1» → A2 on V-T SUBMITTED; V-V2 skipped; Taras notified. 6) Taras accepts on 390×844; REC schedules interview 2026-11-18 14:00. 7) Taras requests reschedule (2026-11-19 11:00 / 16:00) → «Очікує перенесення»; REC confirms slot 2 with a new link. 8) 2026-11-19 17:00 Taras: Pass + feedback → POLYGRAPH. 9) HR self-assigns, schedules 2026-11-20 10:00; 12:00 save disabled without PDF; uploads PDF + Pass (T13) → «Очікує підтвердження»; REC requests PDF URL → 404; **HHR D-10a «Підтвердити» (T14)** → OFFER. 10) HHR offer 4500000 UAH gross/month, start 2026-11-23, 90 days, preview, send; Accepted → snapshot from V-T reward 100000 USD → T1 30000 / T2 70000 PLANNED. 11) 2026-11-23 HR confirms first day → PROBATION, T1 ELIGIBLE, hires 3/4. 12) 2026-12-22 (day 30): Taras «Завершити достроково» disabled with reason; API → 409. 13) 2026-12-23 (day 31): Taras passes → T2 ELIGIBLE, due moved 2027-02-20 → 2026-12-23. 14) HREC bulk-approves. 15) ADM marks paid «2026-12». 16) FIN Statistics → Виплати 2026-12: REC 1 000 $ (300 + 700), full name + application ID only, CSV export | Every step: timeline event, notification intent, stage chip, no console errors, axe clean |
| E2E-02 | 2/5 | **Delete vs reject.** REC rejects C-02 → Архів → Відмови, not Видалені. REC deletes C-01 (own, before interview) with reason → Видалені (visible to HREC/ADM only), gone from lists/search, REC direct URL → 404. REC delete on C-10 → disabled with reason; API 403. HREC deletes a vacancy with active applications → ARCH-03 choices. HREC restores C-01 → back in lists, `restored` event. REC reactivates C-24 → new application. ADM purge → «Кандидат #… (видалено)» stub | Archive placement, scope, events |
| E2E-03 | 1/4 | **Finance.** TOTP challenge; lands on Statistics; FIN-01/02/06/07 | 2FA, gating |
| E2E-04 | 3 | Routing to exhaustion: Vasyl → Taras → TL3 (fixture) → Rejected archive (RT-02..04) | Rejected archive with last reason |
| E2E-05 | 3 | Direct submit → decline → «Оберіть наступного тімліда» suggestion accepted (RT-18/19) | ROUTE-08 |
| E2E-06 | 3 | Polygraph: HR result → HHR D-10a «Не підтверджено» → «Перепройти» (T14b → T14c) → reschedule → new PDF → «Підтвердити» (T14) → OFFER; attempt-1 PDF in history; variant «Відмовити» (T14d) → Архів → Відмови | POLY-05 owner decision |
| E2E-07 | 3–4 | Probation fail day 1 → T2 CANCELLED, archive | BONUS-07 |
| E2E-08 | 3 | Optimistic rollback: two contexts move the same card → second gets «Етап уже змінився. Оновили картку.» | UI-07, 409 |
| E2E-09 | 4 | BONUS-16 change + lock (B16-02/03/19) | D-24 |
| E2E-10 | 3 | Mobile TL set (390×844): D-03, D-05, D-06, D-15, D-16 | UI-05 |
| E2E-11 | 2 | Candidate vertical transfer; blocked with active application | CAND-06 |
| E2E-P1-01..08 | 1 | Magic link (Inbucket), TOTP enrol (Admin, Finance), invite accept, deactivate user, nav per role, theme, 404 copy, CSP | Phase-1 stories |

## 9. Screenshot plan (SHOT-01..03)

- **Clock:** 2026-11-16 (Mon) 10:00 Europe/Kyiv = 08:00Z, server FixedClock + Playwright `page.clock`. Seed dates are absolute and aligned to this anchor (e.g. probation day 35 = start 2026-10-13). Story SHOT-03-1's example date 02.11.2026 gets updated to this one.
- **Matrix per unit:** 1440×900 + 390×844 × light + dark = **4 PNG per unit** (unit = screen × role × state). Full-page. Dialogs = bottom sheet on mobile.
- **File:** `screenshots/phase-N/<NN>-<role>-<screen>-<state>-<viewport>-<theme>.png`, viewport ∈ `desktop|mobile`, theme ∈ `light|dark`. NN = screen number S-xx; dialogs NN = 20 + D-xx (D-10a shares NN 30 with D-10, distinct `<screen>` slug). Role slugs: `public, admin, head-recruiter, recruiter, head-hr, hr, team-lead, finance`. Gallery `index.html` (groups by screen, Ukrainian captions, opens from disk) + copy to `screenshots/latest/`.
- **Data:** demo seed (§10) for filled states; **empty** states run on an `empty` seed profile (migrations + verticals + users only). States not in the seed are prepared through `/api/v1` calls in the spec setup. Loading/error states use `page.route('**/api/v1/**')` delay/500 on a client-triggered refetch (filter change) with `page.clock` advanced past 150 ms.
- Each phase folder contains the **full** current set. New screens are added the moment they ship.

| NN | ID | `<screen>` | Roles × states | Units | Phase |
|---|---|---|---|---|---|
| 01 | S-01 | login | public: default, link-sent, error, deactivated, link-expired | 5 | 1 |
| 01 | S-01a | login-totp | admin, finance: enroll, challenge | 4 | 1 |
| 02 | S-02 | invite | public: valid, expired, invalid | 3 | 1 |
| 14 | S-14 | settings-users | admin: list, filter-empty, user-details, deactivate-dialog, role-assign-dialog | 5 | 1 |
| 14 | S-14 | settings-verticals | admin: list, create-rename-dialog (no deactivation, Q-37) | 2 | 1 |
| 14 | S-14 | settings-tl-priorities | admin: list, priority-unset | 2 | 1 |
| 14 | S-14 | settings-audit | admin: list, record-details, login-history | 3 | 1 |
| 16 | S-16 | profile | 7 roles: default | 7 | 1 |
| 18 | S-18 | not-found | finance, recruiter, head-recruiter: settings-route | 3 | 1 |
| 48 | D-28 | dialog-invite-user | admin: empty, filled, validation-error, duplicate-email | 4 | 1 |
| 03 | S-03 | dashboard | 6 roles (not finance): filled; recruiter, team-lead: empty; admin: vacancies-kanban; head-recruiter: saved-filter; recruiter: loading, error | 12 | 2 |
| 04 | S-04 | vacancies | 6 roles: filled; admin: filter-empty; team-lead: empty; head-recruiter: loading, error | 10 | 2 |
| 05 | S-05 | vacancy-form | admin: create, edit; head-recruiter: create, validation-error; recruiter: create; team-lead: request | 6 | 2 |
| 06 | S-06 | vacancy-card | 6 roles: filled (funnel = viewer scope, FLD-06); admin: on-hold, bot-source; head-recruiter: filled-status | 9 | 2 |
| 07 | S-07 | candidates | 6 roles: filled (TL without contacts); admin: filter-empty; recruiter: empty, loading, error | 10 | 2 |
| 08 | S-08 | candidate-form | recruiter: empty, validation-error, duplicate-visible, duplicate-hidden, after-save; head-recruiter: empty | 6 | 2 |
| 09 | S-09 | candidate-card | recruiter: talent-pool, cv, comments, loading, error; head-recruiter: profile; admin: files | 7 | 2 |
| 14 | S-14 | settings-positions | admin, head-recruiter [Q-48]: list | 2 | 2 |
| 17 | S-17 | search | admin, recruiter, team-lead, hr: results; recruiter: no-results, recent | 6 | 2 |
| 18 | S-18 | not-found | team-lead (other TL's vacancy), hr (candidate below Polygraph), recruiter (other recruiter's candidate) | 3 | 2 |
| 38 | D-18 | dialog-delete | recruiter: candidate; head-recruiter: vacancy, vacancy-with-applications | 3 | 2 |
| 47 | D-27 | dialog-clone-vacancy | admin: default; head-recruiter: with-import | 2 | 2 |
| 49 | D-29 | dialog-transfer-vertical | admin, head-recruiter, head-hr: default; head-recruiter: blocked-active-applications | 4 | 2 |
| 50 | D-30 | dialog-assign-recruiters | head-recruiter (from vacancy card): default, multi-select | 2 | 2 |
| 09 | S-09 | candidate-card (stages) | new (recruiter, head-recruiter) · in-work (recruiter) · submitted (recruiter, team-lead) · interview (recruiter, team-lead) · reschedule-pending (recruiter, team-lead) · polygraph-scheduled (recruiter, hr, head-hr) · polygraph-pending-review (head-hr, recruiter) · polygraph-retake (hr) · polygraph-confirmed (recruiter, hr, team-lead) · offer (head-hr, hr, recruiter, team-lead) · probation-day-12 (team-lead, head-hr) · probation-day-35 (team-lead, recruiter, head-hr, hr) · probation-14-days-left (team-lead) · probation-overdue (team-lead, head-hr) · hired (recruiter, admin) · rejected (recruiter, head-recruiter) · routed (team-lead, recruiter) · forced-move (admin) | 38 | 3 |
| 10 | S-10 | calendar | 6 roles: week; recruiter: day; team-lead: reschedule-pending, empty | 9 | 3 |
| 14 | S-14 | settings-rejection-reasons, settings-polygraph-locations, settings-offer-templates | admin: list, list, editor + preview | 4 | 3 |
| 18 | S-18 | not-found | team-lead (Taras → Vasyl's candidate) | 1 | 3 |
| 21 | D-01 | dialog-screening | recruiter: empty, invalid-meet, filled | 3 | 3 |
| 22 | D-02 | dialog-submit-tl | recruiter: default, validation-error | 2 | 3 |
| 23 | D-03 | dialog-tl-decision | team-lead: default, decline-with-routing-preview | 2 | 3 |
| 24 | D-04 | dialog-schedule-interview | recruiter: default, invalid-meet | 2 | 3 |
| 25 | D-05 | dialog-interview-result | team-lead: pass, reject-routing-preview; recruiter: on-behalf [Q-20] | 3 | 3 |
| 26 | D-06 | dialog-reschedule-request | team-lead: one-slot, three-slots | 2 | 3 |
| 27 | D-07 | dialog-reschedule-answer | recruiter: choose-slot, counter-propose | 2 | 3 |
| 28 | D-08 | dialog-no-show | recruiter: default | 1 | 3 |
| 29 | D-09 | dialog-polygraph-schedule | head-hr: assign; hr: self | 2 | 3 |
| 30 | D-10 | dialog-polygraph-result | hr: no-pdf, pdf-uploaded, file-error | 3 | 3 |
| 31 | D-11 | dialog-offer | head-hr: new, pdf-preview; hr: draft | 3 | 3 |
| 32 | D-12 | dialog-offer-send | head-hr: preview, no-email | 2 | 3 |
| 33 | D-13 | dialog-offer-outcome | hr: accepted, declined, expired | 3 | 3 |
| 34 | D-14 | dialog-first-day | hr: default | 1 | 3 |
| 35 | D-15 | dialog-probation-pass | team-lead: enabled; head-hr: override; admin: override | 3 | 3 |
| 36 | D-16 | dialog-probation-fail | team-lead, head-hr: default | 2 | 3 |
| 37 | D-17 | dialog-reject | recruiter: early-stage; head-hr: offer-stage | 2 | 3 |
| 38 | D-18 | dialog-delete | recruiter: disabled-after-interview | 1 | 3 |
| 40 | D-20 | dialog-move-to | recruiter, team-lead: default | 2 | 3 |
| 41 | D-21 | dialog-force-move | admin: default, polygraph-mandatory-error | 2 | 3 |
| 42 | D-22 | dialog-move-back | head-recruiter, head-hr: default | 2 | 3 |
| 43 | D-23 | dialog-reassign | head-recruiter: single, bulk | 2 | 3 |
| 30 | D-10a | dialog-polygraph-review | head-hr: pass-recorded, fail-recorded, not-confirmed-choice (Перепройти / Відмовити) | 3 | 3 |
| 11 | S-11 | statistics | admin: 6 tabs; finance: 6 tabs; head-recruiter: overview; recruiter: overview, funnel, empty-period; head-hr: overview; hr: overview; team-lead: overview, team-leads; admin: loading, error | 22 | 4 |
| 12 | S-12 | statistics-bonuses / -payouts | bonuses: admin, head-recruiter, recruiter, finance, recruiter-empty; payouts: admin, finance, head-recruiter; in-screen dialogs: approve-confirm (head-recruiter), mark-paid (admin), adjustment (admin), split (head-recruiter), clawback (admin); head-recruiter: loading, error | 15 | 4 |
| 14 | S-14 | settings-bonus-schemes, settings-general | admin: list, editor, sum-error, general | 4 | 4 |
| 06 | S-06 | vacancy-card (reward) | admin: can-change, locked; recruiter: read-only | 3 | 4 |
| 09 | S-09 | candidate-card (bonus tab) | admin; head-recruiter: split; recruiter: fx-urgent-tooltip, blocked-rehire | 4 | 4 |
| 18 | S-18 | not-found | finance: object-url | 1 | 4 |
| 44 | D-24 | dialog-vacancy-reward | admin: default-warning, reason-missing | 2 | 4 |
| 13 | S-13 | archive | admin, head-recruiter: rejected, deleted, closed; recruiter, team-lead: rejected, closed (normal visibility, Q-24); hr, head-hr: rejected (≥ Polygraph); recruiter: empty; admin: retention-banner; head-recruiter: routing-chain | 15 | 5 |
| 15 | S-15 | notifications | 6 roles: page; recruiter, team-lead: bell-popover; team-lead: empty | 9 | 5 |
| 16 | S-16 | profile | recruiter: notification-channels | 1 | 5 |
| 09 | S-09 | candidate-card | admin: purged-stub, deleted | 2 | 5 |
| 18 | S-18 | not-found | team-lead: archive-deleted | 1 | 5 |
| 39 | D-19 | dialog-purge | admin: default, word-typed | 2 | 5 |
| 45 | D-25 | dialog-reactivate | head-recruiter, recruiter [Q-24]: default; admin: active-in-group-error | 3 | 5 |
| 46 | D-26 | dialog-restore | admin, head-recruiter: default; admin: duplicate-conflict [Q-84] | 3 | 5 |

| Phase | New units | Cumulative units | PNG in `screenshots/phase-N/` |
|---|---|---|---|
| 1 | 38 | 38 | **152** |
| 2 | 82 | 120 | **480** |
| 3 | 102 | 222 | **888** |
| 4 | 51 | 273 | **1 092** |
| 5 | 36 | 309 | **1 236** |
| 6 | 0 (Telegram not designed; «З бота» badge already in phase 2) | 309 | 1 236 |
| 7 | 0 (final set) | 309 | 1 236 |

Checks: SHOT-GAL-01 (gallery ↔ files 1:1, captions in Ukrainian), SHOT-DET-01 (two runs identical), DOM untranslated-text scan (§1), screen a role cannot open is captured only as S-18.

## 10. Newman (API)

| Item | Design |
|---|---|
| Generation | `pnpm api:openapi` → `openapi/openapi.json`; `pnpm api:postman` → `tests/postman/collection.json` (deterministic: generated ids and faker example responses stripped). `scripts/postman-cases.ts` replaces every operation of a folder that has `tests/postman/cases/<tag>.json` with its ordered case clones (role token, params/query/body/header overrides) + optional `tests/postman/tests/<name>.js` assertions. A tested folder must cover all its operations; a case status missing from the OpenAPI responses fails generation. A case that uses `{{var}}` no earlier case in the folder captures (`pm.collectionVariables.set`) fails generation; `origin`/`baseUrl`/`token_*` come from the runner |
| Structure | Folders by OpenAPI tag in lifecycle order (auth/me → users/invites/roles → verticals/priorities → positions → vacancies → candidates/files → applications/transitions → interviews → polygraphs → offers → probation → bonuses/payouts → statistics → archive → search → notifications). Per operation: `happy` (owner role), `authz/<role>` clones (one per seeded role, expected status from the authz expectation file generated from §3.2 route gating), `validation` (bad payload → 400 + field paths), `stale` (transitions → 409 `STALE_STATE`). Built: one ordered case file per tag folder (`cases/<tag>.json`) instead of per-operation `authz/<operationId>.json`, because chained cases (captured ids, cursors, restore) need an explicit order across operations |
| Assertions | Generated per case: status; `Cache-Control: private, no-store`; body JSON schema from OpenAPI (`pm.response.to.have.jsonSchema`, `$ref`s inlined); errors: problem+json, `type` (`urn:hris:problem:<code>`), `status`, `code`, exact key set (`type,status,code,requestId`, plus `errors` for 400, asserted exactly) — denied/missing 404 carry no object data. Scenario scripts add scope checks (VIS-01 exact names), keyset chains, restore checks; chained values are asserted non-empty before capture. A request whose chained value is missing is skipped and **a skip fails the run** (the runner lists unexecuted items). Planned: field rules FLD-01/04/05/07 per role |
| Environments | No environment files: the runner injects `origin` (`http://localhost:3100`) and tokens in memory, so nothing secret lands on disk. Planned: `staging` (Vercel preview: public + 401 checks only until G-10 is resolved) |
| Auth (built) | Password grant stays disabled. `scripts/api-test.ts` signs in the users of `tests/postman/users.ts` through the app's own `POST /auth/confirm` (Supabase admin `generateLink` token) and, for Admin/Finance, `POST /auth/mfa/verify` with the local demo TOTP (`tests/support/demo-auth.ts`, shared with E2E) — the app session row and app-verified aal2 only exist this way. Access tokens are read from the session cookie and passed to Newman in memory as `token_<user>` (+ `token_admin_aal1`/`token_finance_aal1`); never written to disk or printed; sessions are logged out after the run (also on SIGINT/SIGTERM) and every token must then get 401 from `GET /me`, otherwise the run fails. Each run uses 4 of the 30 / 15 min shared local confirm budget |
| Data | Seeded local stack. No business-data changes (only rejected mutations, a same-name/same-version rename no-op, a duplicate-name create → 409, and a display-name change restored in the same folder); each run appends session and audit rows (sign-ins, logouts, profile updates). Order-dependent within a folder only |
| Run | `pnpm test:api` does not build: needs a fresh `pnpm build`, the local Supabase stack and seed. Loads env like `next start` (`@next/env`), refuses non-loopback `SUPABASE_URL`/`DATABASE_URL` or a set `VERCEL_ENV`, warns on a stale `.next`, fails if port 3100 is busy, then starts `next start --port 3100` (`APP_ENV=test`, `APP_URL=http://localhost:3100`), waits for `/api/health`, runs the folders that have cases via the Newman Node API with `cli` + `junit` (`test-results/newman/junit.xml`), exits non-zero on any failure, always stops the server. Covered now: Profile, Verticals, Audit (all 9 operations). Not yet: Auth, Users, Priorities. CI wiring waits for the Supabase CLI stack in Actions |

## 11. Test data

**Seed users (CLAUDE.md §8)**

| User | Roles @ verticals | Used as |
|---|---|---|
| `admin@demo` | ADMIN (global), TOTP local-only | ADM (G) |
| `head.recruiter.gambling@demo` | HEAD_RECRUITER@Гемблінг | HREC (V); assigns recruiters; sourcer in SB fixtures |
| `recruiter1.gambling@demo` | RECRUITER@Гемблінг, assigned V-V | REC (own/asg); owner/sourcer of most fixtures |
| `recruiter2.gambling@demo` | RECRUITER@Гемблінг, assigned V-T, VAC-G-BOT | REC2: "other recruiter" denial; owner in sourcer≠owner cases |
| `recruiter.crypto@demo` | RECRUITER@Крипто, assigned VAC-C-1 | cross-vertical denial |
| `head.hr@demo` | HEAD_HR@Гемблінг + Крипто [assumes Q-43] | HHR (V, V≥P), polygraph review |
| `hr@demo` | HR@Гемблінг + Крипто [assumes Q-43] | HR (V≥P, own HR stats) |
| `vasyl.tl@demo` | TEAM_LEAD@Гемблінг P0 | TL (sub/own) |
| `taras.tl@demo` | TEAM_LEAD@Гемблінг P1 | TLT: "other TL" denial; routing target |
| `tl.crypto@demo` | TEAM_LEAD@Крипто P0 | cross-vertical |
| `finance@demo` | FINANCE (global), TOTP local-only | FIN |
| Phase-1 extras | one expired invite, one deactivated user | S-02, S-01 states |

**Test fixtures (never in the CLAUDE.md §8 demo seed).** Created by `tests/fixtures/` in the integration template DB and in the E2E/Newman global setup (through `/api/v1` as Admin, so they exist only in test databases):

| Fixture | Roles | Used by | Levels |
|---|---|---|---|
| `tl3.gambling@fixture.test` | TEAM_LEAD@Гемблінг, priority 2, vacancy V-3 «Медіабаєр — Facebook» (created 2026-10-10) | RT-03/04/16/17, E2E-04 (exhaustion via three TLs) | unit, integration, E2E |
| `multi.role@fixture.test` | HEAD_RECRUITER@Гемблінг + RECRUITER@Крипто | MR-01..07 | integration, E2E, Newman |
| `admin2@fixture.test` | ADMIN (global), TOTP fixture secret | SB-02..12 | integration, E2E, Newman |
| `tl4.gambling@fixture.test` | TEAM_LEAD@Гемблінг, no priority | RT-24 | unit, integration |
| `tlrec.gambling@fixture.test` | TEAM_LEAD + RECRUITER@Гемблінг | MR-08 | integration |
| `finance.rec@fixture.test` | FINANCE + RECRUITER@Крипто | FIN-09 | integration |
| vertical «Е-комерція» | no seeded user | `V` scope denial for HHR/HR (§3.1) | integration |

**Vacancies:** V-V (Vasyl, «Медіабаєр — Facebook», OPEN, created 2026-10-01, headcount 4, reward 100000 USD set 2026-09-15) · V-T (Taras, same position, OPEN, 2026-10-05, headcount 4, reward 150000 → 100000 USD changed 2026-11-02, locked until 2027-01-02) · VAC-G-FILLED (Vasyl, same position, FILLED, 2026-08-01) · VAC-G-CANC (Taras, same position, CANCELLED, 2026-07-01) · VAC-G-HOLD (Taras, same position, ON_HOLD, 2026-09-01) · VAC-G-REC (recruiter-initiated by REC, no TL) · VAC-G-URG (Vasyl, «Affiliate-менеджер», Urgent) · VAC-G-UO (Taras, «Медіабаєр — TikTok», OPEN, no recruiters) · VAC-G-BOT (Vasyl, TikTok, `TELEGRAM_BOT`) · VAC-G-DEL (soft-deleted) · VAC-C-1 (tl.crypto, «Крипто-аналітик»). Schemes: Гемблінг default S30; global default S100.

**Candidates per stage** (Гемблінг unless noted; owner/sourcer REC unless noted; dates Kyiv)

| Key | Stage / state | Vacancy | Data | Used by |
|---|---|---|---|---|
| C-01 | Talent pool | — | CV PDF | T01, TR-01, E2E-02 |
| C-02 | NEW | V-V | — | T04, T23, TR-04 |
| C-03 | NEW (owner REC2) | V-T | — | REC denial |
| C-04 | IN_WORK | V-V | screening 2026-11-17 11:00 | T05, T24, T25 |
| C-05 | IN_WORK | VAC-G-REC | — | `VACANCY_HAS_NO_TEAM_LEAD` |
| C-06 | SUBMITTED, PENDING | V-V | submitted 2026-11-13 | T06, T07, T23 |
| C-07 | SUBMITTED, ACCEPTED (owner REC2) | V-T | — | T08 |
| C-08 | TL_INTERVIEW future | V-V | 2026-11-18 14:00 | SM-IA, `INTERVIEW_NOT_HELD` |
| C-09 | TL_INTERVIEW, RESCHEDULE_PENDING (REC2) | V-T | 2 slots | D-07, calendar |
| C-10 | TL_INTERVIEW past, no result | V-V | 2026-11-13 15:00 | T09, T10, TL task |
| C-11 | POLYGRAPH UNASSIGNED | V-V | — | T11, T12 |
| C-12 | POLYGRAPH SCHEDULED future (REC2) | V-T | hr@demo, 2026-11-19 10:00 | calendar |
| C-13 | POLYGRAPH attempt 1 SCHEDULED past, no PDF | V-V | 2026-11-13 | T13–T14d, SM-PA, AZ max-visible fixture |
| C-14 | OFFER DRAFT by HR (REC2) | V-T | 4500000 UAH gross/month | T16 |
| C-15 | OFFER SENT | V-V | sent 2026-11-13, valid until 2026-11-18 | T17–T19, T23b |
| C-16 | OFFER ACCEPTED, start 2026-11-23 (REC2) | V-T | tranches PLANNED | T20, BN-49/50 |
| C-17 | OFFER ACCEPTED, start 2026-11-12 unconfirmed | V-V | — | PR-18 |
| C-18 | PROBATION day 12 | V-V | start 2026-11-05 | T21 denial, T22 |
| C-19 | PROBATION day 35 (owner REC2, sourcer REC) | V-T | start 2026-10-13, T1 ELIGIBLE | CLAUDE.md §8, T27 |
| C-20 | PROBATION 14 days left | VAC-G-URG | start 2026-09-02, end 2026-11-30 | reminders |
| C-21 | PROBATION overdue 3 days | V-V | start 2026-08-16, end 2026-11-13 | PR-14 |
| C-22 | PROBATION_PASSED (sourcer HREC) | VAC-G-FILLED | passed 2026-11-02; T1 PAID «2026-10»; T2 ELIGIBLE | BN-46, SB-*, TR-10 |
| C-23 | PROBATION_FAILED day 20 (REC2) | V-T | T2 CANCELLED | archive |
| C-24 | REJECTED by Taras (DIRECT) | V-T | 2026-11-06 | T03, E2E-02 |
| C-25 | Routed Vasyl → Taras: A1 REJECTED routed, A2 SUBMITTED PENDING | V-V → V-T | decline 2026-11-10 | S-09 routed, VIS2-09 |
| C-26 | WITHDRAWN at IN_WORK (REC2) | V-V | — | archive |
| C-27 | Soft-deleted candidate | — | deleted 2026-11-12 with reason | E2E-02, D-26 |
| C-28 | OFFER ACCEPTED, former employee left 2026-03-01 | VAC-G-URG | BLOCKED rehire | BN-29 |
| C-29 | NEW (recruiter.crypto) | VAC-C-1 | — | cross-vertical |
| C-30 | POLYGRAPH SCHEDULED (recruiter.crypto) | VAC-C-1 | hr@demo | HR both verticals |

Hires: V-V 2 (C-18, C-21) + 1 accepted; V-T 2 (C-19, C-23) + 1 accepted (C-16) → both stay OPEN for E2E-01 (headcount 4) [Q-63].

## 12. Spec gaps found while planning

Resolved by the updated architect docs and coordinator (2026-10-31): G-02 (transfer permission, polygraph attempt model, D4 flag and `VERTICAL_READ_ONLY` removed, `vacancy.self_assign` confirmed), G-07 (ADR-002 route gating: no grant on the route's base permission → 404; visible but not permitted → 403, as encoded in §3.1), G-14 (Q-24 adopted), G-16 (fixture-only E2E users, §11).

| # | Gap | Owner of fix |
|---|---|---|
| G-01 | Finance outside Statistics: QA brief says "every other route → 404", screens.md and story UI-04-1 say section routes redirect to `/statistics`, objects 404. FIN-01 follows the stories | BA / owner |
| G-03 | Transfer (authz ⁹): the four defaults are ⚠ OWNER; open item: does the actor also need a role in the **target** vertical? (TR-02 encodes "source only") | owner |
| G-04 | Polygraph review: can Head HR confirm a result they recorded themselves (no actor ≠ recorder rule in T14)? Retake count unlimited is ⚠ OWNER | owner |
| G-05 | Boundaries not specified: 180-day cooldown at exactly 180 days; `min_days_for_tranche1` "within N" (< or ≤); rehire "within 12 months" at exactly 12 months | BA |
| G-06 | Day counting conflict: state machine `planned_end = start + days` vs Q-58 `start + N − 1`; UX copy D-15 «Доступно з 29.11.2026 (30 днів від початку)» and F-7 «з 30-го дня» vs Q-58 «з дня 31»; is the end date itself overdue or the last day; minimum probation 1 (state machine) vs 30 (Q-50) | BA + ux-ui-designer |
| G-08 | Guards still without error codes: T06/T07 decision already made, T11 assignee without HR role, T15 `probationDays` > vacancy, T20 date before acceptance, T27 invalid new owner, T28 all tranches paid, MARK_NO_SHOW before the interview, fail after end date (Q-59); `VACANCY_NOT_OPEN` on T05 still ⚠; permission code for `TL_CONFIRM_COUNTER`; recipients of `probation.first_day_unconfirmed` | architect |
| G-09 | BONUS-16 "clear to null" has no open question (not in Q-106..Q-113) | BA |
| G-10 | Newman on staging: password grant is local/CI only (ADR-006), so no way to get role tokens on staging | security + devops |
| G-11 | E2E time travel needs a controllable server clock in the test build (FixedClock exists, no mechanism to advance it across requests); must be absent from production builds like dev login | architect + security |
| G-12 | App emails (Resend) in E2E/Newman: no capture transport defined (auth emails use Inbucket) | devops |
| G-13 | `T02` behaviour when auto-routing is OFF (ROUTE-09 covers only the "next" TL) | BA |
| G-15 | `docs/ux/screens.md` §4 still lists D-01..D-23 only; the designer brief (D-10a, D-24..D-30) is the source used here | ux-ui-designer |
| G-17 | Authz ⁸: CV files contain contacts, but TL has `candidate.file.read`, so FLD-01 can be bypassed through the CV; flagged to the owner | owner |
