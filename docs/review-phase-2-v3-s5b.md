# Review V3 slice 5, half B (assign + Team Lead dialogs), commit 3899dee

Verdict: APPROVED (no blocking items). Typecheck clean; team-panel + vacancy-team tests 59/59.

## Checked

- Picker key `vacancy/<id>/assignable-recruiters` sits under the card prefix, so `refreshVacancy` after stale/invalid refreshes it; `gcTime: 0`, `private, no-store` route: no stale list after reopen.
- 21st pick refused (`full`, aria-disabled + guarded handler); ticks of people who became assigned are dropped.
- Stale flow: `catchUp` moves the dialog to the refetched version; user must confirm again; adopted-check handles a lost echo.
- Team Lead picker uses `teamLeadKeys` and the D122 list; invalid pick invalidates the list and `chosen` is derived from it.
- Shell: Escape/overlay blocked while pending, bottom sheet below 768 px comes from shared Dialog, footer outside the scroll area. All copy from uk.json.

## Should fix (non-blocking)

1. `lib/queries/vacancy-assignable.ts` / `assign-recruiters-dialog.tsx`: the picker returns 409 VACANCY_CLOSED for a closed vacancy; the dialog shows `loadFailed` ("Оновіть сторінку") instead of `errors.closed`. Map ApiError 409 on `query.error` to `errors.closed`.
2. `team-lead-dialog.tsx`: Team Lead list `staleTime: 60_000` is shared; after reopen it may offer a user deactivated within a minute. Server rejects (invalid, list refetched), so safe; consider `refetchOnMount: 'always'` for this dialog.

## Nit

- None.
