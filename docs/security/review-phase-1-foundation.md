# Security review — Phase 1 foundation

- Date: 2026-10-31
- Reviewer: independent security-engineer agent
- Scope: implemented T1 HTTP/environment/CI baseline and T2 database foundation. This is not approval of the unfinished authentication or authorization features.
- Inputs: `CLAUDE.md`, PRD §13, threat model, handoff, ADR-002/003/006, ERD.
- Status: source review and independent PostgreSQL catalog checks complete; QA database integration suite 26/26 passed. Local Supabase app setup succeeded; managed-compatible session-access bridge is being reviewed.

## Findings

No concrete exploit found in the public 404/liveness-only HTTP scope. SEC-FND-03 has a reviewed fix awaiting live verification; the earlier findings are resolved.

| ID | Severity | Finding and evidence | Fix / status |
|---|---|---|---|
| SEC-FND-01 | Medium | Driver startup options could bypass URL identity/target checks: `postgres` 3.4.9 `src/connection.js:996` merges query-derived connection options over `user`/`database`; a URL with an `app_rw` username and `?user=postgres` could authenticate using the privileged role when supplied its password. This required control of deployment/tooling configuration, not an unauthenticated HTTP input. | Resolved: shared allowlist in `lib/env.ts:3`, runtime role pinning at `lib/env.ts:76`, both DB entry points use shared validators. Local tooling refuses every query/hash. Independent synthetic probes rejected 30/30 unsafe startup-option cases before connection. |
| SEC-FND-02 | Low | The fixture called “expired invite” originally expired on 2026-11-13, after this session's 2026-10-31 date, and its fixed token preimage was committed in seed code. No invite acceptance route exists yet. | Resolved: `server/db/seed/index.ts:248` uses January 2020 sent/expiry dates; storage remains a 32-byte SHA-256 digest only. Real invite generation/atomic consumption remains T4 work. |
| SEC-FND-03 | Medium | Root's live schema-metadata check found the initial migration's table-level `SELECT ON auth.sessions` exposed unnecessary session secret/PII columns to `app_rw`, including `refresh_token_hmac_key`, IP and user agent. Architecture §3 requires only `id`, `user_id`, `not_after`; no session-row values were read. | Forward `0001_auth_session_column_privileges.sql` revokes table SELECT and grants only three columns. Live metadata confirms table SELECT=false, approved columns=true, secret/IP columns=false. A real LIMIT 0 query still failed because managed `postgres` cannot grant auth-schema USAGE, so direct access is unusable. Architect/security are reviewing a narrow migration-executor-owned `app.auth_session_status` view; direct auth grants will be removed and live behavior rechecked. |

Review corrections also addressed literal-dot event/action regexes, privileged schema creation before changing to its nonlogin owner, and purge-role RLS policies so column-level purge grants can affect rows. These are covered by the final migration review; the full candidate purge procedure is outside T2.

## T1 checks

| Control | Evidence | Result |
|---|---|---|
| Secret-safe environment errors | `lib/env.ts`: `parseEnv` reports failed variable names only | Passed source review |
| Local tooling target | `lib/env.ts:99`: loopback hostname, `APP_ENV=local`, nonproduction `NODE_ENV`, no query/hash; seed/setup/provisioning guard both URLs before connection | Passed source review and synthetic denied cases |
| CSRF baseline | `server/security/http.ts`, `middleware.ts`: configured Origin, JSON media type and custom header on unsafe `/api/v1` methods; rejects cross-site Fetch Metadata | Passed source review; no authenticated mutations implemented |
| CSP and cache controls | `middleware.ts`, `next.config.ts`: fresh nonce, production script restrictions, frame/object denial, no-store, no-referrer | Passed source review; existing E2E CSP checks inspected |
| Public response minimization | `app/api/health/route.ts` | Liveness response only; no credentials or database metadata |
| CI privilege and secrets | `.github/workflows/ci.yml`: read-only repository permissions, no hosted secrets, environment-file guard, redacted offline Gitleaks | Passed source review; remote workflow execution pending |

The installed `postgres` 3.4.9 connection-option parser was inspected and instantiated with synthetic URLs without connecting. URL `host`/`hostaddr` query parameters do not replace its socket hostname; startup `user`/`database` overrides caused SEC-FND-01. No actual `.env` contents or Supabase credentials were inspected.

Independent run: `vitest run tests/unit/env.test.ts tests/unit/http-security.test.ts` passed, 36/36 tests.

