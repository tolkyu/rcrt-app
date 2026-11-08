# Bugs found by QA

Format: ID · severity · PRD/story · steps · expected · actual. Fixed items stay listed with their fix.

## Open

| ID       | Severity | PRD / story           | Steps                                                                                              | Expected                          | Actual                                                                                                                                                                                                                                          |
| -------- | -------- | --------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-V1-5 | Minor    | UI-06                 | Change the vertical/status select or type in the search before the page has hydrated (slow device) | The choice is kept                | Suspected, seen as an E2E flake: a `<select>` change fired right after load left the URL and the control unchanged (controlled value restored by hydration). E2E now waits for hydration (`tests/support/hydration.ts`); not reproduced by hand |
| BUG-V1-6 | Info     | UI-06 (loading state) | Try to see the list skeleton                                                                       | Skeleton shown for the first load | It is unreachable in practice: data is hydrated from RSC and `keepPreviousData` shows the dimmed previous list («Оновлюємо список…») on filter change. The gallery captures that state as «refreshing»                                          |
| BUG-V1-7 | Info     | test stability        | First test of `profile.spec.ts` after `e2e-sessions` on a cold `next start` (full run)             | Passes                            | One run: `page.goto('/settings/audit')` exceeded 30 s once (cold route compile under load); passed on re-run                                                                                                                                    |

## Fixed and verified (E2E 337 passed; gallery PNGs checked on 1440 and 390 widths)

| ID       | Fix                                                                                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-V1-1 | `vacancies/page.tsx` prefetches the first row's detail into the exact detail query key when no `?vacancy=` is given; the preview button prefetches on hover and focus. E2E: «the default preview ships with the page…».             |
| BUG-V1-2 | Team Lead, Vertical and Status columns have minimum widths and use `break-words` instead of `overflow-wrap:anywhere` (which let the table squeeze them); «Не призначено» never wraps.                                               |
| BUG-V1-3 | Labels are «Створено» and «Походження» (`messages/uk.json`, `vacancies.fields`).                                                                                                                                                    |
| BUG-V1-4 | The reset button above the results is hidden while the result is empty; the empty state keeps its own button. The above-results button is now an outline button. E2E asserts exactly one reset control in the filtered-empty state. |

## Investigated, not fixed

- **BUG-V1-5** (input before hydration). React 19.3's hydration path (`diffHydratedProperties`) does not re-apply controlled `<select>`/`<input>` values, and `change` is not a replayed event, so a choice made before hydration changes the DOM only: the URL and list stay as rendered while the control shows the new value. A fix would read the DOM value on mount and push it to the URL, but browsers also restore form values on reload and Back, so that read can write a stale value into the URL and break Back. Not reproduced by hand, the window is the hydration gap of a server-rendered page, so it stays documented; E2E waits for hydration (`tests/support/hydration.ts`). Revisit if real-user monitoring shows it.

## Fixed in tests (not product bugs)

- Newman `vacancies.json`: Admin without TOTP returns `401 MFA_REQUIRED` (D63, same as every other Admin route), the case expected `404 NOT_FOUND`. Field-error codes (`invalid_value`, `custom`) were correct.
- `profile.spec.ts`, `shell.spec.ts`: roles with vacancy access now land on «Вакансії» and have a mobile bottom nav.

## Test-environment notes

- `tl.crypto@demo` is Newman's cookie user (session-count assertions in the Auth folder), so it has no browser session; its vacancy scope (V-0003, V-0007, V-0012) is covered by integration tests and the seed test only. Adding it to `E2E_USERS` makes `endOtherSessions` report 5 instead of 1.
- BUG-V1-8 · Info · `profile.spec.ts` «captures «Профіль» as vasyl.tl@demo» on mobile failed once in a full run (`main time` count 10, expected 5) and passed 8/8 on repeat; cause unknown (looks like a doubled login-history page).
- Sign-in rate limit: a full E2E uses 12 sign-ins (+1 MFA-pending) and Newman 4–7 of 30 per 15 minutes; two full runs back to back hit 429 in `e2e-sessions`.
- The nav change regenerates every signed-in Phase-1 screenshot (Admin gains «Вакансії» in the rail and bottom nav); the PNGs are updated in place.
