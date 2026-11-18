# Handoff — current state only

> **Rule:** this file holds only the latest checkpoint (≤ ~60 lines). On every checkpoint, move the old content to the top of `docs/archive/handoff-log.md` (newest first), then rewrite this file. Never append history here. Read the archive only when you need an old detail.

## Checkpoint — 2026-11-18 midday (Claude)

- `phase-2` local HEAD has slice 7 merged (share tests, `24cd363`) + docs; pushed up to `c64c941`. Merged + pushed: urgency filter (slice 4 of V2), V3 slice 1 foundation (code APPROVED, security CONDITIONAL → S1-1 fixed).
- ADR-017 has an **Errata** table (E1–E6) from security pre-review `docs/security/v3-adr-017-prereview.md` — binding for slices 2–4.
- V3 slice 4 (Team Lead API) `v3-teamlead` @71f8499: code APPROVED; security review running (with slice 3).
- V3 slice 3 (status API) `v3-status` @da50f0a: code review + security running.
- V3 slice 2 (assignment API) `v3-assign`: engineer still building.
- Integration DB shared by agents: lock = `mkdir D:/recruiting-wt/.integration.lock`, `rmdir` after. Orchestrator also takes it for `pnpm test` (includes integration).

## Next (in order)

1. After security PASS: merge slices 3, 4 (then 2) into `phase-2`, full `pnpm test` under lock, push; remove worktrees.
2. Slice 5 (UI «Команда» + share fix `useShareLink`/`ClipboardFallbackAlert`, see PROGRESS share follow-ups) → slice 6 (status menu). Card route has room (158 kB); edit/new at 178.8/178.6 of 180.
3. Slice 8: E2E, OpenAPI/Postman, Newman, V2+V3 gallery (PNG 47 share already captured), audit labels, S1-5 unit cases, story copy fixes, UX review.
4. Owner report: UX §14 defaults applied; A5 daily claim cap question; HR share AC vs D46.
5. Phase 7: demo videos reminder; tech debt in PROGRESS.

## Open, not blocking

- Owner's real-phone check of the sticky footer + toast.
- 10 Phase-1 PNGs (+ latest copies) modified in tree without UI change — keep out of commits; determinism triage later.
- E2E: running desktop + mobile projects in parallel hits 429 (30 writes/min, sign-in window). Run per project.

## Run notes (Windows)

- `corepack pnpm …` (pnpm not on PATH). Vitest only from PowerShell (Git Bash: "failed to find the current suite").
- Docker Desktop → `npx supabase start`; `corepack pnpm test:db:up` for integration; never two integration or Playwright runs at once.
- `corepack pnpm build` before E2E. First E2E of the day without `--no-deps`; repeats may use `--no-deps`.
- Contracts: `corepack pnpm api:openapi`, then `corepack pnpm exec tsx scripts/postman.ts`.
- Corrupt `.next` (`reading 'length'`) → delete `.next`, rebuild.
- Never print `.env` or full `supabase status`. Local DB rate-limit rows: never delete.
- Codex fallback: on return verify its work, commit, code-review. `AGENTS.md`/`.codex` only point to `CLAUDE.md`.