## T2 verification

| Control | Evidence | Result |
|---|---|---|
| Runtime least privilege | `server/db/migrations/0000_narrow_inhumans.sql:1`; `server/db/index.ts:7` | Independently queried disposable PostgreSQL 16: 14 tables, 34 indexes and 4 sequences owned by `app_migrator`; `app_rw` has no superuser/createDB/createRole/replication/schema CREATE or membership in migrator/purge. BYPASSRLS is intentional per ERD; application authorization remains T3. |
| Private schema and coarse RLS | Migration schema creation and final ACL/default-privilege block; `supabase/config.toml` exposed schemas exclude `app` | Source review passed; catalog shows four policies for `app_purge` only. QA's initial integration run verifies anon/authenticated have no access. |
| Append-only history | Migration `guard_append_only` and per-row UPDATE/DELETE plus statement-level TRUNCATE triggers; runtime SELECT/INSERT grants only | Source review passed; QA initial integration run verifies runtime ACL denial and owner trigger rejection for events/audit. |
| Purge privilege separation | Migration app_purge NOLOGIN, no runtime membership, PII DELETE and audit UPDATE(before, after) only; trigger requires both values NULL and unchanged metadata | Source/catalog checks passed. QA confirms actual PII DELETE and NULL-only audit update succeed; repopulating diffs, modifying metadata, other mutations and TRUNCATE fail. No candidate purge function is implemented or exposed. |
| Invite storage | `server/db/schema.ts` and migration: bytea hash, 32-byte CHECK, unique hash, pending-invite uniqueness, status/timestamp/72h checks | Passed source review; generation, email identity binding and single-use consume are T4. |
| Seeds and local provisioning | `server/db/seed/index.ts:100`, `scripts/provision-local-db.ts:10` | Both local URLs checked before connection; endpoint matching enforced; no Supabase users/passwords/MFA fabricated; provisioning uses parameterized set_config + format(%L). QA initial integration run covers idempotence and refused unsafe seed targets. |
| PII-safe operational failures | CLI catches in seed/migrate/provisioning, `onnotice` suppressed; event seed payloads contain version/IDs only | Passed source review; no raw driver error, URL, token or personal data printed by these entry points. Full application logging remains T3. |

QA reported the final 26/26 PostgreSQL integration cases passing, including the targeted purge behavior test. Independent catalog queries used only the dedicated local `recruiting_test` database and printed role/ACL metadata, not row PII. Independent override probes exercised shared validators, runtime connection creation, migration, seed and provisioning with synthetic values; unsafe `user`, `database`, `options`, `debug` and `host` query cases were all refused.

Root's first migration against the existing local Supabase 17 failed transactionally with SQLSTATE 42501: its `postgres` login is NOSUPERUSER/CREATEROLE/BYPASSRLS and could not SET ROLE `app_migrator`. No `app` schema persisted. The reviewed compatibility fix at migration line 20 grants `SET` access to `app_migrator` only to the current migration executor before schema creation; it grants no runtime/purge membership and leaves owner/purge NOLOGIN. The retry succeeded: migration, runtime-login provisioning and seed returned exit 0. Root's metadata/count-only checks reported 14 app tables, 13 users, 2 verticals and 14 role assignments. Effective `postgres`→`app_migrator` memberships include one SET grant and the role creator's ADMIN-only grant; runtime membership in both migrator and purge remains false. Containers were not reset or restarted, and no auth/session rows were read or changed.

This setup success does not establish usable session lookup: the subsequent LIMIT 0 probe found the auth-schema USAGE limitation described in SEC-FND-03. No extra membership in Supabase `anon`/`authenticated` roles is acceptable as a workaround.

Seed, setup and local role provisioning now share `parseLocalDatabaseTargets`: both URLs must be loopback with no query/hash, identify the same database, and use the exact local `app_rw` runtime username with a password, all before client construction. No security blocker found in this delta.

## Limits and follow-up

- Authentication, session revocation, MFA, application authorization/IDOR, input/response schemas, database rate limiting, and production logging are future T3/T4 work, not verified controls.
- Supabase Auth/Storage/Realtime access tests are not replaced by plain PostgreSQL tests. Root's local setup and metadata checks verify database compatibility only; they do not verify full authentication/storage/realtime behavior. The reviewer did not access `.env` contents or Supabase session-row values.
- No production or hosted database access, deployment, commit or security sign-off for the full phase is included.
