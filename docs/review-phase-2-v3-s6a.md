# Review V3 slice 6a (logic): status menu, optimistic pause/resume

Verdict: APPROVED. No blocking items.
Checks run in the worktree: typecheck clean; status-actions, status-chunk, status-flip 48 tests pass; all urgency tests (9 files, 134 tests) pass.

## Blast radius (optimistic-flip extraction)

- Safe because `applyOptimisticUrgency` keeps its signature and passes the same shows/put on `priority`. The flip logic is moved as-is; only `isDetail` changed (`version`+`status` instead of `priority`+`version`). It is only used on `['vacancy', id]` keys, which always carry both.
- Consumers: `lib/vacancy-urgency-change.ts` (the only caller of `applyOptimisticUrgency`) and `lib/vacancy-status-change.ts` (new). Cache keys, rollback, re-flip on server refetch and `settle` are unchanged.
- Beyond the diff: the `OptimisticUrgency` type is now an alias of `OptimisticFlip`, so a later change to one touches the other.

## Checked, no defect

- Double press: `tryLock` plus the module-level `inFlight` set (set before the first await) give one request, also across a remount. The retry toast goes through the same guard.
- Version: read from the card cache at press time, else from the prop. It is re-read on retry after rollback. Lost-answer adoption needs `version + 1` and the target status. A repeat answer (same version) is not announced.
- Rollback: `restore` touches only the rows and card it flipped, and only while they still show the new value. Network and 429 skip the refetch. Other failures read the current card and refresh.
- Buttons derive only from `statusActions`. The optimistic flip swaps HOLD/RESUME inside the card's flag list, so the button flips with the chip.
- D130-5: Recruiter has no hold/resume grant, so the actor of a pause never owns an unassigned-only view. A row stays in a list only until `refreshVacancy` (all lists and the card) runs after success. Not a defect; only a mixed-role user could see it, for one refetch.
- Unmount: `setPending` is guarded by `mountedRef`; the toast is global. Rejected promises: all chains end in `.catch`. Lazy chunk failure: `LoadBoundary` with a null fallback, next load retries; the placeholder keeps the header height.

## Nit

- `use-change-status.ts` `toggle` clears `busyRef` in `finally` even when the outcome was `busy`. Harmless because `inFlight` still blocks.

## Self-check line for docs/engineering-self-check.md

- A helper extracted from a shared flow keeps its old consumers' tests green, but name every consumer and run their tests, including type-guard changes (`isDetail`).
