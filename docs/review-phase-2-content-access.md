# Review — content access and verified identity lifetime

Task: REVIEW-CONTENT-ACCESS. Assigned specialist: code-reviewer, critical High. Baseline: `b0e7c3e`; scoped working-tree review against ADR-020's ACCESS/identity contract and ADR-019 query semantics. Ownership: this report only; implementation engineers retain source ownership.

Status: **DONE**. Verdict: **APPROVED**.

## Blocking

None.

## Should fix

None.

## Nit

None raised; no unrelated cleanup requested under D126.

## Checks

- `components/vacancies/use-vacancy-content-access.ts:127`: one TanStack content observer owns both documents. Hydrated success stays `checking` until a successful post-mount read. Errors/failure reasons hide stale payloads; only the readable discriminant carries content. Edit eligibility also requires the same read's live status and no fetch/write gate.
- `use-vacancy-content-access.ts:151`: GET 404 exposes unavailable immediately, then cancels/removes the exact content key and detaches subscription. GET/PATCH 401 invalidates the access generation, cancels and clears the old client before `router.refresh`. The terminal gate prevents the observer from recreating a refetch loop. PATCH 403 requests an authoritative retained-read check; independent content rights remain possible.
- `use-vacancy-content-access.ts:37`: the private per-scope store contains only denial/write gates and operation counters/tokens, not duplicate documents or authorization policy. Snapshot identity changes only through notifications. Its bound `enabled` callback sees the synchronous write gate before React rerenders; `useSyncExternalStore` provides the rendered gate. This is bounded to the hook rather than a generic store/framework.
- `use-vacancy-content-access.ts:83`: beginning a write increments generation and pauses/cancels reads before dispatch. Duplicate begin/manual revalidate is refused during the write. The post-write read cancels old work and checks scope/token/read generation around awaits; stale tokens, old IDs, replaced providers, unmounts and terminal denials cannot adopt a result or clear the new scope. Token membership is checked by the owning scope, so another scope's still-live token cannot authorize its work.
- `app/(app)/layout.tsx:60`: the existing provider enclosing hydration is keyed from verified application actor ID plus verified session ID. MFA/role changes do not enter the key; another actor or session remounts the existing QueryClient and protected local state before hydration. No fallback identity, token props, shared cache or provider refactor was introduced; `requireSession` still runs first.
- Actual React/TanStack tests cover hydrated entry gating, one observer, readonly/closed states, recoverable errors, 404 detachment/eviction/no refetch loop, 401 clear-before-refresh, PATCH 401, 403 retained permissions, canceled pre-write work ignoring abort, paused focus/invalidation, duplicate writes, fresh post-write revision and late ID/unmount completions. Actual AppLayout/AppProviders lifetime tests cover same actor/session through role/MFA refresh, distinct actor/session remount, late old-client completion and session-guard failure.

## Blast radius

**Safety facts:** protected content is returned only through the current readable access state; a different verified actor/session receives a new provider tree, so the previous client's documents/local editor state cannot hydrate into it. Existing same-identity state survives role/MFA refresh.

**Proof level 4:** engineer executed **18 passing tests** (13 hook cases + 5 actual layout/provider lifetime cases); reviewer inspected their real React/TanStack interactions and assertions. They do not mock away QueryClient or AppProviders: 401 asserts an empty cache inside `router.refresh`, 404 asserts zero observers and no focus/invalidation refetch, and identity changes assert both a different client and clean mounted component state. No passing suite was repeated by the reviewer.

**Library boundary checked:** installed TanStack `useBaseQuery` skips observation when `subscribed:false`; focus/reconnect decisions resolve the live enabled callback. `cancelQueries` initiates matched cancellation and resolves after cancellation, and `clear` removes both query and mutation caches. This supports the synchronous gate, cancellation-before-dispatch and terminal detach/clear behavior instead of assuming disabled queries remove sensitive data by themselves.

**Cleared:** no endpoint/schema/server-authz change, no second content cache, no role shortcuts, no persisted buffers, no mutation payload adoption into the shorter/longer DTO cache, and no dependency/provider-default change. The provider key's reach includes all protected app state, so browser regression gates remain required.

## Validation and limits

- Engineer-reported: 18 tests passed; global typecheck, lint with zero warnings, scoped formatting and diff-check passed. Reviewer performed source/test/installed-library inspection only; no integration/build/Playwright/typecheck overlap or duplicate suite.
- This approves the bounded ACCESS foundation. PAGE/STATE/CARD consumers must still clear their baseline/invalid/Clear-undo buffers and leave guards when the hook becomes unavailable; the hook does not own those future local states.
- Consolidated `auth.spec.ts`, `mfa.spec.ts`, `profile.spec.ts` and the required content/browser integration, security/QA and current-head CI gates remain required before publication. No end-to-end identity/session, hydration, screenshot or bundle claim is made by these component tests.

## Self-check line

No new production mistake class found; no engineering self-check addition requested.
