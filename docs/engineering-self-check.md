# Pre-review self-check

Run this list before you hand work to QA or review. Every item comes from a review finding in Phase 2. For each item, write "checked" or "n/a + reason" in your report.

## Submit and mutation paths
- [ ] Double press, Enter and Ctrl+Enter send exactly one request. A synchronous lock is set before the first `await`.
- [ ] A success keeps the form locked until navigation or unmount. Unlock only on failure.
- [ ] A retry reuses the same Idempotency-Key. A changed body gets a new key.
- [ ] Every rejected promise is handled. No bare `void promise` without `.catch`.
- [ ] A late success after unmount still updates the caches. Toast and navigation run only while mounted.
- [ ] Mutations invalidate the right query keys. Check with a test.

## Lazy code (`import()`, `next/dynamic`, `React.lazy`)
- [ ] The chunk can fail to load: offline, or deploy skew. The UI must not crash, hang or lose user input. Test it with the chunk blocked.
- [ ] Anything the server action depends on (response schema, validator) resolves **before** `fetch`. A chunk failure must stop the call before the server acts.
- [ ] No `React.lazy` on the main path without an error boundary. Prefer loading into state in an effect.
- [ ] A dependency-free fallback exists where the user needs feedback without the chunk.

## Tests
- [ ] Every failure branch has a test: validation, 400 field errors, 403, 404, 409, 429, 5xx, network failure, key reuse.
- [ ] Pure helpers (mapping, planning, parsing) have table unit tests.
- [ ] E2E cleans up its own data in `afterEach`, scoped to its own project or prefix, so desktop and mobile runs do not collide.
- [ ] No reliance on real time of day, row order without a tie-breaker, or shared mutable seed data.

## Budget and structure
- [ ] Run `corepack pnpm build && corepack pnpm perf:size` **before** reporting. Report the kB for every touched route. 180 kB gz is a hard limit.
- [ ] Components stay under ~400 lines. Extract hooks (`useXxx`) and small components early.
- [ ] No second definition of the same rule (authz predicate, class string, schema). Share one helper.
- [ ] Copy with numbers uses ICU arguments from the shared constants, not hard-coded values.
- [ ] A skeleton row matches the wrapped height of the real row, including long hint or helper text. Check at 390 px.
- [ ] A server eligibility rule (who may be assigned, who may hold a priority) has exactly one predicate. Picker, save and create use the same one.
- [ ] Query keys come from the shared key factory. Do not hard-code arrays.
- [ ] A test-only switch (for example `APP_ENV=test`) is refused at boot on Vercel. Pin it in the vitest project env, so that CI's job-level env cannot change what a test asserts.
- [ ] "Refused" tests assert the exact error code, not just any rejection.

## Rules check
- [ ] lint, typecheck, unit and the touched integration and E2E files all pass. Report the commands and pass counts.
- [ ] Comments: one line, *why* only. No stacked JSDoc.
- [ ] `tsconfig.json` and `screenshots/` are not changed by accident. There are no leftover temp folders such as `.next-*`.
- [ ] Only one Playwright, build or integration run at a time on this machine.
