# CI-MFA-01 — validation-chunk teardown

STATUS: APPROVED for the bounded helper fix by independent review `ctx_99a16b47c0de`. Hosted CI remains pending.

Main run `45495571948` failed `mfa.spec.ts:172` on desktop/mobile, including retries, at `lazy-chunks.ts:13`: `apiResponse.text: Response has been disposed`.

Pinned Playwright 1.64.1 marks a context closing before disposing its request responses and before closing its pages. Public `BrowserContext.isClosed()` includes this closing interval. The helper previously checked only `page.isClosed()`, which can still be false during expected teardown. It now rethrows only while both the page and context are active. Active fetch/body/abort/fulfill errors remain failures. The exact hosted timing and any relationship to reporter changes are not established.

## Verification

- Real Chromium synthetic regression: old helper failed 2/8 cases; fixed helper passed 8/8, covering tracing on/off disposal, delayed active completion, validation-chunk blocking, ordinary execution and active-context errors. Command: `corepack pnpm exec tsx --test tests/support/lazy-chunks.lifecycle.test.ts`. This standalone node:test suite is not automatically discovered by Vitest/Playwright; retain the explicit command.
- Focused strict TypeScript, ESLint, Prettier and diff checks passed. Independent review confirmed pinned API semantics and meaningful failure controls.
- Fresh `APP_ENV=test NEXT_TELEMETRY_DISABLED=1 corepack pnpm build` passed under the exclusively acquired shared integration lock.
- `CI=1 corepack pnpm exec playwright test --project=e2e-sessions --retries=0`: 11/11 passed.
- `CI=1 corepack pnpm exec playwright test tests/e2e/mfa.spec.ts tests/e2e/auth.spec.ts --project=e2e-desktop --no-deps --retries=0`: 14/14 passed.
- Same command for `e2e-mobile`, run afterwards: 14/14 passed.
- Post-run `e2e-sessions --grep 'sign in vasyl.tl@demo' --retries=0`: 1/1 passed. This seed uses magic-link login; no claim of a real seeded TOTP verification. MFA enrollment/verification in these specs is browser-mocked with explicit no-server-call assertions.

Shared lock was released after validating its owner marker. No rate-limit rows, product code, privacy/reporting behavior or E2E assertions changed. Local ignored environment files and test session state are excluded from the commit. D137's separately delivered document is outside this fix.
