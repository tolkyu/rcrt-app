# Security review: Phase 2 perf slice (lazy auth-form validation, next-intl precompile, intl cache group) [PERF-04]

Base 7aa786d, uncommitted changes. Verdict: **PASS. No Critical, High or Medium findings.** Two Info notes.

## Checks

| Area | Result | Evidence |
| --- | --- | --- |
| Server still validates every input | Unchanged. `definePublicAuthRoute` / `defineAuthenticatedAuthRoute` do `spec.body.safeParse` (400 on failure) after the CSRF/Origin check and, for authenticated routes, after the 401. Magic-link: `emailAddressSchema` (trim, lowercase, `z.email`, max length). TOTP verify: `mfaVerifySchema` (`factorId` uuid, `code` `^\d{6}$`, `next` max 512, `.strict()`). OAuth start and enroll: `emptyRequestSchema` (`.strict()`). No server file differs from 7aa786d. | server/http/public-route.ts:99-107; lib/schemas/auth.ts:84-90; server/services/auth/mfa.ts |
| Lazy resolver failure | `lazyResolver` catches a failed chunk and returns `{ values, errors: {} }`, so the form submits raw values and the server answers 400 (shown as the generic error). Nothing is accepted that the server would refuse; the client resolver was never a trust boundary. A malformed TOTP code is rejected by `mfaVerifySchema` before the failure counter, and the 5-failure / 15 min lock stays server-side. | components/auth/lazy-resolver.ts:4-16 |
| Response parsing before redirect (the High-if question) | **Cannot be skipped.** `apiRequest` does `await schema()` then `validator.parse(payload)` (lib/api-client.ts:79-80). If the lazy chunk fails to load, `schema()` rejects, so `apiRequest` throws and the destructuring `const { url } = await apiRequest(...)` never runs. `window.location.assign(url)` / `replace(redirectTo)` are reachable only after a successful parse; all four call sites sit inside `try` with a `catch` that shows an error and does not redirect. Pinned by new tests (see below). | lib/api-client.ts:79-80 (unchanged vs base); components/auth/login-form.tsx:76-80; totp-code-form.tsx:53-60; mfa-verify-form.tsx:70-75 |
| `z.url()` scheme (earlier F3) | Unchanged and still Info. The URL comes from our own same-origin `/api/v1/auth/google` response, which the server also re-parses with the same schema before sending. The lazy path does not make it worse. `redirectResponseSchema` is only `z.string()`; the server derives `redirectTo` from `safeNextPath` (same-origin, no `//`, no backslash, no control chars, no auth paths) or the literal `/login`. | server/auth/safe-redirect.ts:5-27; server/services/auth/mfa.ts:239 |
| CSRF | `X-CSRF-Protection: 1` and `Content-Type` are still set by `apiRequest` for every non-GET and callers cannot override them. Server enforces `isTrustedMutation` (Origin check) before anything else. Forms still use `apiRequest` only. | lib/api-client.ts:62-70; server/http/public-route.ts:90-93 |
| Rate limits | Untouched (server-side only): `auth:google:ip`, magic-link and `mfaEnrollPerUser` limits, TOTP failure lock. The client change adds no new request paths. `onFocus` only imports a chunk, no network call to the API. | server/services/auth/google.ts:30-36; magic-link.ts; mfa.ts:88 |
| Logs / PII | No `console.*` or logger in `components/auth`. The raw email and code are only in the request body and form state, as before. | grep over components/auth |
| `next.config.ts` | Security headers block (`nosniff`, `no-referrer`, `X-Frame-Options: DENY`, COOP, HSTS, Permissions-Policy) is untouched and `poweredByHeader: false` remains. New `webpack()` hook adds only a client, production-only `intl` cache group (name `intl`, same-origin chunk, test on `use-intl`, `next-intl`, `@formatjs`, `icu-minify`); it does not alter headers, rewrites, env exposure or `serverExternalPackages`. The extra same-origin chunk is covered by the existing CSP `script-src 'self'` (middleware, no change). | next.config.ts:6-9, 23-37, 38-57 |
| next-intl precompile | Build-time only, production only (`development ? {} : {messages...}`); dev keeps the runtime parser. Messages are our own static JSON, no user input is compiled, so no new injection surface. Messages are still rendered through React (escaped). | next.config.ts:62-75 |
| Secrets | No env or secret touched. | git diff |

## Tests added

`tests/unit/auth/lazy-validation.test.ts` (5 tests, unit project, green):
- a schema chunk that fails to load rejects `apiRequest` with a hostile payload (`javascript:`) instead of returning it;
- a loaded schema still rejects a wrong-shaped payload;
- problem+json errors stay `ApiError` (429 lock) without loading the schema;
- `lazyResolver` delegates when loaded and passes values through when the chunk fails.

No integration tests were run: another `vitest --project integration` was already running (PID 6292) and the change touches no server code. The unit file does not use the database and was run alone with `--project unit`.

## Findings

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| F1 | Info | If the response-schema chunk fails after the server already succeeded (magic link sent, aal2 cookie set, Google PKCE cookie set), the UI shows the generic error although the action took effect. Security-neutral (fail closed, no redirect); the user can reload or retry, and the server rate limits bound retries. | None needed. Optional UX: on `ChunkLoadError` suggest a reload. |
| F2 | Info (carried over from review-phase-2-s3-1 F3) | `oauthStartResponseSchema` is `z.url()` with no scheme restriction, and `redirectResponseSchema` is `z.string()`. Defence in depth only; values are server-produced. | Optional: `z.url({ protocol: /^https?$/ })` for OAuth start, matching the dev local URL, and a `^/(?!/)` regex for `redirectTo`. |

`docs/security/threat-model.md` needs no change: no new trust boundary or endpoint.
