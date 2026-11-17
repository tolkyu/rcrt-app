# S3 UI — coordinator review, 2026-11-17

Scope: create/edit forms, own-draft list/menu/card, cancel/delete dialogs. Gallery: `screenshots/phase-2/index.html`; captures in `vacancy-form-screens.spec.ts` and `vacancy-draft-screens.spec.ts`.

This is coordinator visual verification. The independent UX/code/performance verdicts remain pending because the configured Astra agents reached their usage limit. S3.6 is not complete.

## Findings and corrections

| Before                                                                    | After                                                                                                                                                 | Why                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A corrected form retained «Виправте 2 поля» despite valid visible fields. | Value edits dismiss the submit-time snapshot; field errors remain. Real React Hook Form regression and gallery assertion cover picker `setValue` too. | The old count no longer described the form.                              |
| Consecutive reason breaks were collapsed.                                 | Every internal break is retained and counted; CRLF/CR become LF.                                                                                      | D113 requires multi-line reasons.                                        |
| Recovery could publish CANCELLED before close/focus completion.           | The read stays outside the active cache until normal completion.                                                                                      | The cancelled card's delete action receives its normal focus transition. |

## Worst-case boundaries

| Value             | Source / limit                         | Evidence                                                                                                                        |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Vacancy title     | DTO/schema, 200 characters             | Long Ukrainian compound title in card and cancel/delete description; wrapping stays within the modal.                           |
| Reason            | Required, 1–500 normalized code points | Empty/whitespace, 500/501, consecutive breaks, CRLF, emoji and forbidden controls; dialog counter shares the schema normalizer. |
| Pending mutation  | One request per press sequence         | Read-only reason, unavailable dismissal, spinner and retained button widths; pending gallery state.                             |
| Status/action set | Own DRAFT or never-opened CANCELLED    | Draft menu has edit/publish/cancel/delete; cancelled card has only delete, with the matching confirmation.                      |
| Failure           | Typed reason retained                  | Inline stale/forbidden/rate-limit/server/network errors; first 404 closes and refreshes.                                        |

Representative PNGs inspected directly: filled Admin desktop form, Recruiter stale mobile form, filled dark mobile cancel sheet, maximum-length desktop reason, 200-character desktop title and dark cancelled-draft delete dialog. Automated screenshot helpers check horizontal overflow; accessibility scans run before captures. Further independent gallery review, the remaining wireframe §10 matrix, 320 px/200% zoom visual review and the owner's physical-phone footer/sticky-bar check remain open.

## Motion review

| Before                                             | After                                                                                                           | Why                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Existing shared ConfirmDialog/ModalSurface motion. | Retained: desktop 200/150 ms, mobile sheet 240/180 ms, compositor properties and existing reduced-motion rules. | No additional form/list/counter animation was introduced. |

Coordinator motion decision: **Approve for this diff**; no new motion regression identified in source. This does not replace the pending independent UX verdict.

## Remaining observation

BUG-S3-14 remains open: a full desktop run can lose the forbidden toast after a 403 and RSC refresh. The trace confirms the stubbed POST returned 403; this is not treated as fixed merely because focused runs pass.
