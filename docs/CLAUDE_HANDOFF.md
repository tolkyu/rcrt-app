# Handoff — current state only

> **Rule:** latest checkpoint only (≤ ~60 lines). Move the old checkpoint to the top of `docs/archive/handoff-log.md` before rewriting.

## Session start (owner rule, 2026-11-23)

GitHub is the source of truth. Every session ends with all work pushed. Every new session starts with `git fetch`, then reads branch `phase-2`, PR #1, its CI and this file on the remote. Compare them with the local checkout before work.

## Checkpoint — 2026-11-23 21:45 (Claude, paused by owner)

- **Not merged.** PR #1 (`phase-2` → `main`) is open. Last full CI on `4e0dbe7` is red (run `45153135565`, 4 E2E failures; causes below). The owner wants CI green, then a merge by Claude. Use a true merge commit only: `.gitleaksignore` pins commit SHAs, so squash or rebase turns the secret scan red.
- **All unfinished work is on `origin/wip/content-ui-2026-11-23`.** It is also uncommitted in `D:\recruiting-app`. If the local tree is missing or differs, restore from that branch. Do not merge it as is: it is unverified and has a WIP commit message.
- **Owner decisions today:** fix every UI finding before merge, with no Phase 7 deferral; on confirmed loss of read access, do a full page reload; end every session on GitHub.

### In the WIP tree

| Area                                                                                                                                                                        | State                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Content UI: 720 px form, one-row toolbar, shared typography, borders, link contrast, save feedback, Clear rules, edit link in heading row, shared form footer, touch reason | Done, units green; browser checks written, not all run                                                    |
| Denial: synchronous purge, one `location.replace`, per-URL+key hashed marker, session throttle, `#main` handling, MFA redirect                                              | Security passed this part; denial E2E 15/15 desktop, 12 + 3 skips mobile on the build before the hook fix |
| Bundle                                                                                                                                                                      | All 21 routes pass; largest `/vacancies/new` 179.95 kB of 180. Almost no margin                           |
| E2E fixes: 401 body capture, 429 write reduction, urgency badge selector                                                                                                    | Written; full CI not run                                                                                  |
| New specs: `vacancy-content-ui`, `vacancies-denial-back`, `vacancy-content-nav`, `ui-label`                                                                                 | `vacancy-content-nav` never run                                                                           |
| Screenshots                                                                                                                                                                 | **Not recaptured.** Committed PNGs show the old UI                                                        |

### Open blocker (start here)

`CONTENT-MOBILE-STUCK-2` in `components/vacancies/use-vacancy-content-access.ts` was **stopped mid-edit**.

- Bug: a client navigation from card to editor can hang on the skeleton, because `isFetchedAfterMount` stays false after hydration lowers `dataUpdateCount`.
- Security blockers on the first fix: B1, the gate must use only `gate.fresh`, because hydration and `setQueryData` raise the counters. B2, `gate.fresh` must reset to false after a failed read.
- Intended watcher: on `updated` events for the current query object, `error` → false, non-manual `success` → true, otherwise unchanged.
- Must also hold: a navigation that starts no GET must still trigger a real read and reach `readable`.
- Required tests: no-data query hydrated during a GET; `setQueryData` during a GET; failed GET then hydration; good GET, failed re-read, hydration; late success from a removed query; the three navigation tests.
- This was the **second automatic repair**. If it fails, stop and bring options to the owner.

## Next (in order)

1. Inspect the hook diff, finish the fix, run focused units, get `security-engineer` to confirm B1/B2.
2. QA: fresh build, `perf:size`, content/UI/denial/nav specs, then specs of shared screens (card, preview, list, draft close, create, edit, request, profile, settings, `Label` users), desktop then mobile.
3. Recapture content screens and footer-affected forms, regenerate the gallery. `ux-ui-designer` re-checks; `code-reviewer` reviews the whole WIP diff.
4. Commit in logical commits with explicit paths, push `phase-2`, watch CI with `babysit`, fix red, merge with a merge commit, confirm CI on `main`, delete the WIP branch.
5. Then fix the remaining V3 gallery nits in `docs/ux/review-phase-2-v3-gallery.md`. After that: D117, V4, candidates, files, dedup, talent pool, dashboard, custom roles. Never advance to Phase 3 automatically.
6. Owner physical-phone checks remain open. Keep the Phase 7 demo-video reminder.

## Run notes

- `corepack pnpm ...`; Vitest from PowerShell. Acquire the lease via `scripts/ai-edit-lease.mjs` before edits. It is released at this checkpoint.
- Shared heavy-test lock `D:/recruiting-wt/.integration.lock` is a directory: acquire exclusively. Never overlap build, integration or Playwright.
- A Playwright run in `tests/e2e/settings-*` was killed at 21:43. Local DB may hold fixtures from it: check before relying on settings data. Do not delete rate-limit rows.
- A push to `phase-2` cancels running CI. Batch fixes before pushing. The product write limit is 30 per user per minute, so space out E2E runs.
- Never print `.env` or full Supabase status, or reinstall without cause. Audit exemption expires 2026-12-18.
