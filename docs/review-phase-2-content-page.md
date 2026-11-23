# Review — vacancy content edit page (CONTENT-PAGE)

Task: CONTENT-PAGE. Role: code-reviewer, critical. Scoped working-tree review against ADR-020 (Decision, Published form state, Access loss) and the content-edit wireframe. Report is the reviewer's only edit.

Status: **DONE**. Verdict: **APPROVED**.

## Blocking

None.

## Non-blocking

- `vacancy-content-feedback.tsx:46`: `isEditableStatus` now exists beside two inline `OPEN`/`ON_HOLD` checks (`use-edit-vacancy-content.ts:86`, `use-vacancy-content-access.ts:146`). The duplication is real but cross-module; move one exported predicate to `lib/vacancy-content-form.ts` and reuse it in the next touch of those files.

## Deferred (D126)

- `layout.tsx:51` repeats `!vacancy.value || !content.value` after the null/notFound check; keep only if TS narrowing needs it.
- `ContentReadOnly` / `ContentLoadRetry` / `ContentCheckRetry` could share one retry card; no size win large enough now.

## Declared deviations — judged

| Deviation                                                 | Ruling                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FormError` instead of `VacancyFormError`                 | OK: it takes count, attempt and field links, and the summary is the same. The ADR name is only a label.                                                                                                                                      |
| Static `ConfirmDialog` import in `feedback.tsx`           | OK: the module loads only on the editor route, so it does not touch card or list bundles. Measure at V-block.                                                                                                                                |
| Duplicated `isEditableStatus`                             | Accepted; see Non-blocking.                                                                                                                                                                                                                  |
| Draft link for any readable DRAFT                         | OK: the server-side `/edit` author gate stays authoritative and the read-only view hides the documents.                                                                                                                                      |
| Form stays mounted after eligibility loss                 | OK: it matches ADR "keep selectable local text while read access remains valid". `disabled` is passed and `blockFor` shows `permissionLost` or `locked`. Terminal 401/404 is the access hook's `unavailable` state, which unmounts the form. |
| Clear disabled when empty and unchanged                   | OK: nothing to clear; undo remains available after a clear.                                                                                                                                                                                  |
| 400 zod `too_big` mapped to `too_large`, others `invalid` | OK: `ERROR_CODES` covers both the API and editor message sources; there are no raw server texts or counters.                                                                                                                                 |

## Checks

- Layout reads the vacancy and content together with `Promise.all`, uses `notFound()` above the loading boundary and sends transient failures to a retry state, never writable empties. It seeds distinct DTOs under `vacancy`/`vacancyContent` keys and dehydrates only `success` entries. Messages are a narrow selector. All `contentEdit.*` keys used in code exist in `uk.json`.
- Form: stable callback refs via `latest`; Ctrl/Cmd+Enter is IME-guarded and goes through `submit`; Cancel is inert while sending; the failed-field focus effect and `FormError` attempt counter work; save, stale (confirm before discarding dirty edits) and retry alerts are wired to STATE.
- Field: a cleared editor stays mounted and hidden, so undo restores the exact buffer. Labels use `FormField` group layout, and the mobile `h-11` targets match.
- No `any`, TODOs, commented-out code or mock data. Size ~880 lines is mostly three cohesive files; I found no dead code.

## Blast radius and proof

**Safe because** the page only composes the approved ACCESS/STATE hooks and gates every protected render on `access.state`; it adds no endpoint, cache or authz rule. Proof level 3: I ran the 3 new test files, **47 passed**. Not run: E2E, bundle measurement and browser flows (`vacancy-content-edit.spec.ts`), plus the D125 screenshots; all remain V-block gates. Security/QA review of the access slice stays separate.

## Self-check line

- None new.
