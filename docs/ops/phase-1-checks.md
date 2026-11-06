# Phase 1 — local and CI checks

Verified 2026-11-05. Hosted deployment is outside the approved local scope.

| Gate                    | Evidence                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disposable CI Auth      | Workflow starts project-local Supabase, exports actual loopback endpoints/keys through masked `GITHUB_ENV`, generates ephemeral runtime/TOTP/rate-limit secrets, migrates, provisions `app_rw`, seeds application and Auth, then runs signed-in E2E, screenshots and Newman. No hosted credentials are used. Remote GitHub execution still needs the final committed tree. |
| Supply chain            | Actions use full commit pins; pnpm v4.3.0 resolves to `b906affcce14559ad1aafd4ab0e942779e9f58b1` (the previous SHA was an annotated tag object). Frozen lockfile and scoped advisory policy enforced. Production audit: zero advisories; 47 tooling advisories, with high/critical IDs restricted to reviewed dependency paths.                                            |
| Dependency patch        | Converter pins vulnerable js-yaml 4.3.0. Scoped override to 4.3.2 closes GHSA-5p4m-2wfm-xmqj and GHSA-2883-xcg3-v3hh. No blanket audit suppression.                                                                                                                                                                                                                        |
| Schema                  | `db:check`: 15 Drizzle tables; metadata valid; generation produces no migration. Check uses an isolated `.cache` copy and leaves committed migrations unchanged.                                                                                                                                                                                                           |
| Storage DG-03           | `test:storage` passed against the actual local stack: RLS enabled, zero object policies/public buckets, service-only temporary private object readable, anonymous/authenticated JWT direct list empty and download denied. Isolated fixture removed. Runtime MFA view readable.                                                                                            |
| Runtime config          | Restarted only `hris-recruiting` Supabase without reset. Running Auth now has factor cap 3, exact confirm/callback redirects, JWT 900 s, signup off and refresh reuse 10 s.                                                                                                                                                                                                |
| Secret/dev route checks | CI rejects tracked env files, runs pinned Gitleaks, and scans production client assets for private environment values/private keys. Production route manifest must contain no `dev-login` route.                                                                                                                                                                           |
| Local policy tests      | 35 cases across CI environment generation, scoped advisory assessment and hosted drift assessment passed; TypeScript and focused ESLint passed.                                                                                                                                                                                                                            |

## Hosted pre-deployment drift gate

`pnpm auth:drift` makes read-only Management API requests and a database `READ ONLY` transaction. It never prints configuration responses, credentials or identities; the database returns only aggregate counts. Run only when deployment is authorized, using a scoped token with `auth_config_read` and `auth_signing_keys_read`, and a database account allowed to read `auth.users` email/password status.

Required environment (secrets stay outside the repo):

- `AUTH_DRIFT_PROJECT_REF`: exact 20-letter hosted project ref.
- `AUTH_DRIFT_APP_ORIGIN`: exact HTTPS app origin.
- `AUTH_DRIFT_GOOGLE_ENABLED`: `true` or `false`, matching the deployed provider choice.
- `SUPABASE_ACCESS_TOKEN`: scoped read-only Management token.
- `AUTH_DRIFT_DATABASE_URL`: direct `db.<ref>.supabase.co` connection for that project, without URL options; certificate verification is required by the script. Pooler and custom-domain connections are deliberately unsupported.

The gate checks signup/anonymous/linking, provider restrictions and Google nonce/email checks, JWT/OTP lifetimes, refresh reuse/rotation, exact redirects, fragment-based TokenHash email template, SMTP, TOTP/phone/factor limits, provider rate limits, exactly one active ES256/RS256 signing key supported by this app, and zero demo/password identities. Missing or changed fields fail closed. Local fixture tests prove the assessment; no hosted project has been queried or certified.

Two additional checks require separate deployment evidence: legacy JWT-secret revocation and disabling legacy anon/service-role keys; effective abuse limits on direct GoTrue MFA endpoints. An active asymmetric signing key and nonzero OTP limits do not establish these controls. See [independent security review](../security/review-phase-1-final.md).

API field names and key status are verified against [Supabase Auth config](https://supabase.com/docs/reference/api/v1-get-auth-service-config) and [signing-key metadata](https://supabase.com/docs/reference/api/v1-get-project-signing-keys). [js-yaml CPU advisory](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) and [merge-budget advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh) document the patched versions.
