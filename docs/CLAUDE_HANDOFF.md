# Handoff — where to resume (kept current by the orchestrator)

> Read order: `CLAUDE.md` → this file → `docs/PROGRESS.md` → `docs/PRD.md` §14 (owner decisions D1–D70).
> Rule: after every green task the orchestrator commits and updates this file. On "стоп" / ~95 % usage: commit current state, update this file, stop.

## State — 2026-11-01 (evening)

- **Working mode (owner):** one small slice end-to-end → commit → report → wait for «далі».
- **T6 slice 3 done — «Користувачі та ролі» list** (`/settings/users`, `GET /api/v1/users`): search + single-select filters in the URL (API accepts multi), derived status (deactivated > activated > pending invite valid/expired > revoked), roles via shared `sortRoles`/`useRoleLabel`, 2FA from view `app.auth_mfa_totp` (migration `0007`, also `app_user_list_idx` uk-collation keyset), id-only cursor, total only on the first page. Admin now lands on Users. Vertical «Користувачі» count = status «Активний» only (invitees excluded) and links to `/settings/users?status=ACTIVE&vertical=…`. Seed: expired invitee now has its RECRUITER · Гемблінг role (run `pnpm db:seed`). Verified: lint, typecheck, 1874 vitest, E2E 72 + 2 skips, perf users 175.5 kB / audit 179.07 kB. Screenshots `08-admin-users-list-*` (sign-in times rewritten to fixed values in the spec).
- **PERF-04 initial-JS gate GREEN** (`e251de6` + review fixes `5be02ea`): deferred shell menus, in-house rail tooltip, Intl Kyiv dates. Shell 166.2 kB, audit 178.95 (1 kB headroom — watch it), all routes pass `perf:size`. Report: `docs/perf/report-phase-1-deferred-menus.md`. Local demo DB was reset on owner request; statistics-tabs mockups stored in `docs/ux/reference/statistics/` (Phase 4 input).
- Screenshot `06-admin-audit-detail-desktop-dark.png` changes every E2E run (real timestamps of the test's own rename) → T7: freeze or mask dynamic values; until then `git checkout -- screenshots` after E2E.
- **Claude verified Codex's `a92f0fc` + `1030ba0`** (lint, typecheck, 1711 unit, 149 integration, build) and fixed E2E infra in the following commit: `e2e-sessions` setup signs each demo user in once (`.playwright-auth/`, gitignored); `settings-*` specs run last in `e2e-admin-desktop` → `e2e-admin-mobile` (workers 1). Full E2E 58/58, screenshots unchanged. Each full run uses ~8 sign-ins of the 30 / 15 min per-IP limit — wait for the next window on 429.
- **Latest checkpoint — Codex, small T8 import optimization:** added `@tanstack/react-query` to the existing Next.js import optimization list. The original shell/menu implementation is retained. Performance engineer investigated and implemented; QA added keyboard/focus navigation tests and tablet/mobile screenshots; code reviewer approved. No dependency, permission or data changes.
- **Verified on latest checkpoint:** clean production build (includes lint/TypeScript), 1,860 unit/integration tests; full E2E 52 passed + 6 existing mobile-vertical skips; screenshot suite 24/24. Added 4 navigation PNGs (`07-admin-navigation-open-{tablet|mobile}-{light|dark}.png`); galleries `screenshots/phase-1/index.html` and `screenshots/latest/index.html` contain 32 images each with no missing files. QA visually inspected tablet/mobile in both themes. Independent code review approved.
- **Previous checkpoint `a92f0fc` — T6 slice 2:** Admin aal2-only audit list/detail, URL filters, before/after sheet, vertical history links, OpenAPI/Postman and migration `0006`. Reviewed; 50 E2E passed + 6 existing mobile-vertical skips; screenshot suite 24/24, 28 gallery images per directory. Full T6/Phase 1 remain in progress; Newman runner belongs to T7.
- (Superseded — gate now green) Perf gate was RED: actual initial JavaScript including ancestor layouts: shell 186.72 kB, audit 205.05, verticals 193.31, profile 194.28, settings 189.60 (180 kB cap). Shell was 188.02 before this slice. Latest measurements: `docs/perf/report-phase-1-query-imports.md`; earlier audit analysis: `docs/perf/report-phase-1-settings-audit.md`. Next CLI route numbers omit some parent-layout chunks; do not use them as proof of PERF-04.
- **Audit scope still pending:** searchable all-user/system actor picker (current picker uses retained rows), security preset/multi-action selection, backward page-window navigation/full virtualization (current window ≤100; loading older evicts newer), custom-date draft sync when Back restores a different custom period. Explicit API date ranges are capped at 366 days; absent boundaries remain uncapped with bounded output. Retention jobs remain later work.
- **T6 slice 1 done** `b7520c6`: `/settings` frame + «Вертикалі» (list, create, rename), Admin lands on Налаштування. Verified: lint, typecheck, 1680 unit, 142 integration, build, 37 E2E.
- Notes from slice 1: protected pages under `(app)` return a soft 404 (status 200 + «Сторінку не знайдено») because `(app)/loading.tsx` streams; APIs return real 404. Flaky under full-suite load: `tests/unit/auth/supabase-identity.test.ts` «bounds a hanging JWKS request» (passes alone) → T9.

- Branch `phase-1` pushed to `origin`. T1–T5 done and reviewed; settings wireframes `docs/ux/wireframes/settings-admin.md`; owner decisions D69/D70 (Q-153/154).
- Verified on `bb620e8`: lint, typecheck, 1674 unit, 132 integration, build (103 kB shared JS), 34 E2E (incl. signed-in shell specs on local Supabase).
- Known leftovers:
  - **CI:** signed-in `tests/e2e/shell.spec.ts` needs Supabase Auth; CI has placeholder keys → add `supabase start` + migrate + seed to the CI job (devops, T9) — CI red until then.
  - Local Supabase still runs `max_enrolled_factors = 10` until `supabase stop && supabase start`.
  - Event `subjectType` mixed: profile writes `'user'`, invite/MFA `'app_user'` — unify in T6.
  - Bug (Minor): server 400 field error on profile name form lost (form remounts via `key` on optimistic update) — fix with a test.
  - E2E sign-in helper: same-user sign-ins must not run in parallel; `/auth/confirm` 30/15 min per IP.
  - `@axe-core/playwright` not installed (needs approval as new dev dependency).

## Next steps (in order)

1. **Next small slice: T6** «Користувачі та ролі» invite dialog (list done) → user drawer actions → TL priorities, followed by audit polish. Settings per `docs/ux/wireframes/settings-admin.md` (resend/revoke/re-invite D70, invited-user email change D69, roles × verticals, deactivation + SEC-AUTH-R04). Settings nav and Admin landing are already built. Team defaults for wireframe gaps U2/U3/U5/U6/L1–L3.
2. **T7** QA: full phase-1 E2E, Newman, screenshots → `screenshots/phase-1/` + `index.html` + `screenshots/latest/`.
3. **T8** perf gates for phase-1 screens.
4. **T9** carry-overs: CI Supabase job, CI SHA pins, `pnpm audit`, Drizzle drift, `format:check`, secret grep, DG-03 storage test, hosted Supabase config drift (A04, B06, C06, D03, H04, I03, R03), SEC-CORE-13/14.
5. Phase-1 report to owner, wait for "go phase 2".

## Environment notes (Windows)

- pnpm via `corepack pnpm …`; Docker Desktop must be running (`supabase start` stack + `docker compose -f docker-compose.test.yml` test DB on PG 17.11).
- Never print `.env` or full `supabase status`. Seed/test tooling refuses non-local / non-demo databases.
- Codex is the owner's fallback when Claude is rate-limited: on return, verify its work (tests), commit a checkpoint, send through code-reviewer. `AGENTS.md`/`.codex` only point to `CLAUDE.md`.
