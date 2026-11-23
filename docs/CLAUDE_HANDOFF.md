# Handoff — current state only

> **Rule:** latest checkpoint only (≤ ~60 lines). Move the old checkpoint to the top of `docs/archive/handoff-log.md` before rewriting.

## Session start (owner rule, 2026-11-23)

GitHub is the source of truth. Every session ends with all work pushed. Every new session starts with `git fetch`, then reads branch `phase-2`, PR #1, its CI and this file on the remote. Compare them with the local checkout before work.

## Checkpoint — 2026-11-23 (Claude, vacancy content batch)

- **Branch/PR:** `phase-2` → `main`, PR #1. The owner told Claude to bring CI to green and merge this batch. Check PR state on GitHub: this file cannot record the final merge commit.
- **Merge method:** true merge commit only. `.gitleaksignore` pins commit SHAs, so squash or rebase turns the secret scan red on `main`.
- **Committed:** AI harness (`a906ac4`), content read/edit UI (`6a95add`), Next 15.5.29 security update (`f832a49`), two reviewed secret-scan false positives (`2bb351d`), cache and load-failure fixes (`76f8781`, `7c33814`).
- **Fixes after blast-radius review:** a failed status, urgency or publish write no longer strands the first content read; content responses no longer enter the detail cache; a successful publish refreshes content; denial clears the whole `['vacancy', id]` cache prefix; recruiter SQL correlation is qualified; content edit load failures are logged without PII.
- **Review:** code-reviewer APPROVED `2bb351d..7c33814`, no blocking findings. Non-blocking stale-read items are in the PROGRESS Phase 7 debt list.
- **CI note:** perf P95 `real profile write` failed once at 120.75/120 ms and passed on rerun of the same commit. It is a known slow-runner flake. Budget unchanged.

## Next (in order)

1. If PR #1 is not merged: fix red CI, then merge with a merge commit and confirm CI on `main`.
2. Fix the five content gallery findings listed in PROGRESS, starting with the 720 px edit form width, then have `ux-ui-designer` review the 120 new PNGs (QA visually inspected 17).
3. Runtime performance review and final independent feature QA for the content batch, if not recorded in PROGRESS.
4. D117 create/draft adoption. Phase 2 V4, candidates, files, dedup, talent pool, dashboard and custom roles remain unfinished. Never advance to Phase 3 automatically.
5. Owner physical-phone keyboard/selection/sticky-footer/toast checks remain open. Retain D126 deferred nits and the Phase 7 demo-video reminder.

## Run notes

- `corepack pnpm ...`; Vitest from PowerShell. Acquire the checkout lease via `scripts/ai-edit-lease.mjs` before edits and release it at session end.
- Shared heavy-test lock `D:/recruiting-wt/.integration.lock`: acquire exclusively; never overlap build, integration or Playwright. Desktop then mobile sequentially.
- A push to `phase-2` cancels the running CI (`cancel-in-progress`). Batch fixes before pushing.
- Never print `.env` or full Supabase status, delete rate-limit rows or reinstall without cause. Audit exemption expires 2026-12-18.
