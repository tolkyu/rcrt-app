# Handoff — where to resume (kept current by the orchestrator)

> Read order: `CLAUDE.md` → this file → `docs/PROGRESS.md` → `docs/PRD.md` §14 (owner decisions D1–D67).
> Rule: after every green task the orchestrator commits and updates this file. On "стоп" / ~95 % usage: commit current state, update this file, stop.

## State — 2026-10-31 evening

- Branch `phase-1` (not pushed yet; remote `origin` = github.com/tolkyu/rcrt-app). Last commit: `e6be251` (T3 server core).
- **Committed & green:** T1 foundation, T2 schema (+ review fixes, PostgreSQL 17), T3 server core, UX design system from designer mockups (`docs/ux/reference/*.webp`).
- **Uncommitted, in progress (working tree):**
  - **T3 fixes** — security findings SEC-CORE-01…09 (`docs/security/review-phase-1-core.md`) as amended by owner decisions D65–D67: recruiters can't delete candidates; clearing bonus flags Admin-only; TL vacancy rights = current `team_lead_id` only.
  - **T4 auth** — Codex slice (JWT verifier, rate limiter, public-auth wrapper, magic-link service) + completion per `docs/security/t4-auth-requirements.md` (magic link on real Supabase, confirm page, Google = invite email, invite acceptance, TOTP Admin/Finance with second factor + admin reset (D22/D63), 12 h idle / 7 d absolute sessions in-app, logout/revoke, login history, dev-login dev-only, @demo auth seed). Known: SEC-T4-01 token_hash length, SEC-T4-02 timing, SEC-T4-03 missing env var.
  - **T5 shell** — tokens from `docs/ux/design-system.md`, Inter, theme cookie, sidebar/top bar/mobile bottom nav by permission codes, profile page, states.

## Next steps (in order)

1. Make the working tree green: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm test:integration && corepack pnpm build && corepack pnpm test:e2e`.
2. Commit T3 fixes, T4, T5 as separate commits (conventional, PRD IDs).
3. code-reviewer on T3 fixes + T4 + T5; security-engineer re-check T4 against the checklist.
4. **T6** Settings (users & invites UI on `createInvite`, roles × verticals, verticals create/rename, TL priorities, audit viewer) in the designer look.
5. **T7** QA: full phase-1 E2E, Newman (`test:api`), screenshot suite → `screenshots/phase-1/` + `index.html` + `screenshots/latest/` (fixed clock `lib/fixed-clock.ts`).
6. **T8** perf: `db:seed:perf` (phase-1 tables), `perf:check` gates.
7. **T9** carry-overs: CI SHA pins, `pnpm audit`, Drizzle drift check, `format:check`, static secret grep, DG-03 storage test.
8. Phase-1 report to owner (Ukrainian): gallery path, demo script, open questions (Q-151, Q-152), then wait for "go phase 2". Push `phase-1` only after verify.

## Environment notes (Windows)

- pnpm via `corepack pnpm …`; Docker Desktop must be running (`supabase start` stack + `docker compose -f docker-compose.test.yml` test DB on PG 17.11).
- Never print `.env` or full `supabase status`. Seed/test tooling refuses non-local / non-demo databases.
- Codex is the owner's fallback when Claude is rate-limited: on return, verify its work (tests), commit a checkpoint, send through code-reviewer. `AGENTS.md`/`.codex` only point to `CLAUDE.md`.
