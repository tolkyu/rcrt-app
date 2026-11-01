# Handoff — where to resume (kept current by the orchestrator)

> Read order: `CLAUDE.md` → this file → `docs/PROGRESS.md` → `docs/PRD.md` §14 (owner decisions D1–D67).
> Rule: after every green task the orchestrator commits and updates this file. On "стоп" / ~95 % usage: commit current state, update this file, stop.

## State — 2026-11-01

- Branch `phase-1` (not pushed; remote `origin` = github.com/tolkyu/rcrt-app). Working tree clean after:
  - `da6733b` T3 security fixes (SEC-CORE-01..10, D65–D67)
  - `10ca37b` T4 auth (magic link, Google, invites, TOTP, sessions, dev-login; SEC-AUTH-C01..C06 resolved, C05 concurrent regression added + mutation-checked)
  - `838e20f` T5 shell (tokens, role nav, profile, states)
- Verified green on this tree: lint, typecheck, 1522 unit, 98 integration (PG 17.11), build (103 kB shared JS), 22 E2E desktop+mobile.
- **Running:** code-reviewer on the three commits; security-engineer re-check of T4 (writes "Re-check 2026-11-01" in `docs/security/review-phase-1-auth-completion.md`).

## Next steps (in order)

1. Fix all Blocking findings from code-reviewer / security re-check; commit `fix(...)`.
2. **T6** Settings (users & invites UI on `createInvite`, roles × verticals, verticals create/rename, TL priorities, audit viewer) in the designer look.
3. **T7** QA: full phase-1 E2E, Newman (`test:api`), screenshot suite → `screenshots/phase-1/` + `index.html` + `screenshots/latest/` (fixed clock `lib/fixed-clock.ts`).
4. **T8** perf: `perf:check` gates for phase-1 screens (perf seed waits for Phase 2 tables).
5. **T9** carry-overs: CI SHA pins, `pnpm audit`, Drizzle drift check, `format:check`, static secret grep, DG-03 storage test, hosted GoTrue MFA-verify limits (C05 residual).
6. Phase-1 report to owner (Ukrainian): gallery path, demo script, open questions (Q-151, Q-152), then wait for "go phase 2". Push `phase-1` only after verify.

## Environment notes (Windows)

- pnpm via `corepack pnpm …`; Docker Desktop must be running (`supabase start` stack + `docker compose -f docker-compose.test.yml` test DB on PG 17.11).
- Never print `.env` or full `supabase status`. Seed/test tooling refuses non-local / non-demo databases.
- Codex is the owner's fallback when Claude is rate-limited: on return, verify its work (tests), commit a checkpoint, send through code-reviewer. `AGENTS.md`/`.codex` only point to `CLAUDE.md`.
