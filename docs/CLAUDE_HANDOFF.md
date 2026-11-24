# Handoff — current state only

> **Rule:** latest checkpoint only (≤ ~60 lines). Move the old checkpoint to the top of `docs/archive/handoff-log.md` before rewriting.

## Session start (owner rule, 2026-11-23)

GitHub is the source of truth. Every session ends with all work pushed. Every new session starts with `git fetch`, then reads branch `phase-2`, PR #1, its CI and this file on the remote. Compare them with the local checkout before work.

## Checkpoint — 2026-11-24 20:25 (Claude, paused for computer shutdown)

- **PR #1 (`phase-2` → `main`) is NOT merged.** Pushed head before this note: `15877e2`. Its CI failed only on a test-side toast match in `vacancies-denial-back.spec.ts:598` and a one-off `ECONNRESET`; both fixed locally. Merge only with a **true merge commit** (`gh pr merge 1 --merge`): `.gitleaksignore` pins SHAs.
- **Unpushed work is on `origin/wip/content-ui-2026-11-23`** (latest WIP commit pushed at this checkpoint). Restore from it if `D:\recruiting-app` differs. Do not merge that branch.
- **In the WIP tree, verified by unit tests, browser check partly pending:**
  - Refused-write copy: a write 404 re-reads the card; readable → existing «Недостатньо прав для цієї дії.»; unreadable → old purge and reload. New `lib/vacancy-write-refusal.ts`; changed `lib/vacancy-{urgency-change,status-change,team,draft-close,edit-submit}.ts`. E2E updated in `vacancies-denial-back`, `vacancies-draft-close`, `vacancies-edit` (passed desktop and mobile).
  - Claim race on the card: `attemptTeamWrite` awaits the re-read for `taken`; `vacancy-detail-view.tsx` skips the list move once `denialReloadStarted`. **Not yet browser-verified:** run `vacancy-assignment.spec.ts:179` with `--repeat-each=10`.
  - `tests/e2e/screens.ts`: one GET-only `ECONNRESET` retry.
  - Possible unit flake: `status-actions.test.ts` «OPEN: one outline button…» and `status-row-menu.test.ts` «Admin on OPEN» timed out once under parallel load; run the unit suite 3 times and make the lazy wait deterministic if it repeats.
  - Analyst output, uncommitted: VAC-01-2 stories in `docs/stories/phase-2.md`, Q-196..Q-199 in `docs/OPEN_QUESTIONS.md`, candidate stories with QC-1..QC-16 in `docs/stories/phase-2-candidates.md`. Owner answers pending.
- **Codex** owns CI log/session-token redaction (CI-LOG-01) in worktree `D:/orca/recruiting-app/larvacean`, as a separate PR after PR #1 merges. Send Codex the merge SHA. Expect conflicts with Codex in `tests/e2e/screens.ts`, `playwright.config.ts` and `ci.yml`.

## Next (in order)

1. Restore or confirm the WIP tree, take the lease, run the step-1 checks above (fresh build, `perf:size`, `:179` repeat, affected specs, unit suite 3 times).
2. Commit in logical commits, push `phase-2`, watch CI (about 75 min including the Newman sign-in wait), fix red, merge with a merge commit, confirm `main` CI, delete the WIP branch, send the SHA to Codex.
3. Merge the analyst docs and the owner's answers; then D117, VAC-01-2, candidates C1.

## Run notes

- `corepack pnpm ...`; acquire the lease via `scripts/ai-edit-lease.mjs`; it is released at this checkpoint.
- Heavy-test lock `D:/recruiting-wt/.integration.lock` is a directory (`mkdir`); never overlap build, Playwright or integration; Codex shares it.
- Limits: 30 vacancy writes per user per minute; 30 sign-ins per IP per 15 minutes (shared by E2E, Newman and Codex). Never delete rate-limit rows.
- A push to `phase-2` cancels running CI. `/vacancies/new` is 179.34 kB of 180: measure before adding code there.
