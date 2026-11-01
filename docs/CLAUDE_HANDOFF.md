# Handoff — where to resume (kept current by the orchestrator)

> Read order: `CLAUDE.md` → this file → `docs/PROGRESS.md` → `docs/PRD.md` §14 (owner decisions D1–D67).
> Rule: after every green task the orchestrator commits and updates this file. On "стоп" / ~95 % usage: commit current state, update this file, stop.

## State — 2026-11-01 (afternoon)

- Branch `phase-1`, not pushed. Commits today: `da6733b` T3 fixes · `10ca37b` T4 · `838e20f` T5 · `024bdd9` T5 review fixes · `18e0447` SEC-AUTH-R01 open redirect · `ac02925` settings wireframes (`docs/ux/wireframes/settings-admin.md`) · `0988746` Q-153/Q-154.
- Reviews: code-reviewer approved T3; T4/T5 changes requested (CR-P1-01…21). Security re-check: T4 acceptable for Phase 1 with conditions (R02 before hosted data; T6 items with tests; T9 hosted-config drift check).
- **Running (uncommitted when interrupted):**
  - senior-fullstack-engineer — T4 batch: CR-P1-01/02/04/05/07–13, SEC-AUTH-R02 (`user_session.mfa_verified_at`), R03, R05, audit entity type, HR role label.
  - qa-engineer — T5 tests (CR-P1-16): nav/roles/vertical-filter/api-client unit, PATCH /me integration, shell E2E.
- Owner questions pending: Q-153 (email change), Q-154 (re-invite after revoke). Team defaults for wireframe gaps U2/U3/U5/U6/L1–L3 decided in T6.

## Next steps (in order)

1. Verify + commit the two running batches; send T4 batch back to code-reviewer.
2. **T6** Settings per `docs/ux/wireframes/settings-admin.md` (users & invites, roles × verticals, verticals, TL priorities, audit viewer); re-add Налаштування nav + Admin landing rank; SEC-AUTH-R04 with deactivation.
3. **T7** QA: full phase-1 E2E, Newman, screenshots → `screenshots/phase-1/` + `index.html` + `screenshots/latest/`.
4. **T8** perf gates for phase-1 screens.
5. **T9** carry-overs: CI SHA pins, `pnpm audit`, Drizzle drift, `format:check`, secret grep, DG-03 storage test, hosted Supabase config drift (A04, B06, C06, D03, H04, I03, R03).
6. Phase-1 report to owner, wait for "go phase 2". Push only after verify.

## Environment notes (Windows)

- pnpm via `corepack pnpm …`; Docker Desktop must be running (`supabase start` stack + `docker compose -f docker-compose.test.yml` test DB on PG 17.11).
- Never print `.env` or full `supabase status`. Seed/test tooling refuses non-local / non-demo databases.
- Codex is the owner's fallback when Claude is rate-limited: on return, verify its work (tests), commit a checkpoint, send through code-reviewer. `AGENTS.md`/`.codex` only point to `CLAUDE.md`.
