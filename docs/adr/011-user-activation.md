# ADR-011 — User deactivation and reactivation

- Status: Accepted for T6 slice 9; existing stack and authorization policy retained.
- Date: 2026-11-02
- References: STORY-ROLE-05-5, ROLE-05/06, D24/D44/D45, SEC-AUTH-R04, SEC-ROL-02, ADR-002/006.

## Context and options

The application checks active state and database session ownership on every request. Supabase banning is an additional control. An unchecked ban after the database commit can fail silently or overtake a concurrent reactivation. Calling GoTrue after deleting Auth sessions inside an uncommitted transaction can block its separate database connection.

| Option                                                                     | Assessment                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Unchecked provider call after commit                                       | Rejected: incomplete deactivation is hidden and stale ban/unban requests can race.                                 |
| Persisted reconciliation/outbox                                            | Suitable for later jobs, but unnecessary schema and worker work for this bounded synchronous operation.            |
| Checked provider call under the target user lock, before Auth-table writes | Chosen: serializes both transitions, preserves local access denial when banning fails, and permits explicit retry. |

## Decision

Both actions use Admin-with-verified-MFA permission `settings.users.manage`, strict Zod input and the existing service → repository boundary. `POST /users/{userId}/deactivate` accepts `expectedVersion` and optional reason ≤500 characters; `/reactivate` accepts `expectedVersion` and the selected previous role assignments. Missing/out-of-scope users return 404; stale versions and invalid state return 409.

1. Lock pending invite → user (`FOR NO KEY UPDATE`) → current roles. Validate state/version while locked. Only previously accepted active users can first be deactivated. Never-activated invitations continue through revoke/re-invite actions.
2. Deactivation rejects self, and an ADMIN holder takes the same `lockAdminMembership` transaction advisory lock as role removal before checking another accepted, active ADMIN. Keep this lock through commit. This prevents role-removal/deactivation races across different targets.
3. With the target lock held, call checked `setBanned(authUserId, true|false)` **before** deleting or changing Auth/session rows. Current `app_user.auth_user_id` has no FK into `auth.users`; GoTrue touches Auth tables through another connection. Do not move this call behind uncommitted Auth-table writes.
4. Catch both a `false` provider result and exceptions as incomplete outcomes. Return a result from the transaction; throw the corresponding 503 only **after** that transaction commits, so the DENIED audit and required local denial are not rolled back.

### Deactivate

- Regardless of ban success, atomically set `is_active=false`, `deactivated_at/by`, increment version, revoke pending invites, delete provider sessions and close all app sessions with `DEACTIVATED`. Keep role rows, priorities, identity linkage and `activated_at` unchanged. Write `user.deactivated` and before/after audit once.
- Store optional reason only in the administrator audit record. It must never enter timeline payloads, event PII rows or application logs.
- Ban failure adds a DENIED audit with a stable incomplete reason and returns 503; application access remains disabled. Retrying `/deactivate` on an already-inactive accepted user is allowed only with the **current** matching version. Reconcile the ban and close any newly issued provider sessions without another lifecycle event or version increment. A reason sent with the retry is ignored: the audit keeps the first one. `auth.session_revoked` is written only when sessions were actually ended.
- The partial-failure dialog keeps its input, refetches detail/version and offers retry. A stale original version still returns 409; it is never treated as an idempotency token.

### Reactivate

- Only an inactive, previously accepted user is eligible. Selected assignments must be a subset of current retained assignments; an empty subset is valid. New grants use the existing role editor after activation.
- Unban while holding the same target lock. On failure, keep the user inactive and roles unchanged, commit a DENIED audit and return 503. No success event/version change occurs; retry uses the same unchanged version unless another administrator has edited the user.
- On success, delete any provider sessions and close any app sessions again before enabling the user. This also removes sessions issued during an incomplete-ban period. Old JWTs/refresh tokens never regain access; the user signs in afresh.
- Replace retained roles with the selected subset, clear `deactivated_at/by`, set `is_active=true`, preserve original `activated_at`, increment version, and write `user.reactivated` plus role-removal events for omitted assignments and before/after audit in the same transaction.

## Consequences and verification

- The user lock spans one privileged network call. These low-frequency administrative mutations are not an auth-context hot path. List/detail loading and their indexed queries remain unchanged; no new schema or migration is needed.
- Provider changes cannot roll back with PostgreSQL. If the subsequent database commit fails, a successful ban is fail-closed; a successful unban still leaves an inactive application user. Report failure and retry; never claim distributed atomicity.
- Phase 1 has no work objects. D24 reassignment joins the same deactivation transaction when applications/vacancies/polygraphs/offers ship in Phase 2–3; no fake empty-work abstraction is introduced.
- Tests must cover provider false/throw and retry, state/version/audit persistence after 503, fresh-sign-in requirement after reactivation, all role denials, self/last ADMIN, parallel edits and role-removal versus deactivation, invite/user lock ordering, omitted-role history, and reason privacy. A real local-GoTrue probe should verify the provider-first ordering does not wait on application-held session rows.
