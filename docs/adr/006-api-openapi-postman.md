# ADR-006 — REST API, OpenAPI 3.1 and Postman/Newman

- **Status:** Accepted
- **Date:** 2026-10-30
- **PRD:** API, PIPE-01, SEC (CSRF, rate limit, Zod), `CLAUDE.md` §2

## Context
- One REST API `/api/v1` used by the UI and by Postman; no Server Actions for data mutations.
- OpenAPI generated from Zod; Postman collection generated from OpenAPI; Newman in CI.

## Options
| Option | Pros | Cons |
|---|---|---|
| **A. Route handlers + `defineRoute()` wrapper that registers Zod schemas into an OpenAPI registry (`@asteasolutions/zod-to-openapi`)** | Spec can't drift from code; one wrapper handles auth/validation/errors | Wrapper discipline required |
| B. tRPC / Server Actions | Typed end-to-end | Not REST, not Postman-friendly, violates `CLAUDE.md` §2 |
| C. Hand-written OpenAPI | Flexible | Drifts |

## Decision
**A.**

### `defineRoute()` (in `server/http/`)
Per route: `{ method, path, operationId, summary, tags, params?, query?, body?, responses, auth: 'user' | 'cron' | 'webhook' | 'public' }` + handler `(ctx, input) => Promise<output>`. The wrapper:
1. assigns `requestId`, starts server timing;
2. CSRF (DG-06, decided in the Phase 1 review): every unsafe `/api/v1` request (POST/PUT/PATCH/DELETE), from the UI and Newman alike, must carry `Origin` equal to `APP_URL`, `Content-Type: application/json` and `X-CSRF-Protection: 1`; anything else → 403 `CSRF_FORBIDDEN`. No Bearer exemption and no `Sec-Fetch-Site` fallback. The check (`server/security/http.ts` `isTrustedMutation`) runs in `middleware.ts` and again in the wrapper; both answer with the same problem+json body (`server/http/problem.ts`). No CORS headers are ever sent; SameSite=Lax cookies. **GET/HEAD never change state** (only audit rows); logout and invite acceptance are POST;
3. authenticates (cookie session or `Authorization: Bearer <Supabase access token>`) → `RequestContext` (ADR-002);
4. parses params/query/body with Zod → 400 on failure;
5. calls the service; validates output with the response schema in dev/test only;
6. maps errors (`docs/architecture.md` §Error model) to RFC 9457 `application/problem+json`;
7. logs `{requestId, route template, status, ms, userId}` (no PII, no params/query string);
8. sets `Cache-Control: private, no-store` on every `/api/v1` response and on exports (DG-15).

### Security headers & redirects (DG-15)
- CSP with per-request nonce + `strict-dynamic` for scripts; `style-src 'self' 'unsafe-inline'` (inline `style` attributes set by Radix/next-font; no script can run from it, accepted risk); `object-src 'none'`; `base-uri 'none'`; `frame-ancestors 'none'`; `form-action 'self'` + Supabase/Google OAuth hosts; `connect-src 'self'` + project `https`/`wss` + Sentry ingest; `worker-src 'self' blob:`; no `frame-src` to storage (ADR-005).
- HSTS (preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` on auth/invite pages), COOP `same-origin`, `Permissions-Policy` minimal.
- RSC responses containing PII: `private, no-store` (never CDN-cached).
- Redirect targets (`next`, `redirectTo`) accept only same-origin relative paths (start with `/`, not `//`); Supabase redirect allowlist = exact URLs.
- Email sending domain: SPF, DKIM, DMARC `p=reject` (devops).

### Logging & error tracking scrubbing (DG-16)
- Sentry: EU region, `sendDefaultPii: false`, no Session Replay; `beforeSend`/`beforeBreadcrumb` strip request bodies, query strings, cookies, `Authorization`, storage/signed URLs, email/phone patterns.
- DB errors logged by SQLSTATE + constraint name only (driver messages carry parameters).
- pino: route template, ids, codes, timings only; a CI log-scan test fails on seeded PII strings.

### Conventions
| Topic | Rule |
|---|---|
| Paths | Plural nouns, kebab-case: `/vacancies/{id}`, `/applications/{id}/transitions`, `/applications/{id}/offers` |
| Commands | State changes are `POST …/transitions` with `{ action, expectedStage, expectedVersion, data }` (the state machine action), not PATCHing `stage` |
| JSON | camelCase; ids UUID; money `{ amountMinor: integer, currency: "UAH" }`; dates ISO-8601 UTC; date-only fields `YYYY-MM-DD` (Kyiv calendar date) |
| Lists | Cursor pagination `?limit=50&cursor=<opaque>` → `{ items, nextCursor }`; `total` only when `?withTotal=true` and the screen needs it (PERF-05) |
| Concurrency | `expectedVersion`/`expectedStage` on mutations of versioned rows → 409 `STALE_STATE` if changed |
| Errors | `{ type, status, code, detail?, errors?[] (field paths) , requestId }`; `code` is a stable enum the UI maps to `messages/uk.json` |
| Versioning | Breaking change ⇒ `/api/v2`; additive changes in place |
| Internal | `/api/cron/*`, `/api/webhooks/*`, `/api/dev/*` excluded from the public spec (separate `internal` tag file) |

### Shared schemas
`lib/schemas/<domain>.ts` — single Zod source for forms (react-hook-form resolver), API input, API output and OpenAPI. No duplicate shapes.

### Generation
- `pnpm api:openapi` → `openapi/openapi.json` (committed; CI fails if regeneration produces a diff).
- `pnpm api:postman` → `openapi-to-postmanv2` → `tests/postman/collection.json`, then a merge script injects test scripts from `tests/postman/tests/<operationId>.js` (assertions: status, schema, scope — allowed and denied per role).
- `pnpm test:api` → Newman against the CI environment (local Supabase via CLI, seeded data).
- Postman auth: environment pre-request obtains an access token for a seeded user via Supabase password grant. **Password sign-in is enabled only in the local/CI Supabase config**; production uses magic link + Google only. The dev login route (`/api/dev/login`) exists only when `NODE_ENV=development` and is excluded from production builds. DG-12b: the route **and** any dev-only aal/MFA bypass live in one dev-only module behind an inlined `process.env.NODE_ENV` check (dead-code-eliminated in prod); the route also refuses unless `SUPABASE_URL` is local; CI asserts the route is absent from the production `.next` manifest and returns 404 on preview.

### Webhooks
`POST /api/webhooks/resend` — signature verified (Svix headers) with 5-min timestamp tolerance; `svix-id` deduplicated (replays ignored); status-only updates of `notification_delivery` / `offer.email_status` (OFFER-02) (DG-04).
Admin job re-run: `POST /api/v1/admin/jobs/{job}/runs` (ADR-004, DG-04).

- **Team Lead priorities (T6 slice 10, SEC-TLP-02):** a priority row's version is taken from the Team Lead's `app_user.version`, so every priority change also bumps that user's card version. Another Admin with that card open gets 409 `STALE_STATE` on roles / email / deactivate and refreshes — fail-safe, no lost update; accepted. A dedicated sequence would remove the coupling if it ever matters.

## Hot path & budget
- Wrapper overhead (JWT verify + context query + Zod) target ≤ 5 ms of the PERF-02 budget.

## Consequences
- (+) Spec, UI client types and Postman stay in sync automatically.
- (+) UI and Postman exercise the same code path; Newman covers authz denied cases per role.
- (−) Every handler must use `defineRoute()` → lint rule forbids exporting raw `GET/POST` from `app/api/v1/**` without it.
