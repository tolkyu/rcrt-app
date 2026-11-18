# Handoff — current state only

> **Rule:** this file holds only the latest checkpoint (≤ ~60 lines). On every checkpoint, move the old content to the top of `docs/archive/handoff-log.md` (newest first), then rewrite this file. Never append history here. Read the archive only when you need an old detail.

## Checkpoint — 2026-11-17 evening (Claude)

- Branch `phase-2`, HEAD `b48910d`, pushed. Owner approved pushes; work continues without waiting for the owner.
- Done: S3.5 + S3.6 reviewed (code APPROVED x3, security PASS), BUG-S3-14 fixed, D123/D124/D125 recorded, lean gallery captures (`c955138`), rich-text fragment fix `6cd0276`.
- New skills (`.claude/skills/`): deslop, no-comments, thermo-nuclear (QA), blast-radius (reviewer), benchmark-checklist (perf), tdd, typescript-best-practices, make-pr-easy-to-review, babysit, fix-ci, fix-merge-conflicts. Wired into `docs/engineering-self-check.md` and agent files.
- **S3.7 closed (D126):** part 1 `b48910d` (items 7, 8, BUG-S3-20), part 2 (items 1, 6: pure `planAttempt`/`settle` in `lib/vacancy-draft-retry.ts`). Both code-reviewer APPROVED. Rest of thermo items → Phase 7 tech debt (PROGRESS «Gaps»).
- **D126 (owner, 2026-11-17):** one review round per slice; only bugs/security/authz/PII/PRD mismatch block; screenshots once per V-block.

## Next (in order) — 2026-11-17 late, wave 2

1. Done + pushed: VAC-03-3 (`3a1b504`, `95672ac`); urgency API slice 1 + highlight slice 3 merged `7d46438` (highlight code-review APPROVED).
2. Running: security + code-review of urgency API (377c50c); slice 2 client control in `D:/recruiting-wt/urgency-client` (branch `vac-08-2-client`); slice 4 list filter in `D:/recruiting-wt/urgency-filter` (`vac-04-4-filter`); QA fixes flaky unit `waitFor` timeouts in main tree (uncommitted).
3. Then merge slices 2+4 (uk.json may conflict trivially), review, slice 5 (E2E, Postman success/stale/locked, V2 gallery PNGs, perf + UX gallery review), remove worktrees. Worktrees are manual (tool isolation fails on d:/D: case).
4. Owner questions open: Q-190..Q-194 (V3 defaults apply). Then V3 design (architect + UX) and build.
5. Tech debt (Phase 7): private cancelled urgent draft shows only Lock note; record dark-hover 2.94:1 in UX contrast table; `change_feed` row for urgency not emitted (no consumer).
6. Phase 7: remind owner about demo videos.

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
