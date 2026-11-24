# Review — vacancy content intent and submit state

Task: REVIEW-CONTENT-STATE. Assigned specialist: code-reviewer, critical High. Scoped working-tree review against ADR-020; production scope is the pure form/submit modules and `use-edit-vacancy-content.ts`. This report is the reviewer's only edit; implementation owners retain all source files.

Status: **DONE**. Verdict: **APPROVED**.

## Blocking

None in STATE.

## Should fix

None.

## Nit

None raised; no unrelated cleanup requested under D126.

## Checks

- `lib/vacancy-content-form.ts:8`: discriminated intents retain the complete valid/invalid editor result. Invalid replacement stays dirty and blocks the whole body; it never falls back to an older valid value. Clear stores the exact preceding buffer, repeated Clear is stable, and undo restores that same reference. Empty document, NULL and omitted unchanged fields remain distinct.
- `lib/vacancy-content-submit.ts:24`: only actually changed document keys and the saved baseline version enter the strict shared schema. The lazy-loaded request module validates before fetch and validates the shorter PATCH response. Unsafe valid-tagged input, overposting and empty patches cannot bypass validation. Failure mapping carries field paths/codes rather than submitted content.
- `components/vacancies/use-edit-vacancy-content.ts:41`: STATE consumes the passed ACCESS result and adds no observer. Entry has no baseline until readable content matches the ID. Same-version reads retain dirty fields/reset keys; a newer revision or STALE_STATE blocks repeat save until deliberate successful reload. Recoverable same-ID read errors retain invalid/Clear buffers and leave protection while disabling save; terminal denial discards the baseline/buffers and releases the guard.
- `use-edit-vacancy-content.ts:99`: `commit` updates the latest form ref synchronously. Submit rechecks that snapshot's invalid/readiness/stale/closed/freshness gates before taking the synchronous lock. Thus a same-event invalid update or retained pre-stale submit callback cannot dispatch the previous valid form. Fields/Clear/undo freeze as soon as the lock is taken, before awaits/rendered pending state.
- `use-edit-vacancy-content.ts:108`: success adopts both canonical PATCH documents/version locally, clears intents and preserves editor state when canonical content matches. Saved Clear deliberately advances its reset key even when the displayed target is already NULL, discarding the hidden undo buffer. Necessary adoption/reload sets runtime readiness false. PATCH never fabricates GET status/capability or replaces its cache.
- `use-edit-vacancy-content.ts:139`: mounted ID/client lifetime and ACCESS generation guard every asynchronous adoption. The active success path invalidates inherited prefixes and completes an authoritative ACCESS read before another save; the fresh/version barrier remains if that read fails or is older. Stale/closed/field/network/server/rate-limit outcomes preserve edits. 403 refreshes retained read rights, including independent true eligibility, without silently rebasing dirty text. Ambiguous network outcomes do not infer success from a version alone.
- `lib/vacancy-content-submit.ts:76`: confirmed late success invalidates only the captured original client/ID vacancy prefix and list prefix with `refetchType:'none'`. It neither inserts protected documents nor starts reads after unmount, ID change or denial. Old resource callbacks cannot mutate the current form, and late cleanup does not unlock a different lifetime.
- No new endpoint/authz policy, role shortcut, PII logging/storage, optimistic document mutation, second cache or shared leave-guard change.

## Blast radius

**Safety facts:** the current invalid/stale form cannot be serialized through an older callback, and a late confirmed write cannot repopulate or refetch denied/new-identity documents. The shorter PATCH response becomes only a local clean baseline; current GET access remains a separate save authority.

**Proof level 4:** engineer executed **39 passing tests across 3 files**, inspected by the reviewer. Actual React/TanStack hook tests assert one observer, zero PATCHes for invalid/not-ready/stale state, synchronous duplicate suppression, freeze during pending work, cache DTO separation, second-save fresh GET, same-version retention, explicit stale reload, retained-read 403, terminal cleanup, nonterminal 500 buffer/leave preservation, and late ID/unmount/denial success. The two regression cases had supplied failing-before evidence: same-event invalid-update→Save and retained pre-stale callback each sent one PATCH when zero were expected; both now pass against the current-form ref guard. Pure tests call the real diff/schema/request boundary.

**Integration seam:** root identified F10's missing readiness callback cycle after an explicit reset. STATE's readiness reset was correct; the F10 owner fixed the runtime's changed-resetKey false→validated-readiness cycle without changing STATE. Root reports failing-before evidence for NULL/document adoption, **15 runtime tests passed**, lint/format/global typecheck passed, and unchanged-key/invalid behavior retained. That separate two-line F10 delta belongs to root's narrow review; browser integration remains required.

## Validation and remaining gates

- Engineer-reported STATE checks: 39 tests passed across `content-form`, `content-submit` and `edit-content`; typecheck, lint and scoped formatting passed. Reviewer inspected all assigned source/tests and ran scoped diff-check only; no passing suite, integration, build, E2E or global typecheck was duplicated.
- This approves STATE as a bounded foundation. PAGE must wire confirmed reload/discard, readiness, disabled controls, feedback/focus and leave protection correctly; ACCESS/CARD must gate all protected rendering. The F10 reset seam must remain covered when the real editors are mounted.
- Separate security/QA and consolidated browser/auth/MFA/profile/content flows, bundle checks, D125 captures and current-head CI remain publication gates. This report does not claim those results.

## Self-check line for the orchestrator

- Recheck the latest form ref before submit dispatch: same-event editor invalidation and a retained pre-stale callback must never serialize a previous valid buffer.
