# Review CONTENT-CARD (VAC-01/VAC-08, D133) — one round (D126)

Verdict: **APPROVED** (no blocking defects). Should-fix items are small; Deferred items are nits.

## Verified

- Overview: only `ReactNode` slots (`headerAction`, `content`); imports nothing content/editor. Preview/list callers pass no slots, so they are untouched. Slots render only when `!privateDraft`.
- Edit link: gated on the fresh read (`readable` + `content.canEditContent` + `isEditableStatus(content.status)`), not `state.canEdit` (that one also hides during refetch/write and would flicker the link). No role/creator/detail-cache shortcut. Position: after Share, before status actions (wireframe line 8).
- Denial: `denied` (403/404 read) sets `vacancy` undefined, so metadata and all actions go; `notFound` shows the existing not-found card; `session` shows a skeleton while the refresh/redirect runs. 5xx: `SectionError` with `onRetry` -> `revalidate()`.
- Server layout: content 404 -> real `notFound()`; both loads start together (`Promise.all`); the two DTOs are seeded under distinct keys.
- `isEditableStatus` refactor: same predicate (`OPEN || ON_HOLD`) at all 5 call sites; behaviour-neutral. No second definition remains.
- DRAFT: panel returns null (matches ADR "own DRAFT -> draft flow").

## Should fix

1. `(card)/layout.tsx` `.catch(() => undefined)` swallows every content error with no log, and would also swallow Next control-flow errors (redirect from `requireSession`; today safe only because `loadVacancy` rejects with the same redirect). Fix: catch, rethrow if `isRedirectError`/digest starts with `NEXT_`, else `logger.error(..., describeError(error))` (as `_lib/position-seed.ts:11`), then return undefined. Client retry stays the recovery path.
2. `vacancy-content-panel.tsx` `ContentSkeleton` shows while `kind==='checking'` and no error. The server already seeded content, but `isFetchedAfterMount` is false until the refetch ends, so the seeded data is hidden behind a skeleton on every card visit (flash + wasted SSR work). The ADR only requires revalidation for _form activation_ (line 15), not for the read-only viewer. Fix: expose `query.data` on the `checking` state and render it read-only while revalidating; keep the link hidden until `readable`. Not blocking: it is correct and secure, only slower than the contract implies.
3. `SectionError` in the panel gets no `retrying`; the button gives no feedback and allows repeat clicks. Pass `retrying={state.refreshing}` equivalent (query.isFetching).

## Perf note (not blocking, per ADR line 15)

One extra content GET on every card visit (staleTime/gcTime 0 + `isFetchedAfterMount`). Server seed saves nothing for the viewer until item 2 is done. Card route 165.87 kB gz reported by engineer (not re-measured).

## Deferred nits

- Wireframe line 57 names key `action`; code/messages use `vacancies.contentCard.editAction`. Update the wireframe (messages are correct and unused-key free).
- Comment on the layout JSDoc is long; trim to one line.

## Tests

Not rerun by me: `content-panel.test.ts` and `content-card-layout.test.ts` fail at collection here with "Vitest failed to find the runner/current suite" (reviewer shell has no `pnpm`; used `node node_modules/vitest/vitest.mjs`). Treat as reviewer-environment problem; engineer's evidence (190 passed) not independently confirmed. Ask that the layout test also assert item 1 (logged error, redirect rethrown).

## Self-check line

- Never `.catch(() => undefined)` on a server load: rethrow Next redirect/notFound errors and log the rest with `describeError`.
