# Review: V3 bug fixes (1fe09aa, d9bfd0e)

Verdict: **APPROVED** (no blocking items). Typecheck green; Vitest `status-actions`, `team-panel`, `vacancy-team`, `recruiter-cell`: 4 files, 128 tests pass.

## Blocking

None.

## Should fix

1. `components/vacancies/status-actions.tsx:41`: `useMobile()` has server snapshot `false`, so SSR and the first hydration pass render the desktop `RowActionsMenu` on a phone; the sheet trigger replaces it right after hydration. No hydration mismatch (React uses the server snapshot for the hydration pass, then re-renders). The swap is horizontal only: the row height is fixed by the `h-11` status button and the pointer-coarse dropdown trigger is already `size-11`. A brief change of the trigger's look is possible on slow devices. Accept for now; if V-block CLS shows a shift, render the `MenuPlaceholder`-sized slot until mounted.

## Nit

- `components/ui/row-actions-sheet.tsx`: a disabled item (with `disabledReason`) is not focusable by keyboard, so the reason is reachable only by screen-reader browse mode. Same pattern as the dropdown; keep.
- Crossing 768 px (rotate or resize) with the sheet open unmounts it (state lost). Rare; ignore.

## Checks

| Item                             | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 404 mapping scope                | OK. Only `claimVacancyRequest` (`lib/vacancy-team.ts:13`) maps 404 to `ApiError(409, VACANCY_ALREADY_ASSIGNED)`; its only caller is `use-claim-vacancy.ts`. Card GET, assign, remove, lock writes keep `gone` (`classifyTeamFailure` unchanged). 403, 429, 500 and network pass through (unit test table). Lost-claim `onLost` and focus on the next row: tests in `team-panel` and `recruiter-cell`.                                                        |
| Clamp                            | OK. Only `claim-vacancy-dialog.tsx` lost `clampDescription`; `cancel-vacancy-dialog`, `remove-recruiter-dialog`, `use-draft-close` keep it. The body scrolls in the ConfirmDialog (`overflow-y-auto`).                                                                                                                                                                                                                                                       |
| Sheet a11y                       | OK. Radix Dialog gives the focus trap, Esc, outside click. Focus return: `SheetContent` uses `useOpenerFocus` (trigger is the opener). Title = `SheetTitle`; `aria-describedby={undefined}` intentional. Trigger `size-11`, `aria-label` «Інші дії», `aria-haspopup="dialog"`, `aria-expanded`. Items `min-h-12`. Destructive items last, after a border, only when safe items exist. Bottom safe area, `max-h-85dvh`, close button 44 px.                   |
| Motion                           | OK. `motion-sheet-up` uses `--motion-shift`; reduced motion sets it to 0% and 120 ms (`globals.css:454`).                                                                                                                                                                                                                                                                                                                                                    |
| Desktop / list row               | Unchanged. `md:contents` wrapper keeps the desktop flow; the list-row menu does not use `StatusActions`/`useMobile`. `StatusHeaderActions` placeholder has the same wrapper (no shift while the chunk loads).                                                                                                                                                                                                                                                |
| Blast radius `lib/use-mobile.ts` | Safe because the only behaviour change is `matchMedia?.()` (absent only in jsdom; every browser has it). Consumers: `audit-view`, `users-view`, `users-virtual-list`, `status-actions`. In tests without `matchMedia` they now render the desktop form instead of throwing; no existing test relied on a throw. Server snapshot `false` unchanged for all. Risk beyond the diff: the three settings views also flash desktop-first on phones (pre-existing). |

## Self-check line

- «A responsive component that picks its variant with `useMobile` renders the desktop variant on the server: size both variants' trigger the same, or reserve the slot.»
