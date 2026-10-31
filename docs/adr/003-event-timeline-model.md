# ADR-003 — Event / timeline model (append-only `entity_event`)

- **Status:** Accepted
- **Date:** 2026-10-30
- **PRD:** HIST-01..03, VAC-04, CAND-04, AUD, ARCH-04, STAT-03

## Context
- Every change must produce an immutable, human-readable timeline entry on vacancy/candidate/application cards.
- Events are append-only (HIST-03) **but** GDPR purge (ARCH-04) must remove PII.
- Audit (AUD) needs IP, user agent, before/after for every write, admin-only.
- Timelines are read on every card open (budget < 100 ms).

## Options
| Option | Pros | Cons |
|---|---|---|
| A. Full event sourcing (state rebuilt from events) | Perfect history | Heavy, slow reads, overkill |
| **B. State tables + append-only `entity_event` written in the same transaction** | Simple reads, guaranteed consistency | Two writes per change |
| C. Derive timeline from `audit_log` | One table | Mixes technical/user-facing data, visibility and retention differ |
| D. DB triggers generate events | Can't be bypassed | No actor intent/context (reason, forced flag), hard to localise |

## Decision
**B.** Services write state + `entity_event` (+ `audit_log`) in one transaction via `events.append(tx, draft)`.

### `entity_event` (user-facing timeline)
| Column | Notes |
|---|---|
| `id` | `bigint identity` (monotonic tiebreak) |
| `occurred_at` | `timestamptz`, from injected clock |
| `actor_id` | `app_user.id`, null = system |
| `actor_kind` | `USER` \| `SYSTEM` \| `ADMIN_FORCE` |
| `type` | dotted lowercase `<entity>.<verb_past>` (e.g. `application.stage_changed`, `user.invited`) — the only allowed style; DB CHECK regex `^[a-z_]+\.[a-z_]+$` (catalog below) |
| `vertical_id`, `vacancy_id`, `candidate_id`, `application_id` | correlation columns (nullable) so one event appears on every relevant card without joins |
| `subject_type`, `subject_id` | the row that changed (`interview`, `offer`, `bonus_tranche`, `file_object`, …) |
| `payload` | `jsonb`, versioned (`v`), **no direct identifiers and no free text** — ids, enums, dates, amounts, `{field, old, new}` for non-PII fields |
| `sensitivity` | `GENERAL` \| `SALARY` \| `POLYGRAPH` \| `BONUS` — read-time redaction class |

