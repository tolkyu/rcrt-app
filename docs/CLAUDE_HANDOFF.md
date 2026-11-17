# Handoff — current state only

> **Rule:** this file holds only the latest checkpoint (≤ ~60 lines). On every checkpoint, move the old content to the top of `docs/archive/handoff-log.md` (newest first), then rewrite this file. Never append history here. Read the archive only when you need an old detail.

## Checkpoint — 2026-11-17 (Claude)

- Branch `phase-2`, pushed to `origin`. Owner approved pushes (2026-11-17): push every green checkpoint.
- Done today: S3.5 re-review APPROVED; BUG-S3-14 fixed `ddafec9` (Toaster without `React.lazy`); S3.6 polish + D123 (author sees cancel reason on own cancelled draft card) + D124 (footer «Вийти без збереження») `ebf00ae`; reviews `docs/review-phase-2-s3-6.md` APPROVED, `docs/security/review-phase-2-s3-6.md` PASS; deslop skill added `362573b`.
- In progress: senior-fullstack-engineer follow-up slice (10 non-blocking items in `docs/review-phase-2-s3-6.md` + security L1/L2 + deslop).

## Next (in order)

1. Commit the follow-up slice after a short re-review.
2. QA: missing §10 captures from `docs/ux/review-phase-2-s3.md` («Independent UX verdict» list), incl. 320 px / 200 %. Then close S3.6.
3. F10 rich text (`docs/ux/ui-foundation.md`). Perf headroom: create 178.18 / edit 178.38 of 180 kB.
4. Phase 7: remind the owner about full-cycle demo videos (`docs/PROGRESS.md` gaps).

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
