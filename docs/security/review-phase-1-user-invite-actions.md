# Security review — user invitation actions

Date: 2026-11-01. Scope: STORY-ROLE-05-3, ROLE-05, D42/D70; resend, revoke and re-invite from the user drawer. Static review; test execution is coordinated by the orchestrator/QA.

## Findings

| ID | Severity | Evidence | Disposition |
|---|---|---|---|
| SEC-INV-01 | Low, inherited | `server/http/define-route.ts` validates parameters/body before calling the permission-guarded service. A malformed request by a non-Admin may return 400 instead of 404. | Already tracked in T9: permission metadata/check before input validation. Valid action requests are denied without changing data; no target information is exposed by validation. |
| SEC-INV-02 | Info, addressed | `server/services/auth/invite-manage.ts` sends mail after committing the token replacement/new invite. | Engineer added a narrow delivery wrapper: provider refusal, provider exception and URL/template configuration errors all return `delivered: false`. The old link remains invalid and the user remains pending; Admin can retry. No atomicity between PostgreSQL and mail delivery is claimed. |

No Critical, High or Medium findings in the reviewed slice.

## Verified controls

| Control | Evidence / result |
|---|---|
| Admin + app-verified MFA | `targetUserId` calls `requirePermission('settings.users.manage')` before parsing/reading the target. The permission requires GLOBAL + MFA and only Admin holds it. Finance/Head Recruiter gain no grant; mixed-role aal1 Admin grants remain withheld. |
| CSRF and input | All three POST routes use the shared route factory, strict empty-object bodies, bounded target parameters, trusted Origin/CSRF/content-type checks and sanitized errors. Unknown/malformed target IDs reach the same 404 service response when authorized. |
| Token secrecy | `generateInviteToken` uses 32 random bytes; only SHA-256 hashes persist. Tokens travel in the email URL fragment, never the action response/event/audit. Route logs carry operation, actor ID, status and timing, not body or token. |
| Expiry and single use | Rotation sets a new 72-hour expiry. Database CHECK enforces `expires_at = sent_at + 72 h`; acceptance checks expiry again while locked and consumes only the current hash with PENDING status. |
| Resend/revoke versus old-token acceptance | Resend updates the PENDING row's hash; revoke changes its status. Acceptance locks/rechecks the invite and consumes the same hash/status, so an old or revoked link cannot activate the user after those changes commit. A later revoke can legitimately follow a successful resend; these are not mutually exclusive operations. |
| Re-invite serialization | Re-invite locks the user, requires active + never activated + latest invite REVOKED, validates current roles, and inserts a new invite. The partial unique index permits at most one PENDING invite. Prior rows/tokens remain revoked. |
| Active-invitee target guard | Resend and the drawer revoke action require an active, never-activated target through SQL predicates; the revoke option is applied only to the drawer caller. The existing offboarding caller retains unguarded pending-invite revocation after deactivation. |
| Sign-in gates | Pending/revoked users lack `activated_at`; ordinary sign-in eligibility requires active, activated and linked identity. Invite acceptance rechecks current roles and exact verified Google email before activation. |
| Audit and privacy | Changes and allowlisted user events are written in the same transaction. New action payloads contain invite IDs, resend count and role references only; no token, email, name or private-note text. Existing events are not rewritten. |
| Mail failure | Delivery happens outside row locks. `delivered: false` is surfaced to Admin, not treated as delivered success; the new pending token/state remains available for retry. Concurrent mail delivery can finish after another action invalidates its link, but acceptance still enforces the current database state. |

The generic `revokePendingInvites` helper also supports deactivation/session offboarding; its new optional guard defaults off and only the drawer caller opts in. No new user-first lock was added for resend/revoke.

Verdict: **APPROVED for this bounded invitation-action slice**, subject to the orchestrator's final automated checks. D69 email changes, role editing, deactivation/reactivation and hosted configuration drift remain outside this review.
