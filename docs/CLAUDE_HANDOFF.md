# Handoff — where to resume (kept current by the orchestrator)

> Read order: `CLAUDE.md` → this file → `docs/PROGRESS.md` → `docs/PRD.md` §14 (owner decisions D1–D67).
> Rule: after every green task the orchestrator commits and updates this file. On "стоп" / ~95 % usage: commit current state, update this file, stop.

## State — 2026-11-01 (evening)

- **Working mode (owner):** one small slice end-to-end → commit → report → wait for «далі».
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

1. **T6** (next slices: «Журнал дій» viewer → «Користувачі та ролі» list → invite dialog → user drawer actions → TL priorities). Settings per `docs/ux/wireframes/settings-admin.md` (users & invites incl. resend/revoke/re-invite D70, email change for invited users D69, roles × verticals, deactivation + SEC-AUTH-R04, verticals, TL priorities, audit viewer); re-add Налаштування nav + Admin landing rank. Team defaults for wireframe gaps U2/U3/U5/U6/L1–L3.
2. **T7** QA: full phase-1 E2E, Newman, screenshots → `screenshots/phase-1/` + `index.html` + `screenshots/latest/`.
3. **T8** perf gates for phase-1 screens.
4. **T9** carry-overs: CI Supabase job, CI SHA pins, `pnpm audit`, Drizzle drift, `format:check`, secret grep, DG-03 storage test, hosted Supabase config drift (A04, B06, C06, D03, H04, I03, R03), SEC-CORE-13/14.
5. Phase-1 report to owner, wait for "go phase 2".

## Environment notes (Windows)

- pnpm via `corepack pnpm …`; Docker Desktop must be running (`supabase start` stack + `docker compose -f docker-compose.test.yml` test DB on PG 17.11).
- Never print `.env` or full `supabase status`. Seed/test tooling refuses non-local / non-demo databases.
- Codex is the owner's fallback when Claude is rate-limited: on return, verify its work (tests), commit a checkpoint, send through code-reviewer. `AGENTS.md`/`.codex` only point to `CLAUDE.md`.
