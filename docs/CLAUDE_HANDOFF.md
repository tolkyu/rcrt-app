# Handoff — current state only

> **Rule:** latest checkpoint only (≤ ~60 lines). Move the old checkpoint to the top of `docs/archive/handoff-log.md` before rewriting.

## Session start (owner rule, 2026-11-23)

GitHub is the source of truth. Every session ends with all work pushed. Every new session starts with `git fetch`, then reads branch `phase-2`, PR #1, its CI and this file on the remote. Compare them with the local checkout before work.

## Checkpoint — 2026-11-24 (Claude, vacancy content batch committed)

- **State:** the whole vacancy content batch is committed on `phase-2` and pushed. Check PR #1 (`phase-2` → `main`) on GitHub: if hosted CI on the latest head is green and the PR is not merged yet, merge it with a **true merge commit** (`gh pr merge 1 --merge`), never squash or rebase, because `.gitleaksignore` pins commit SHAs. Then confirm CI on `main` and delete `origin/wip/content-ui-2026-11-23`.
- **What the batch contains:** see the top section of `docs/PROGRESS.md` ("Vacancy content batch closure").
- **Owner decisions:** full page reload on confirmed loss of read; no deferral of UI findings; every session ends on GitHub; Claude merges PR #1 after green CI.
- **Verification done locally:** focused unit suites, a full browser pass of every touched screen on desktop and mobile, the final recapture, all routes under 180 kB (`/vacancies/new` 179.33 kB, almost no margin). Known local-only failures and flaky tests are listed in PROGRESS "Gaps".

## Next (in order)

1. Finish PR #1: watch hosted CI with `babysit`, fix red, merge with a merge commit, confirm `main` CI, delete the WIP branch.
2. D117 create/draft adoption. Then Phase 2 V4, candidates, files, dedup, talent pool, dashboard, custom roles. Never advance to Phase 3 automatically.
3. Bundle margin on `/vacancies/new` is tiny: any new code on that route needs `perf:size` first.
4. Owner physical-phone checks remain open. Keep the Phase 7 demo-video reminder.

## Run notes

- `corepack pnpm ...`; Vitest from PowerShell. Acquire the lease via `scripts/ai-edit-lease.mjs` before edits; release it at session end.
- Shared heavy-test lock `D:/recruiting-wt/.integration.lock` is a directory: create with `mkdir`, never overlap build, integration or Playwright.
- A push to `phase-2` cancels running CI. Batch fixes before pushing. Product write limit: 30 vacancy writes per user per minute; sign-in is limited per IP, so space E2E runs.
- The local DB holds inactive isolated `E2E Denial` users kept for audit history; this breaks only local `settings-users` counts.
- Never print `.env` or full Supabase status, delete rate-limit rows or reinstall without cause. Audit exemption expires 2026-12-18.
