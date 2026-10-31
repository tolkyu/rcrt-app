# ADR-002 — Authorization model (permissions × scopes, scoped queries, RLS as defence-in-depth)

- **Status:** Accepted
- **Date:** 2026-10-30
- **PRD:** §2 (ROLE-01..06, VIS-01..03), POLY-04, STAT-07/08, SEC
- **Spec:** `docs/authz-matrix.md` (permission codes, scopes, SQL predicates, interfaces)

## Context
- Visibility = role × vertical, plus relationship rules (own, assigned, submitted-to-me, from-stage-X).
- Must be enforced server-side in one module (VIS-01), lists must never leak (VIS-02), every rule tested both ways (VIS-03).
- Custom admin-defined roles later (ROLE-04) without schema rewrite.
- Must be fast: no per-row checks in JS on lists.

## Options
| Option | Pros | Cons |
|---|---|---|
| A. `if (role === …)` checks in services/UI | Quick | Scattered, untestable, violates ROLE-04 |
| **B. Permission codes + scope grants in code; `can()` for single objects, SQL scope predicates for lists** | One place, composable, indexed SQL, custom roles = data | We must keep predicates and `can()` consistent (shared tests) |
| C. Postgres RLS per user as primary enforcement | Enforced at DB | Every transaction needs `set_config(jwt claims)` (extra round-trip through pooler), complex rules (submitted-to-me, from-stage) duplicated in SQL, hard to test/debug, perf risk on 50k seed |
| D. External policy engine (OPA, Cerbos, Oso Cloud) | Powerful | Network hop per check or data sync; extra infra; overkill |

## Decision
**B**, with RLS used only as a coarse safety net.

