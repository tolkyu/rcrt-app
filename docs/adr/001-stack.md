# ADR-001 — Technology stack (speed-first monolith)

- **Status:** Accepted (stack fixed by `CLAUDE.md` §2). Items in "Proposed / flagged" need owner approval.
- **Date:** 2026-10-30
- **PRD:** §1, §13 PERF-01..06, SEC, API

## Context

- Small team, internal app, ~10 roles × N verticals, strict visibility, PII (CVs, polygraph, salaries).
- Hard perf budgets: API P95 list < 150 ms, card < 100 ms, mutation < 120 ms; LCP < 1.2 s; initial JS ≤ 180 KB gz.
- Users in Ukraine → EU region (Frankfurt) for app + DB.

## Options

| Option                                                                                            | Pros                                                                                             | Cons                                                                |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **A. Next.js monolith (RSC + REST route handlers) + Supabase Postgres/Auth/Storage, Vercel fra1** | One deploy, one language, RSC streams first screen with data, managed auth/storage, same-city DB | Serverless limits (duration, no long-lived connections)             |
| B. SPA (Vite) + separate Node API (NestJS) + managed Postgres                                     | Clear split                                                                                      | Client fetch waterfall on first load, two deploys, more code        |
| C. Next.js + Prisma + Auth.js + S3                                                                | Popular                                                                                          | Prisma engine overhead/cold start; build auth/invites/MFA ourselves |
| D. Microservices / message broker                                                                 | Scales teams                                                                                     | Over-engineering for v1 (explicit non-goal)                         |

## Decision

Option A, exactly as `CLAUDE.md` §2. Key points:

- Next.js 15 App Router, React 19, Node runtime, TypeScript strict; REST `/api/v1` for all mutations (ADR-006); RSC prefetch + TanStack Query (ADR-007).
- PostgreSQL 17 on Supabase eu-central-1; Drizzle + `postgres.js` via Supavisor transaction pooler (`prepare: false`).
- Supabase Auth (magic link + Google), JWT verified locally with `jose` against cached JWKS (asymmetric signing keys enabled on the project).
- Supabase Storage private buckets, direct browser upload (ADR-005).
- Vercel fra1, Vercel Cron (ADR-004), Resend + React Email, `@react-pdf/renderer`, next-intl `uk` (ADR-009).
- No microservices, no broker, no Redis in v1.

Supporting libraries (not stack changes, chosen for size/speed): `jose` (JWT), `@asteasolutions/zod-to-openapi` (ADR-006), `openapi-to-postmanv2`, `exceljs` (server-only XLSX export), `react-pdf`/pdf.js (lazy CV/PDF preview), `@date-fns/tz` (Kyiv day maths), `server-only`.

## Consequences

- (+) Single code path (UI and Postman hit the same API), one repo, one deploy, ~1–3 ms app↔DB.
- (+) Pure domain modules testable without infra.
- (−) Serverless: no session-level Postgres features through the transaction pooler (no session advisory locks, no `LISTEN`, no prepared statements) → jobs use row leases (ADR-004), live updates use Supabase Realtime (ADR-007).
- (−) Function duration limits → cron jobs batch + resume (ADR-004).
- Invite links must live 72 h (ROLE-05), longer than Supabase OTP/magic-link expiry (max 24 h) → own `user_invite` table (hashed single-use token, `expires_at`); the Supabase user is created on acceptance, login then via magic link/Google.
- 2FA (SEC, owner 2026-10-31): Supabase Auth TOTP MFA is **mandatory for Admin and Finance**; their grants are active only when the JWT `aal = aal2` (ADR-002).
- Framework versions (DG-17): Next.js and React pinned to versions patched for CVE-2025-29927 (middleware bypass) and CVE-2025-55182 / CVE-2025-66478 (RSC); Renovate security PRs merged within 48 h. Authorization never relies on `middleware.ts` (it only refreshes the session cookie); it lives in `defineRoute` and pages (ADR-002). Supply-chain gates (frozen lockfile, lifecycle-script allowlist, `minimumReleaseAge`, `pnpm audit`, SHA-pinned Actions) belong to devops CI.

### Auth hardening (DG-07, security threat model T-A03/05/06/11)

| Item             | Rule                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signups          | Production Supabase `enable_signup = false`; the auth user is created server-side at invite acceptance (admin API, `email_confirm = true`); the signing identity's email must equal the invite email                                                                                                                                                                                                     |
| Invite token     | 256-bit random, stored as SHA-256. Carried in the URL **fragment** (or exchanged by POST), never in the path/query; acceptance page sends `Referrer-Policy: no-referrer`; acceptance is a button (POST); consumed atomically `UPDATE user_invite SET accepted_at = now() WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING …`; then a clean redirect |
| Magic link       | Lands on a confirm page with a button that POSTs the `token_hash` (mail scanners that pre-fetch links can't consume it); lifetime/cross-device behaviour ⚠ OWNER (O-09)                                                                                                                                                                                                                                  |
| Prod drift check | Nightly job on production: no `@demo` users, no `auth.users` with a password set, password provider state verified via the Management API, signups still off; any finding alerts Admin                                                                                                                                                                                                                   |
| Password grant   | Enabled only in local/CI Supabase config (ADR-006)                                                                                                                                                                                                                                                                                                                                                       |

### Rate limiting (DG-09)

- Postgres fixed-window limiter (`rate_limit_bucket(key, window_start, count)`, upsert-increment, pruned daily) for our auth endpoints, global search, dedupe, file-URL issuance, exports and upload intents. Vercel WAF rules are added on top if P1 is approved (⚠ OWNER O-01).
- No CAPTCHA (owner 2026-10-31, O-13); the rate limits above stay.
- Perf-test token signer (DG-01): build-time flag only, never in production; specified in `docs/perf/plan.md`, referenced by ADR-002.

## Paid services — owner decision 2026-10-31: nothing is bought now

| #   | Item                          | Why                                                                                                               | Decision                                                                                                                                                                                                                                      |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Vercel Pro**                | Hobby allows only daily crons and forbids commercial use; PIPE-05 needs 5-min jobs; longer function duration; WAF | **Bought before launch.** During development: Vercel Hobby + a **free external scheduler** (e.g. cron-job.org) calling the 5-min/hourly `/api/cron/*` endpoints with the dev environment's own `CRON_SECRET`; Vercel Cron runs the daily jobs |
| P2  | **Supabase Pro**              | Free projects pause; custom SMTP; session inactivity timeout (SEC 12 h idle)                                      | **Bought before launch.** Development on the free tier (pausing acceptable)                                                                                                                                                                   |
| P3  | 30-day backup retention (SEC) | Supabase Pro keeps 7 daily backups                                                                                | **Nightly `pg_dump`** (GitHub Actions, encrypted, off-site, 30-day retention; restore tested — devops). No PITR. Storage objects (CVs, polygraph PDFs) are **not** in `pg_dump` ⚠ OWNER (O-03 file backups)                                   |
| P4  | Rate limiting store           | No Redis                                                                                                          | Postgres fixed-window limiter (DG-09); optional Vercel WAF rules once Pro is bought                                                                                                                                                           |
| P5  | Resend plan                   | Daily cap on the free tier                                                                                        | **Start on free**; upgrade when volume requires                                                                                                                                                                                               |
