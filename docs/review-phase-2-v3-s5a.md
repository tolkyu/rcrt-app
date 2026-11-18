# Review V3 slice 5, half A (commit 3899dee)

Verdict: APPROVED (no blocking). typecheck green; 5 test files, 110 tests pass.

## Blocking
None.

## Should fix
1. `components/vacancies/recruiter-cell.tsx` ClaimHost, lost claim: `useClaimVacancy` calls `refreshVacancy` on `taken`. If the list refetch lands before Radix `onCloseAutoFocus`, the row (and its ClaimHost) is already gone: `focusAfterRow` finds no link and focus falls to `<body>`. Fix: in `onClose('lost')` call `focusAfterRow` synchronously before `setOpen(false)`, or defer the invalidate until close.
2. `components/vacancies/use-claim-vacancy.ts` / `claim-vacancy-dialog.tsx`: `refusalNext` returns `stay` for `stale`, `invalid`, `teamLeadSet`, but the dialog shows an inline error only for `closed`, `network`, `failed`. Claim sends no version so `stale` is unlikely, but the dialog would stay with no message. Fix: show `noConnection`/generic for every other failure.
3. Stale adoption (`use-assign-recruiters.ts`): `version+1 && ids present/absent` can be a false positive when another manager made the same change at the same time. Outcome is identical (the state the user wanted), only the toast author differs. Acceptable; document the limit in the JSDoc.

## Blast radius
- Fact: `refreshVacancy`/`readCurrentVacancy` are the moved bodies of `refresh`/`readCurrent`, unchanged. Urgency flow calls them at the same places; `vacancies-ui` and urgency tests pass.
- `ConfirmDialog.focusConfirm` defaults to false, then `onOpenAutoFocus` is `undefined`, same as before. Button gets `ref` through `...props` (React 19). Other consumers (form-page-layout, edit-form-feedback, use-draft-close, dev demos) are unaffected.
- List patch `withTeam` only maps rows already in a cached page (`isPage`, non-infinite lists). It cannot add a row to any list. A claimed row stays in an "unassigned" filtered list only until the immediate `invalidateQueries` refetch. Safe.
- Double submit: lock set before the first await, success keeps it, failure releases it. Lost claim: the panel calls `onLost` (card `router.replace(listHref)`, preview clears selection). Correct.
- `selfAssignVerticals` reuses `grantedVerticals`; server still re-checks under lock. No PII, no authz bypass.
