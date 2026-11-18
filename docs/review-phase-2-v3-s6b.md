# Review: V3 slice 6 (status menu), dialogs/banner half

Verdict: APPROVED (no blocking items). typecheck green; Vitest status-banner, status-actions, status-chunk, status-flip, vacancies-ui: 95/95 pass.

## Blocking
None.

## Verified
- Cancel reason: shown by the existing `vacancy.cancelReason` section for any reader. The server decides: `getVacancyDetail` keys a never-opened draft's reason to the author (D123) and a published one to the read scope (D130-4). The UI adds no extra gate.
- Cancel dialog reuses `reasonLength`, `VACANCY_REASON_MAX` and `hasOnlyReasonChars` (same as draft close). ConfirmDialog trims and keeps the typed text while mounted. `stale` and `statusInvalid` return `stay`, so the inline error keeps the reason.
- Reopen: 1..100 clamp on the stepper, text and non-numeric input never reach the server, unchanged number sends no headcount (E4), Enter submits and `tryLock` blocks a double Enter, field focused and selected through `initialFocus`.
- Banner `updatedAt`: correct. Every writer on a closed vacancy is guarded (urgency by `isUrgencyChangeable`, team and recruiter assignment by `assertEditable`/`isTeamEditable`), so `updatedAt` stays at the close time. A private cancelled draft gets no banner. Date uses Europe/Kyiv from the i18n config.
- Merge in `vacancy-overview.tsx`: the share-fallback alert (`failedUrl`, `shareRef` focus, close button) is intact, and the cancel-reason section is untouched. Only the status additions are new.
- Focus after close: `#main h1` for the card and `[data-slot=detail-header] h2` for the preview, `tabindex=-1`. Dialogs are hosted outside the buttons, so removal of the button cannot drop focus.

## Should fix (non-blocking)
1. `cancelDialog.consequence`, `banner.cancelled` and the success toast omit the wireframe's «Клонувати» hint and action (§3.5, §5). This is correct only while Clone is not built: add them with the Clone slice and log the gap in PROGRESS.
2. Wireframe §3.5 and §3.6 give specific `VACANCY_STATUS_INVALID` texts (status from the server for cancel; «Вакансію вже відкрито або скасовано…» for reopen). Both dialogs use the one generic `teamConflicts.VACANCY_STATUS_INVALID`. It is the same meaning, so accept it or update the wireframe.
3. Wireframe §3.5 says stale closes the cancel dialog. Here it stays open with an inline text. This matches the review brief and keeps the reason, so update the wireframe.

## Nit
- `reopenDialog.hint` uses `{count}` without a plural form (wireframe «2 місця»); the «label: N» form avoids plurals, so it is fine.

## Risk beyond the diff
- The banner date relies on "no writer bumps `updatedAt` on a closed vacancy". Soft delete, restore from the archive or a future edit on a closed vacancy would shift the date. Add `closedAt` to the DTO when the archive/restore slice lands.

## engineering-self-check line
- A date shown as "when it happened" and taken from `updatedAt` needs a test or a note proving that nothing else writes the row after that event.
