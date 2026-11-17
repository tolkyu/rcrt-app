# Handoff — current state only

> **Rule:** this file holds only the latest checkpoint (≤ ~60 lines). On every checkpoint, move the old content to the top of `docs/archive/handoff-log.md` (newest first), then rewrite this file. Never append history here. Read the archive only when you need an old detail.

## Checkpoint — 2026-11-17 evening (Claude)

- Branch `phase-2`, HEAD `b48910d`, pushed. Owner approved pushes; work continues without waiting for the owner.
- Done: S3.5 + S3.6 reviewed (code APPROVED x3, security PASS), BUG-S3-14 fixed, D123/D124/D125 recorded, lean gallery captures (`c955138`), rich-text fragment fix `6cd0276`.
- New skills (`.claude/skills/`): deslop, no-comments, thermo-nuclear (QA), blast-radius (reviewer), benchmark-checklist (perf), tdd, typescript-best-practices, make-pr-easy-to-review, babysit, fix-ci, fix-merge-conflicts. Wired into `docs/engineering-self-check.md` and agent files.
- **S3.7 closed (D126):** part 1 `b48910d` (items 7, 8, BUG-S3-20), part 2 (items 1, 6: pure `planAttempt`/`settle` in `lib/vacancy-draft-retry.ts`). Both code-reviewer APPROVED. Rest of thermo items → Phase 7 tech debt (PROGRESS «Gaps»).
- **D126 (owner, 2026-11-17):** one review round per slice; only bugs/security/authz/PII/PRD mismatch block; screenshots once per V-block.

## Next (in order) — 2026-11-17 late, parallel run

1. VAC-03-3 code committed `3a1b504` (pushed). QA agent finishes concurrency + E2E in main tree (uncommitted: `tests/e2e/vacancy-request.spec.ts`, `tests/integration/vacancies-request-concurrency.test.ts`, `tests/support/vacancy-request-db.ts`, `zz-measure.spec.ts` temp, `package.json`/`playwright.config.ts`) → commit `test(vacancies): …`.
2. **Worktrees (manual; tool isolation fails on d:/D: case):** `D:/recruiting-wt/urgency-api` branch `vac-08-2-api` (ADR-016 slice 1 server) and `D:/recruiting-wt/urgency-ui` branch `vac-04-4-highlight` (slice 3 highlight). Agents commit there, no push. Merge into `phase-2` (api first; ui touches `vacancy-badges.tsx` styling only), then code-review + security (api), remove worktrees.
3. Next ADR-016 slices: 2 (client control), 4 (list filter), 5 (E2E, Postman, PNGs, perf + security). BA expands V3 stories (VAC-03-1, 03-2, 02-1, UI-09-1).
4. Perf: create 179.76 / edit 179.96 of 180 kB — perf-engineer before more UI on those routes.
5. Phase 7: remind owner about demo videos.

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
