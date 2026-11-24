# Review: V3 slice 6b, status actions in the list row menu (a1c0ece)

Verdict: APPROVED (no blocking items). typecheck green; Vitest 4 files / 130 tests green (vacancy-status, status-row-menu, status-actions, page-frame).

## Checked

| Area                                           | Result                                                                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rowStatusActions` vs `permittedStatusActions` | Pinned by a cross-product test (roles x statuses x own/foreign row); mirror reads `ctx.grants` only, so aal1-withheld Admin grants (phase-2 `mfaWithheldGrants`) stay out                 |
| Team Lead own-row rule                         | `own` applies only when `row.teamLead.id === viewerId`; same as `hasOwnGrant`. Service re-decides every write                                                                             |
| `RowActionsMenu` controlled                    | `open` starts true, Radix `onOpenChange` still closes on select/Esc/outside; trigger reopens. All other consumers pass `() => void` (assignable); event no longer forwarded, none used it |
| `useStatusToggle` extraction                   | `useToggleStatus(vacancy)` wrapper keeps the card call sites; `seen` only a cache fallback. phase-2 did not touch `use-change-status.ts`, so no textual conflict                          |
| Phase-2 conflict                               | `status-actions.tsx`, `status-header-actions.tsx` use `useToggleStatus` (kept); `needsMfa` is card-only. No semantic clash                                                                |
| Double press / chunk failure / row leaves      | One lock, one read, one write; `LoadBoundary` null leaves the title link; focus goes to next row on unmount                                                                               |

## Should fix (non-blocking)

1. `status-row-actions.tsx` `choose`: after Esc/outside click while waiting, HOLD/RESUME still runs when the version arrives. Cancel/reopen only open a confirm dialog, so the risk is the two toggles. Either accept (press was explicit) or skip `run` if the menu was dismissed.
2. Pressing a different item while one waits is silently ignored (`tryLock` false after `keepOpen`): a dead click for the second item. Rare; could show its pending state or disable siblings while `waiting`.
3. Viewers with only withheld grants (Admin at aal1) get no row menu and no step-up in the list; card shows it. Confirm this is the intended spec.

## Nit

- `.catch(() => undefined)` at the end of `choose` hides programming errors thrown in `run`/`announceLoadFailure`.

## Engineering self-check line

- A deferred action that waits for data must re-check that its menu was not dismissed before it runs.