1. **Permission codes** (`vacancy.read`, `application.move.polygraph`, `bonus.approve`, …) — closed union in `server/authz/permissions.ts`.
2. **Grant = `{ permission, scope }`**. Scope kinds: `GLOBAL`, `VERTICAL`, `VERTICAL_FROM_STAGE(stage)`, `OWN`, `OWN_EARLY` (own + nothing reached `TL_INTERVIEW`, D13), `ASSIGNED`, `UNASSIGNED_OPEN`, `SUBMITTED_TO_ME`. A vertical-bound scope applies only to the verticals where the user holds the role that produced the grant.
3. **Role → Grant[] map in code** for built-in roles (ROLE-04). `user_role.role` is `text` (no pg enum) so a later `role_definition` + `role_permission(permission, scope jsonb)` table adds custom roles additively; the loader merges both sources into the same `Grant[]`.
4. **Per-request `AuthContext`**: JWT verified locally → one query (`app_user` + `user_role` + `app.auth_session_status`) → grants compiled into `Map<Permission, ResolvedGrant[]>`.
   - **JWT contract (DG-02):** `jose` with alg allowlist (ES256/RS256 — the project's asymmetric keys), `iss` = project auth URL, `aud = authenticated`, `exp`/`nbf` checked, clock skew ≤ 30 s, `kid` must be in the cached Supabase JWKS. Roles/verticals are **never** read from claims or `user_metadata`; only from `user_role`.
   - **Session check (DG-05):** the same context query joins `app.auth_session_status` (view over `auth.sessions` exposing only `id, user_id, not_after`; `security_barrier`, owned by the migration executor, migration `0002`) on the JWT `session_id` (`not_after` null or in the future). `app_rw` has `SELECT` on the view only and no access to schema `auth`, so refresh-token, IP and user-agent columns are unreachable (managed Supabase also can't grant `auth` access to custom roles). A missing/ended session ⇒ 401 `SESSION_EXPIRED`, so logout, "end other sessions" and Admin revocation take effect immediately without an extra round-trip. `aal` comes from the verified JWT, not the view. Access-token TTL ≤ 15 min; refresh-token rotation with reuse detection on. 12 h idle timeout = Supabase Pro inactivity timeout, or app-level `last_activity_at` + client idle timer if Pro is not approved (⚠ OWNER O-02); absolute session lifetime ⚠ OWNER (O-09).
   - **Perf-test tokens (DG-01):** a separate signer exists only in a build-time perf build; production accepts Supabase JWKS `kid`s only. Spec: `docs/perf/plan.md`.
   - **Grant merge (DG-10):** grants are kept per producing assignment `(permission, scope, role assignment)`; `can()` and `scopeWhere()` must match scope **and** vertical inside the same grant (no union of vertical lists across roles: `HEAD_RECRUITER@Gambling + RECRUITER@Crypto` is never a Head in Crypto). Every matrix test includes a mixed-role fixture. RSC: wrapped in `React.cache`. Route handlers: resolved once in the `defineRoute` wrapper and passed explicitly; services always receive `ctx` as first argument and never resolve it themselves.
5. **Single object**: repository fetch with the read scope predicate in `WHERE` → no row ⇒ `NotFoundError` (404). Then `can(ctx, action, resource)` for the specific action ⇒ `ForbiddenError` (403) when visible but not allowed.
   **Route gating**: a user with no grant at all for a route's base permission (e.g. Finance on `/vacancies`, HR on `/settings`) gets 404 for both pages and API (page → `notFound()`), so whole sections don't reveal themselves.
6. **Lists, counts, search, autocomplete, calendar, stats, exports, timeline, notifications**: always composed with `scopeWhere(ctx, permission)` (Drizzle `SQL`), never post-filtered.
7. **Field-level**: DTO mappers drop fields the caller lacks (`offer.salary.read`, `polygraph.file.read`, `bonus.read`, BONUS-16 reward). The client never receives a field only to hide it; per-role response-snapshot tests (DG-10).
7a. **Referenced ids (DG-10):** every id in a request body (`vacancyId`, `candidateId`, `teamLeadId`, `hrUserId`, split recipients, mention ids, `templateId`, `locationId`, `reasonCode`, upload `entityId`) is resolved by a scoped fetch or a role-in-vertical check; all input schemas are Zod `.strict()` (no mass assignment of `ownerId`/`sourcerId`/`stage`/`verticalId`); moving an object to another vertical needs write rights in both.
7b. **Role administration (DG-10):** role-assignment and invite endpoints reject granting `ADMIN`/`FINANCE` unless the actor is an aal2 Admin; nobody changes their own roles; all audited.
8. **State rules** (stage order, 30-day probation rule) are not authz; they live in the state machine. Authz answers "may this actor perform action X on this object"; the machine answers "is X valid now".
9. **Verticals are never deactivated** (owner 2026-10-31): no read-only-vertical state, no check for it. **CAND-06**: a candidate belongs to exactly one vertical; candidate scopes are `candidate.vertical_id`-based plus the application scope; transfer between verticals is its own permission (`candidate.transfer_vertical`).
10. **Admin + Finance MFA** (owner 2026-10-31): grants from `ADMIN` and `FINANCE` are added only if JWT `aal = aal2`; otherwise the UI forces MFA enrolment/challenge (API → 401 `MFA_REQUIRED`). Recovery (DG-08): no home-grown recovery codes (Supabase has none natively) — each Admin/Finance user may enrol a **second TOTP factor**, and a lost factor is reset by an Admin (never by themselves) through the Supabase auth admin API (reason required, audited, email to the affected user); at least 2 Admins. MFA for other roles: optional (O-05 decided only for Admin + Finance).
10a. **Middleware is not authorization (DG-17):** `middleware.ts` only refreshes the Supabase session cookie; every check happens in `defineRoute` and in pages/layouts.
10b. **Dedupe (CAND-02) — ⚠ OWNER (block vs warn):** the ERD's **unique** partial indexes on normalised email/phone/Telegram/LinkedIn (company-wide) mean an exact duplicate *cannot be created* (block). That depends on the owner's answer in `docs/OPEN_QUESTIONS.md` (recommendation: block exact matches). If the owner chooses "warn only", the indexes become non-unique and BONUS-05 sourcing credit is protected by the service under a lock instead.
11. **Deactivated user**: context load checks `app_user.is_active`; inactive ⇒ 401 even with a valid JWT (Supabase sessions are also revoked on deactivation).

### RLS (defence-in-depth)
- App tables live in schema `app`, **not exposed** through Supabase PostgREST.
- `ENABLE ROW LEVEL SECURITY` on every table with **no policies for `anon`/`authenticated`** (deny-all), so a leaked anon key reads nothing.
- App connects as dedicated role `app_rw` (not the table owner, `BYPASSRLS`, no DDL); migrations run as a separate role.
- Only RLS policies written: on `realtime.messages` for private broadcast channel authorization (ADR-007).
- Per-user RLS mirroring the matrix: **not in v1**; revisit per table if a security review finds a gap.

## Hot path & budget
- Context: 1 indexed query (`app_user` + `user_role(user_id)` + `app.auth_session_status` → `auth.sessions` PK), < 2 ms; JWKS cached in module scope.
- Scope predicates resolve to `vertical_id = ANY($1)`, `owner_id = $2`, `sourcer_id = $2`, `EXISTS` on indexed FK — composite indexes listed in `docs/authz-matrix.md`.

## Consequences
- (+) One module, matrix-driven tests (each grant → allowed fixture + denied fixture, per role, per scope).
- (+) Custom roles = data, no schema change.
- (−) `can()` (in-memory on a loaded resource) and `scopeWhere()` (SQL) are two implementations of one rule → contract tests run both against the same seeded fixtures and must agree.
- (−) No DB-level per-user protection if app code is wrong → mitigated by: no raw DB access outside repositories, lint rule forbidding repository list methods without a `scope` argument, security review per phase.