### `entity_event_pii` (purgeable side table, 1:1) — owner-confirmed 2026-10-31 (Q-38 option а)
- `event_id` PK/FK, `data jsonb`: PII diffs (name/email/phone/Telegram/URLs old→new), free text (comments, reasons' comments, feedback, screening notes, TL summary).
- Readable under the same rules as its event; deleted only by the Admin purge procedure (`app_purge` role).

### Immutability (HIST-03, DG-17)
- `REVOKE UPDATE, DELETE, TRUNCATE` on `entity_event` **and `audit_log`** from `app_rw`; `BEFORE UPDATE OR DELETE` trigger raises on both.
- `entity_event_pii`: `DELETE` only for `app_purge`; no `UPDATE`. `audit_log`: column-level `UPDATE (before, after)` only for `app_purge`.
- Purge runs **only** through `app.purge_candidate(candidate_id, actor_id, reason)` — a `SECURITY DEFINER` function owned by `app_purge` with a fixed `search_path`; `app_rw` holds `EXECUTE` only. The app has no `app_purge` credentials, and `app_rw` is neither a member of `app_purge` nor a table owner.

### Event type catalog (initial)
`vacancy.created|updated|status_changed|recruiter_assigned|recruiter_unassigned|bonus_amount_changed|cloned|deleted|restored` (`bonus_amount_changed`: `{old, new}` money in payload, `sensitivity=BONUS`, reason in `entity_event_pii`; BONUS-16) · `candidate.created|updated|merged|vertical_transferred|deleted|restored|purged|file_uploaded` (`vertical_transferred`: `{fromVerticalId, toVerticalId, newOwnerId}`, CAND-06) · `application.created|stage_changed|tl_accepted|tl_declined|routed|reactivated|owner_reassigned|bonus_split_set|moved_back|force_moved` · `interview.scheduled|updated|reschedule_requested|reschedule_countered|reschedule_confirmed|completed|no_show` · `polygraph.assigned|scheduled|result_recorded|reviewed|retake_requested` (payload carries `attemptNo`; `reviewed.decision` = CONFIRMED / NOT_CONFIRMED / REJECTED) · `offer.drafted|sent|email_delivered|email_failed|accepted|declined|expired|superseded` · `probation.started|passed|failed|shortened` · `bonus.snapshot_created|tranche_status_changed|adjusted` · `comment.added` · `user.invited|invite_resent|invite_revoked|invite_accepted|activated|deactivated|reactivated|profile_updated|role_assigned|role_removed|mfa_reset` · `vertical.created|renamed` · `settings.updated`.

### Reading
- Card timeline: `WHERE candidate_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 50` (+ cursor). Same for `vacancy_id`, `application_id`. Indexes: `(candidate_id, occurred_at DESC, id DESC)`, `(vacancy_id, …)`, `(application_id, …)`, `(type, occurred_at)` for reconcile.
- Visibility: the caller must be able to read the card (scoped fetch). Events are additionally filtered/redacted by `sensitivity` vs permissions (`offer.salary.read`, `polygraph.file.read`, `bonus.read`); events of applications the caller cannot read are excluded via the application scope predicate (a candidate card shows only visible applications' events). ⚠ OPEN: should HR (from Polygraph on) and TL (submitted-to-me) see earlier events of a visible application (screening notes, previous TL's feedback on a routed candidate)? Default implemented: full history of every visible application; the routed-from application is shown only as a link label unless the caller can read it.
- Actor names: join `app_user` (users are never purged).
- Stepper (HIST-02) is derived from current state tables, not from events.

### `audit_log` (separate, admin-only, append-only)
- Every write: actor, IP, user agent, action, entity, `before`/`after` (row diff), request id, **`candidate_id` correlation column** (DG-20) so purge finds every related row (applications, interviews, offers, files…), not only the candidate row. Written by the same service call.
- Login history: `auth.login_succeeded` / `auth.login_failed` / `auth.session_revoked` entries in `audit_log.action` (same dotted style).
- **Naming rule (one style everywhere):** `entity_event.type` and `audit_log.action` are dotted lowercase. Phase-1 stories must change: `LOGIN_SUCCEEDED`→`auth.login_succeeded`, `LOGIN_FAILED`→`auth.login_failed`, `SESSION_REVOKED`→`auth.session_revoked`, `MFA_RESET`→`user.mfa_reset`, `USER_INVITED`→`user.invited`, `INVITE_ACCEPTED`→`user.invite_accepted`, `USER_ACTIVATED`→`user.activated`, `INVITE_RESENT`→`user.invite_resent`, `INVITE_REVOKED`→`user.invite_revoked`, `USER_DEACTIVATED`→`user.deactivated`, `USER_REACTIVATED`→`user.reactivated`, `USER_PROFILE_UPDATED`→`user.profile_updated`, `VERTICAL_CREATED`→`vertical.created`, `VERTICAL_RENAMED`→`vertical.renamed`, `ROLE_ASSIGNED`→`user.role_assigned`, `ROLE_REMOVED`→`user.role_removed`, `MFA_ENROLLED`→`user.mfa_enrolled`, `MFA_CHALLENGE_FAILED`→`auth.mfa_challenge_failed`, `LOGOUT`→`auth.logged_out`, `TL_PRIORITY_CHANGED`→`vertical.tl_priority_changed`.
- Also audited (DG-21): every export (who, section, filters, row count), file-URL issuance (ADR-005), security events (refused Admin calls, aal failures, hidden dedupe matches, MFA resets, role changes, restores, purges, force moves, bonus approvals/payouts). Salary-bearing offer detail **reads** as async audit rows (`after()`) ⚠ OWNER (O-12, incl. IP/UA retention period).
- Exfiltration alerts (DG-21): volume thresholds per user (e.g. > 50 file URLs/hour, > 5 exports/day) → Admin notification; thresholds in `app_setting`.

### Purge (ARCH-04, DG-20)
- One procedure (`app.purge_candidate`) driven by a checklist generated from schema metadata: every column tagged `pii` (Drizzle column comment) is nulled/anonymised — `candidate` fields, normalised dedupe keys, search text, `comment` bodies, interview/reschedule notes, `offer.additional_terms`, `entity_event_pii` rows, `audit_log.before/after` by `candidate_id`, filenames; Storage objects deleted (ADR-005). Stub `Candidate #1234 (purged)` keeps statistics and bonus integrity.
- `purge_log(candidate_id, purged_at, actor_id)` (no PII) is the purge ledger; **after any backup restore, every `purge_log` entry is re-applied** before the app is reopened (devops runbook). Off-site dumps are encrypted (devops).
- Test: after purging a seeded candidate, no seeded PII string remains in any table or bucket.

## Hot path & budget
- One indexed range scan per timeline page (≤ 50 rows) + one batched `IN` lookup for `entity_event_pii` → < 20 ms on 200k events. No partitioning needed until ~10M rows.

## Consequences
- (+) Timelines consistent with state (same transaction); purge works without breaking immutability of the main table.
- (+) Statistics reconcile can replay `application.stage_changed` (ADR-008).
- (−) Writers must split PII/free text into the side table → `events.append` takes `{ payload, pii }` separately and the Zod schema per event type forbids PII keys in `payload`.
