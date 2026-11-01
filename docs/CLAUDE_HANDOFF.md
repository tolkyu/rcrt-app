# Handoff — where to resume (kept current by the orchestrator)

> Read order: `CLAUDE.md` → this file → `docs/PROGRESS.md` → `docs/PRD.md` §14 (owner decisions D1–D70).
> Rule: after every green task the orchestrator commits and updates this file. On "стоп" / ~95 % usage: commit current state, update this file, stop.

## State — 2026-11-01 (evening)

- **Working mode (owner):** one small slice end-to-end → commit → report → wait for «далі».
- **Latest checkpoint — Codex, T6 slice 2:** resumed Claude's uncommitted «Журнал дій». Admin aal2-only list/detail, URL filters (actor/action/entity/result + Kyiv presets/custom dates), before/after sheet, vertical history links, OpenAPI/Postman and migration `0006_audit_viewer_indexes`. Code review approved; security found no blocking findings. Full T6/Phase 1 remain in progress.
- **Verified on this checkpoint:** lint, clean production build (includes TypeScript), 1,860 unit/integration tests; full E2E 50 passed + 6 existing intentional mobile-vertical skips (all 10 audit cases passed); screenshot suite 24/24 passed, galleries contain 28 images each with no missing files. Audit screenshots: `screenshots/phase-1/06-admin-audit-{list|detail}-{desktop|mobile}-{light|dark}.png`; gallery `screenshots/phase-1/index.html` (+ `screenshots/latest/index.html`). QA visually checked desktop/mobile and both themes. OpenAPI/Postman generation passed; Newman runner still belongs to T7.
- **Perf gate is RED, not complete:** actual initial JavaScript including ancestor layouts: shell 188.02 kB, audit 206.06, verticals 194.66, profile 195.30, settings 190.90 (180 kB cap). Split static schema/constants, guarded indexed UUID joins, bounded retained pages, optimized Radix imports and lazy vertical dialog; further shared-shell optimization is the next small task. Details: `docs/perf/report-phase-1-settings-audit.md`. Next CLI route numbers omit some parent-layout chunks; do not use them as proof of PERF-04.
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

1. **Next small slice:** optimize shared-shell initial JavaScript to get the 180 kB gate green; keep actual ancestor-layout measurements. Then **T6** «Користувачі та ролі» list → invite dialog → user drawer actions → TL priorities, followed by audit polish. Settings per `docs/ux/wireframes/settings-admin.md` (resend/revoke/re-invite D70, invited-user email change D69, roles × verticals, deactivation + SEC-AUTH-R04). Settings nav and Admin landing are already built. Team defaults for wireframe gaps U2/U3/U5/U6/L1–L3.
2. **T7** QA: full phase-1 E2E, Newman, screenshots → `screenshots/phase-1/` + `index.html` + `screenshots/latest/`.
3. **T8** perf gates for phase-1 screens.
4. **T9** carry-overs: CI Supabase job, CI SHA pins, `pnpm audit`, Drizzle drift, `format:check`, secret grep, DG-03 storage test, hosted Supabase config drift (A04, B06, C06, D03, H04, I03, R03), SEC-CORE-13/14.
5. Phase-1 report to owner, wait for "go phase 2".

## Environment notes (Windows)

- pnpm via `corepack pnpm …`; Docker Desktop must be running (`supabase start` stack + `docker compose -f docker-compose.test.yml` test DB on PG 17.11).
- Never print `.env` or full `supabase status`. Seed/test tooling refuses non-local / non-demo databases.
- Codex is the owner's fallback when Claude is rate-limited: on return, verify its work (tests), commit a checkpoint, send through code-reviewer. `AGENTS.md`/`.codex` only point to `CLAUDE.md`.
