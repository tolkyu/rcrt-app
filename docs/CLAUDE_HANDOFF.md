# Handoff — current state only

> **Rule:** this file holds only the latest checkpoint (≤ ~60 lines). On every checkpoint, move the old content to the top of `docs/archive/handoff-log.md` (newest first), then rewrite this file. Never append history here. Read the archive only when you need an old detail.

## Checkpoint — 2026-11-17 evening (Claude)

- Branch `phase-2`, HEAD `c955138`, pushed. Owner approved pushes; work continues without waiting for the owner.
- Done: S3.5 + S3.6 reviewed (code APPROVED x3, security PASS), BUG-S3-14 fixed, D123/D124/D125 recorded, lean gallery captures (`c955138`), rich-text fragment fix `6cd0276`.
- New skills (`.claude/skills/`): deslop, no-comments, thermo-nuclear (QA), blast-radius (reviewer), benchmark-checklist (perf), tdd, typescript-best-practices, make-pr-easy-to-review, babysit, fix-ci, fix-merge-conflicts. Wired into `docs/engineering-self-check.md` and agent files.
- In progress: senior-fullstack-engineer S3.7 quality slice (thermo findings + BUG-S3-20, see `docs/qa-phase-2-s3.md`).

## Next (in order)

1. S3.7: QA (thermo pass) → code-reviewer (blast radius) → commit, push. Then mark S3.6/S3.7 done in PROGRESS.
2. Split `docs/PROGRESS.md` history into `docs/archive/` (owner asked for token economy).
3. F10 rich text (`docs/ux/ui-foundation.md`). Perf: create 178.19 / edit 178.39 of 180 kB.
4. Phase 7: remind owner about demo videos.

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
