# Authorization matrix — permission codes × roles × scopes

Owner decisions of 2026-10-31 applied: CAND-06 (one vertical per candidate + transfer), no vertical deactivation, Head Recruiter can earn bonuses (actor ≠ beneficiary confirmed), mandatory Head HR polygraph review, MFA for Admin + Finance, Q-15 / Q-17 / Q-23.
Source: PRD §2.3 (VIS-01..03), §2.2 (ROLE-01..06), CAND-06, POLY-04, OFFER-01, PROB-02..04, PIPE-06, BONUS-05/12/13, STAT-07/08, ARCH-01..05. Design: ADR-002.

## 1. Scope legend

| Code   | Scope kind                       | Meaning                                                                                                                                                                                                                                                                                                                                              | Vertical-bound                              |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `G`    | `GLOBAL`                         | Everything                                                                                                                                                                                                                                                                                                                                           | No (role has `vertical_id = null`)          |
| `V`    | `VERTICAL`                       | Object's `vertical_id` ∈ verticals where the user holds the granting role                                                                                                                                                                                                                                                                            | Yes                                         |
| `V≥P`  | `VERTICAL_FROM_STAGE(POLYGRAPH)` | In vertical **and** application `max_stage_reached ≥ POLYGRAPH` (stays visible after later rejection)                                                                                                                                                                                                                                                | Yes                                         |
| `own`  | `OWN`                            | Vacancy: `team_lead_id = me` only — a previous Team Lead, even the creator, loses every right after reassignment (D67) · Application: `owner_id = me` or `sourcer_id = me` · Candidate: `sourcer_id = me`, `owner_id = me` (set by CAND-06 transfer) or owner of any of its applications · Bonus: `recipient_id = me` · Stats: subject column `= me` | Yes (still limited to the role's verticals) |
| `ownN` | `OWN_INITIATED_NEW`              | Vacancy only: `created_by = me` **and** recruiter-initiated **and** no application got past `NEW` (`max_stage_reached ≤ NEW`) (D13, D65). Recruiters never delete candidates (D65)                                                                                                                                                                   | Yes                                         |
| `asg`  | `ASSIGNED`                       | Vacancy has `vacancy_recruiter(user_id = me)`                                                                                                                                                                                                                                                                                                        | Yes                                         |
| `uo`   | `UNASSIGNED_OPEN`                | Vacancy `status = OPEN` with no assigned recruiters (D1)                                                                                                                                                                                                                                                                                             | Yes                                         |
| `sub`  | `SUBMITTED_TO_ME`                | Application on a vacancy with `team_lead_id = me` and `max_stage_reached ≥ SUBMITTED_TO_TL`; candidate/offer/probation via such an application                                                                                                                                                                                                       | Yes                                         |
| —      | none                             | No grant → 404 (object) / 404 (whole route if no grant at all)                                                                                                                                                                                                                                                                                       |                                             |

Roles: **ADM** Admin · **HREC** Head Recruiter · **REC** Recruiter · **HHR** Head HR · **HR** HR · **TL** Team Lead · **FIN** Finance.
`⚠` in a cell = ⚠ OPEN: the PRD doesn't name this actor for this action; the value shown is the working default, waiting for the owner (listed in the architect's hand-off and `docs/OPEN_QUESTIONS.md`).
Several cells in one column (e.g. `asg`+`uo`) = union. A user with several role assignments gets the union of all grants (ROLE-01/02).

## 2. Permission catalog

### 2.1 Vacancies

| Permission                                                                 | ADM | HREC | REC      | HHR | HR  | TL    | FIN | PRD                     |
| -------------------------------------------------------------------------- | --- | ---- | -------- | --- | --- | ----- | --- | ----------------------- |
| `vacancy.read` (a `DRAFT`: author only ᵇ)                                  | G   | V    | asg + uo | V   | V   | own   | —   | §2.3, D1, D92           |
| `vacancy.create`                                                           | G   | V    | V ¹      | —   | —   | V ²   | —   | VAC-03                  |
| `vacancy.update` (incl. «Терміновість вакансії», see ᵃ)                    | G   | V    | —        | —   | —   | own ⚠ | —   | VAC-01, VAC-08, D94     |
| `vacancy.assign_recruiters`                                                | G   | V    | —        | —   | —   | —     | —   | §2.1, owner 2026-10-31  |
| `vacancy.self_assign`                                                      | —   | —    | uo       | —   | —   | —     | —   | D1, owner 2026-10-31    |
| `vacancy.team_lead.set`                                                    | G   | V ⚠  | —        | —   | —   | —     | —   | VAC-03                  |
| `vacancy.approve` (DRAFT→OPEN) — unused; publish = author only ᵇ           | G   | V ⚠  | —        | —   | —   | —     | —   | inert, D89, D92         |
| `vacancy.hold` / `vacancy.resume`                                          | G   | V    | —        | —   | —   | own ⚠ | —   | VAC-02                  |
| `vacancy.cancel`                                                           | G   | V    | —        | —   | —   | own ⚠ | —   | VAC-02                  |
| `vacancy.reopen` (FILLED→OPEN)                                             | G   | V    | —        | —   | —   | —     | —   | VAC-02                  |
| `vacancy.delete`                                                           | G   | V    | ownN     | —   | —   | —     | —   | §2.3, D13, D65, ARCH-03 |
| `vacancy.priority.override` («Пріоритет тімліда для цієї вакансії»)        | G   | —    | —        | —   | —   | —     | —   | ROUTE-01, D94 ᵃ         |
| `vacancy.bonus_scheme.override`                                            | G   | —    | —        | —   | —   | —     | —   | VAC-01, BONUS-01        |
| `vacancy.bonus.update` (recruiter reward amount + currency on the vacancy) | G   | —    | —        | —   | —   | —     | —   | BONUS-16 ⁵              |
| `vacancy.probation_length.set`                                             | G   | —    | —        | V   | —   | —     | —   | PROB-02                 |
| `position.manage`                                                          | G   | V    | —        | —   | —   | —     | —   | D76, ADR-013            |
| `position.read` (catalog lists for forms/filters)                          | G   | V    | V        | V   | V   | V     | —   | D76, D90, ADR-013       |

¹ Recruiter-initiated (no TL); created `OPEN` or saved as the author's `DRAFT` (D89); the creator is auto-assigned so it is visible via `asg`. ² `team_lead_id = self`, status always `OPEN` (D87); D2 approval is superseded by D89, so `vacancy.approve` stays defined but unused: a draft is published by its author only (D92).
ᵃ Two separate concepts (D94): **«Терміновість вакансії»** (Звичайна/Термінова flag, VAC-01) is changed through `vacancy.update` by Head Recruiter/Admin only — a Team Lead may not change it after the request (VAC-08, D90); **«Пріоритет тімліда»** (П0, П1…; per-vacancy override `vacancy.priority.override`, Admin only) only orders Team Leads for candidate routing (ROUTE-01). Neither implies the other.
ᵇ **Draft rule (D92):** while a vacancy is `DRAFT`, every action on it (`vacancy.read`, `vacancy.update`, publish `DRAFT → OPEN`, `vacancy.cancel` `DRAFT → CANCELLED` (D82), `vacancy.delete`, search by `V-NNNN`, counts, statistics, shared link) is allowed **only to the author** (`created_by = me`) and still needs `vacancy.create` in the draft's vertical; the role/vertical grants of the other columns (including Admin `G` and Head Recruiter `V`) do **not** apply to a `DRAFT`. Everyone else gets 404 (no existence disclosure). A draft whose author is deactivated or has lost the role stays hidden for everyone and returns to the author on reactivation/role restore (D98); there is no Admin/Head Recruiter action on someone else's draft (no read, delete, restore or purge of metadata) — only the author deletes their own draft. A draft is not open work for D24/D43. Publish re-validates the full `OPEN` rules at publish time.
Urgency at creation: any authorised creator (Admin, Head Recruiter, Recruiter) may set «Терміновість вакансії» when creating; changing it afterwards is `vacancy.update` (Head Recruiter, Admin) (D100). A Head Recruiter/Admin creator is an ASSIGNER and is not auto-assigned; only a Recruiter creator is (D102). Self-assignment (D103): a Head Recruiter may assign himself as executor in a vertical he heads through `vacancy.assign_recruiters` (no Recruiter role needed, no new permission, `assigned_by = user_id`); an Admin may not (not offered in the picker, 403 by API); other executors are active Recruiters of the vertical. Role constraints (owner 2026-11-09): Admin and Finance are single-role users (D105, D107) and a Head Recruiter heads exactly one vertical and needs no Recruiter role (D104, D106); HR, Head HR, Team Lead and Recruiter may hold several verticals (D108) — so the Admin and Finance columns never combine with another role for one user and `V` for a Head Recruiter is always one vertical; enforcement in user management is queued, not built (D109). Drafts write no audit row; publish writes one with author and original creation date (D101). Implementation (V2b S1): the full create form needs `vacancy.create` **and** a recruiting-side grant in the vertical (`vacancy.assign_recruiters` — Admin, Head Recruiter — or `vacancy.self_assign` — Recruiter), because a Team Lead's `vacancy.create` is the request path only (D87); `teamLeadId` needs `vacancy.team_lead.set`, `probationDays` needs `vacancy.probation_length.set` (403 otherwise). One SQL predicate (`vacancyReadWhere`) applies ᵇ to every vacancy read; `can()` also denies every permission on another user's DRAFT, GLOBAL grants included.
Clone (VAC-05) = `vacancy.read` on source **and** `vacancy.create` in the vertical (no separate code).
⁵ Permission only says _who_. The "at most one change per 2 months per vacancy" limit is a domain rule (`server/domain/bonus/` `vacancyRewardChangeAllowed`) enforced in the service → 409 `VACANCY_BONUS_CHANGE_TOO_SOON`, never only in the UI. Reason is mandatory. ⚠ OPEN edge rules: does the first set count; calendar months vs. 60 days; 24 h typo-fix window. Who sees the amount follows `vacancy.read` ⚠ OPEN (whether TL/HR may see the recruiter reward; default: same as `bonus.read` holders + Admin).

### 2.2 Candidates & files

| Permission                                                                                                  | ADM | HREC       | REC | HHR          | HR  | TL  | FIN | PRD                                                                      |
| ----------------------------------------------------------------------------------------------------------- | --- | ---------- | --- | ------------ | --- | --- | --- | ------------------------------------------------------------------------ |
| `candidate.read`                                                                                            | G   | V ³        | own | V≥P          | V≥P | sub | —   | §2.3, CAND-06                                                            |
| `candidate.contacts.read` (email, phone, Telegram ⁸)                                                        | G   | V          | own | V≥P          | V≥P | —   | —   | Q-17                                                                     |
| `candidate.transfer_vertical`                                                                               | G   | V (source) | —   | V≥P (source) | —   | —   | —   | CAND-06 ⁹                                                                |
| `candidate.create`                                                                                          | G   | V          | V   | —            | —   | —   | —   | §2.3                                                                     |
| `candidate.update` (profile fields)                                                                         | G   | V          | own | —            | —   | —   | —   | CAND-01 ⚠                                                                |
| `candidate.bonus_flags.set` (set former-employee flag CAND-05, `referrer_user_id` / self-referral BONUS-05) | G   | V          | own | —            | —   | —   | —   | D66 ⁶                                                                    |
| `candidate.bonus_flags.clear` (clear any of those flags; reason mandatory, audited)                         | G ⁷ | —          | —   | —            | —   | —   | —   | D66 ⁶                                                                    |
| `candidate.file.read` (CV, attachments)                                                                     | G   | V          | own | V≥P          | V≥P | sub | —   | CAND-04                                                                  |
| `candidate.file.upload`                                                                                     | G   | V          | own | —            | —   | —   | —   | CAND-01                                                                  |
| `candidate.merge`                                                                                           | G   | V          | —   | —            | —   | —   | —   | CAND-02                                                                  |
| `candidate.delete`                                                                                          | G   | V          | —   | —            | —   | —   | —   | §2.3, D65 (recruiters reject instead; the candidate goes to the archive) |
| `archive.deleted.read`                                                                                      | G   | V          | —   | —            | —   | —   | —   | ARCH-01                                                                  |
| `archive.restore`                                                                                           | G   | V          | —   | —            | —   | —   | —   | §2.3                                                                     |
| `candidate.purge`                                                                                           | G   | —          | —   | —            | —   | —   | —   | ARCH-04/05                                                               |
| `comment.create`                                                                                            | G   | V          | own | V≥P          | V≥P | sub | —   | CAND-04 ⚠                                                                |

³ CAND-06: a candidate belongs to exactly one vertical (`candidate.vertical_id`), and all of its applications are in that vertical. Candidate in vertical = `candidate.vertical_id ∈ V`.
⁸ Q-17 (owner): TL never receives contact fields; HR/HHR do. ⚠ OWNER: whether LinkedIn/portfolio URLs count as contacts (default: yes, hidden from TL). Conflict: CV files contain contacts, but TL has `candidate.file.read` — flagged to the owner.
⁹ CAND-06 transfer: the actor needs the role in the **source** vertical; blocked while any active application exists (409 `CANDIDATE_HAS_ACTIVE_APPLICATIONS`); `sourcer_id` unchanged; the new `candidate.owner_id` (a REC/HREC of the target vertical) is picked in the dialog; timeline event `candidate.vertical_transferred`. ⚠ OWNER: all four defaults are pending confirmation (does the target vertical also need a role?). Dedupe stays company-wide.

### 2.3 Applications & pipeline (actions map 1:1 to `docs/pipeline-state-machine.md`)

| Permission                                                                  | ADM | HREC | REC   | HHR | HR  | TL  | FIN | PRD                                   |
| --------------------------------------------------------------------------- | --- | ---- | ----- | --- | --- | --- | --- | ------------------------------------- |
| `application.read`                                                          | G   | V    | own   | V≥P | V≥P | sub | —   | §2.3                                  |
| `application.create` (add / propose / submit to position)                   | G   | V    | V ⁴   | —   | —   | —   | —   | CAND-03, ROUTE-02/08                  |
| `application.reactivate`                                                    | G   | V    | own ⚠ | —   | —   | —   | —   | ARCH-01                               |
| `application.move.in_work`                                                  | G   | V    | own   | —   | —   | —   | —   | §6.1                                  |
| `application.move.submitted_to_tl`                                          | G   | V    | own   | —   | —   | —   | —   | §6.1                                  |
| `application.tl_decision` (accept/decline)                                  | G   | — ⚠  | —     | —   | —   | sub | —   | §6.1 #3                               |
| `application.move.tl_interview`                                             | G   | V    | own   | —   | —   | —   | —   | §6.1 #4                               |
| `application.interview.manage` (edit, confirm/counter reschedule, no-show)  | G   | V    | own   | —   | —   | —   | —   | RESCH-02/04                           |
| `application.interview.reschedule_request`                                  | G   | —    | —     | —   | —   | sub | —   | RESCH-01                              |
| `application.move.polygraph` (TL interview Pass)                            | G   | V    | own   | —   | —   | sub | —   | §6.1 #5, §2.3 "up to Polygraph"       |
| `application.interview.reject` (TL interview Reject)                        | G   | V    | own   | —   | —   | sub | —   | §6.1 #4                               |
| `application.reject.recruiting` (from NEW…TL_INTERVIEW)                     | G   | V    | own   | —   | —   | —   | —   | §6.1 ✖                                |
| `application.reject.hr` (from POLYGRAPH, OFFER)                             | G   | V ⚠  | —     | V   | V   | —   | —   | §6.1 ✖                                |
| `application.withdraw` (NEW…OFFER)                                          | G   | V    | own   | —   | —   | —   | —   | §6.1 ✖                                |
| `application.move_back.recruiting` (from IN_WORK…TL_INTERVIEW)              | G   | V    | —     | —   | —   | —   | —   | PIPE-06                               |
| `application.move_back.hr` (from POLYGRAPH, OFFER)                          | G   | V ⚠  | —     | V   | —   | —   | —   | PIPE-06                               |
| `application.force_move`                                                    | G   | —    | —     | —   | —   | —   | —   | PIPE-02                               |
| `application.reassign_owner`                                                | G   | V ⁷  | —     | —   | —   | —   | —   | BONUS-05, ROLE-06                     |
| `application.bonus_split.set`                                               | G ⁷ | V ⁷  | —     | —   | —   | —   | —   | BONUS-05                              |
| `polygraph.assign`                                                          | G   | —    | —     | V   | —   | —   | —   | POLY-01                               |
| `polygraph.assign.self`                                                     | —   | —    | —     | —   | V   | —   | —   | POLY-01                               |
| `polygraph.schedule`                                                        | G   | —    | —     | V   | V   | —   | —   | POLY-02                               |
| `polygraph.result.record`                                                   | G   | — ⚠  | —     | V   | V   | —   | —   | POLY-03                               |
| `polygraph.review` (confirm / not confirmed / retake / reject after review) | G   | —    | —     | V   | —   | —   | —   | POLY-05 (mandatory, owner 2026-10-31) |
| `polygraph.file.read`                                                       | G   | —    | —     | V≥P | V≥P | —   | —   | POLY-04, D3                           |
| `offer.read` (offer status/terms)                                           | G   | V    | own   | V≥P | V≥P | sub | —   | §2.3                                  |
| `offer.salary.read`                                                         | G   | V    | own   | V≥P | V≥P | sub | —   | §2.3 "Offer salary"                   |
| `offer.draft`                                                               | G   | —    | —     | V   | V   | —   | —   | OFFER-01                              |
| `offer.send`                                                                | G   | —    | —     | V   | —   | —   | —   | OFFER-01                              |
| `offer.outcome.record`                                                      | G   | —    | —     | V   | V   | —   | —   | OFFER-03                              |
| `application.move.probation` (confirm first day)                            | G   | —    | —     | V   | V   | —   | —   | PROB-01                               |
| `probation.length.set` (offer level, before start)                          | G   | —    | —     | V   | —   | —   | —   | PROB-02                               |
| `probation.pass` (guard: ≥ 30 days)                                         | G   | — ⚠  | —     | V   | —   | sub | —   | PROB-03                               |
| `probation.pass.override` (< 30 days, comment)                              | G   | —    | —     | V   | —   | —   | —   | PROB-03                               |
| `probation.fail`                                                            | G   | — ⚠  | —     | V   | —   | sub | —   | PROB-04                               |

⁴ Recruiter needs `candidate.read` on the candidate and `vacancy.read` on the target vacancy (submit-to-position: the routing group's vertical).
Interview/polygraph/offer/probation sub-objects are always read through `application.read` (calendar = interviews and polygraphs of readable applications).

### 2.4 Bonuses

| Permission                                             | ADM | HREC  | REC | HHR | HR  | TL  | FIN                   | PRD            |
| ------------------------------------------------------ | --- | ----- | --- | --- | --- | --- | --------------------- | -------------- |
| `bonus.read`                                           | G   | V     | own | —   | —   | —   | —                     | §2.3, BONUS-14 |
| `bonus.approve` (ELIGIBLE→APPROVED)                    | G ⁷ | V ⁷   | —   | —   | —   | —   | —                     | §9.3           |
| `bonus.hold` / `bonus.release`                         | G ⁷ | V ⚠ ⁷ | —   | —   | —   | —   | —                     | §9.3           |
| `bonus.mark_paid` (bulk)                               | G ⁷ | —     | —   | —   | —   | —   | —                     | §9.3, BONUS-13 |
| `bonus.clawback.settle` (CLAWBACK_PENDING→CLAWED_BACK) | G   | —     | —   | —   | —   | —   | —                     | BONUS-08 ⚠     |
| `bonus.adjust`                                         | G ⁷ | —     | —   | —   | —   | —   | —                     | BONUS-12       |
| `bonus.self_referral.approve`                          | G ⁷ | —     | —   | —   | —   | —   | —                     | BONUS-05       |
| `bonus.payout_report.read` / `.export`                 | G   | V ⚠   | —   | —   | —   | —   | G (inside Statistics) | BONUS-13       |

⁶ D66 (owner 2026-10-31): setting a bonus-relevant flag only ever blocks a bonus, so the own Recruiter and the Head Recruiter may set it; **clearing** unblocks a bonus, so it is Admin-only (aal2), with a mandatory reason, audited and shown on the bonus approval screen. Head HR holds neither. `clear` also carries the self-benefit guard (footnote 7) as defence in depth.
⁷ **Actor ≠ beneficiary** (DG-19), **owner-confirmed 2026-10-31**: a Head Recruiter can be sourcer/owner and earn bonuses, and nobody approves their own bonus. Another HREC of the vertical, or an Admin, approves. The permission alone isn't enough: the actor must not be the tranche recipient (approve, hold/release, mark paid, adjust, self-referral approval) or a split recipient; for `candidate.bonus_flags.clear` the beneficiaries are the candidate's sourcer and owner plus the owners, sourcers and split recipients of all its applications. Reassigning an owner to yourself needs another HREC or an Admin; split and reassign check the old **and** new beneficiaries. Code: these permissions are excluded from `can`/`assertCan` at type level and checked only with `canActOn`/`assertCanActOn(ctx, permission, resource, incoming)` (SEC-CORE-04). Enforced in the service → 403 `SELF_BENEFIT_FORBIDDEN`, plus DB CHECKs (`approved_by <> recipient_id`, `paid_by <> recipient_id`). Bulk mark-paid skips the actor's own rows. Needs ≥ 2 Admins. ⚠ OWNER: a vertical with a single HREC depends on Admin approval.

### 2.5 Statistics (STAT-07/08)

| Permission                                                                                 | ADM | HREC | REC                  | HHR | HR                 | TL                   | FIN |
| ------------------------------------------------------------------------------------------ | --- | ---- | -------------------- | --- | ------------------ | -------------------- | --- |
| `statistics.funnel.read` (funnel, conversion, time, sources, TL metrics, who-brought-whom) | G   | V    | own (`recruiter_id`) | —   | —                  | own (`team_lead_id`) | G   |
| `statistics.hr.read` (polygraph/offer/probation stages)                                    | G   | V    | —                    | V   | own (`hr_user_id`) | —                    | G   |
| `statistics.bonus.read`                                                                    | G   | V    | own (`recruiter_id`) | —   | —                  | —                    | G   |
| `statistics.export` (same scope as the section read)                                       | G   | V    | own                  | V   | own                | own                  | G   |

Finance rows (Q-23, owner): candidate-level rows in payout reports / who-brought-whom show **only the candidate's full name + application ID** (purged → stub). No contacts, no other candidate fields, no links to cards. Counts follow Q-15: only objects the viewer can open (ADR-008).

### 2.6 Settings, users, audit (Admin only — §2.3 last row)

`settings.verticals.manage` (create/rename only — no deactivation, owner 2026-10-31) · `settings.vertical_flags.manage` (approval flag inert since D89; auto-routing ROUTE-09) · `settings.users.manage` (invite, roles, deactivate) · `settings.priorities.manage` (ROUTE-01) · `settings.bonus_schemes.manage` · `settings.reference_data.manage` (rejection reasons, polygraph locations, offer templates) · `settings.retention.manage` · `settings.jobs.run` (manual job re-run, aal2, ADR-004 DG-04) · `audit.read` — **ADM `G` only**. aal2 is derived from the grant, not the role (SEC-CORE-09): every `G` grant and every MFA-flagged permission (all `settings.*`, `audit.read`, `candidate.purge`, `candidate.bonus_flags.clear`, Admin-only bonus writes, `application.force_move`, vacancy bonus/priority overrides) is withheld until the session is aal2 — so ADMIN and FINANCE need MFA (owner 2026-10-31). Only ADMIN and FINANCE may be assigned without a vertical; a global custom role is ignored. Granting `ADMIN`/`FINANCE` and any self role change are refused (DG-10).
`user.directory.read` (pickers, mentions): all roles except FIN, `V` (users holding a role in my verticals). `vertical.read` (vertical lists, filters; STORY-VIS-02-1, added in T3): ADM `G`, every vertical role `V` (verticals where I hold a role), FIN — (404, FIN-03). Pickers return only users holding the **required** role in that vertical (e.g. split recipients = REC/HREC, `hrUserId` = HR/HHR) (DG-10).

## 3. Scope → SQL predicate (repository `WHERE`)

`:me` = user id, `:V` = vertical ids of the granting role(s). Several grants ⇒ predicates `OR`-ed. No grant ⇒ `false`. `GLOBAL` ⇒ `true`.

| Resource      | Scope           | Predicate                                                                                                                                                                                             | Index                                                                                                                                 |
| ------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| vacancy       | V               | `v.vertical_id = ANY(:V)`                                                                                                                                                                             | `vacancy(vertical_id, status, updated_at DESC, id DESC) WHERE LIVE` (IDX-23)                                                          |
| vacancy       | asg             | `v.vertical_id = ANY(:V) AND EXISTS (SELECT 1 FROM vacancy_recruiter vr WHERE vr.vacancy_id = v.id AND vr.user_id = :me)`                                                                             | `vacancy_recruiter(user_id, vacancy_id)`                                                                                              |
| vacancy       | uo              | `v.vertical_id = ANY(:V) AND v.status = 'OPEN' AND NOT EXISTS (SELECT 1 FROM vacancy_recruiter vr WHERE vr.vacancy_id = v.id)`                                                                        | `vacancy_recruiter(vacancy_id)`                                                                                                       |
| vacancy       | own             | `v.vertical_id = ANY(:V) AND v.team_lead_id = :me` (D67)                                                                                                                                              | `vacancy(team_lead_id)`                                                                                                               |
| vacancy       | ownN            | `v.vertical_id = ANY(:V) AND v.created_by = :me AND v.recruiter_initiated AND NOT EXISTS (SELECT 1 FROM application a WHERE a.vacancy_id = v.id AND a.max_stage_reached > 'NEW')` (D13, D65)          | `vacancy(created_by)`, `application(vacancy_id)`                                                                                      |
| application   | V               | `a.vertical_id = ANY(:V)`                                                                                                                                                                             | board: `application(vertical_id, stage, stage_entered_at DESC, id DESC) WHERE ACTIVE` (ERD IDX-01); lists/archive: IDX-08/09/13       |
| application   | V≥P             | `a.vertical_id = ANY(:V) AND a.max_stage_reached >= 'POLYGRAPH'` (ordinal smallint)                                                                                                                   | `application(vertical_id, max_stage_reached)`                                                                                         |
| application   | own             | `a.vertical_id = ANY(:V) AND (a.owner_id = :me OR a.sourcer_id = :me)`                                                                                                                                | `application(owner_id, stage, stage_entered_at DESC, id DESC)` (IDX-02), `application(sourcer_id, created_at DESC, id DESC)` (IDX-12) |
| application   | sub             | `a.vertical_id = ANY(:V) AND a.team_lead_id = :me AND a.max_stage_reached >= 'SUBMITTED_TO_TL'`                                                                                                       | `application(team_lead_id, stage, stage_entered_at DESC, id DESC)` (IDX-03)                                                           |
| candidate     | V               | `c.vertical_id = ANY(:V)` (CAND-06)                                                                                                                                                                   | `candidate(vertical_id, last_activity_at DESC, id DESC) WHERE LIVE` (IDX-14)                                                          |
| candidate     | own / V≥P / sub | `c.vertical_id = ANY(:V) AND (` `c.sourcer_id = :me OR c.owner_id = :me` (own only) `OR EXISTS (SELECT 1 FROM application a WHERE a.candidate_id = c.id AND <application predicate for same scope>))` | `application(candidate_id)`                                                                                                           |
| bonus_tranche | V / own         | `t.vertical_id = ANY(:V)` / `t.recipient_id = :me`                                                                                                                                                    | `bonus_tranche(recipient_id, status)`, `(vertical_id, status, due_date)`                                                              |
| stat_*        | V / own         | `s.vertical_id = ANY(:V)` / `s.<subject>_id = :me`                                                                                                                                                    | `(vertical_id, day)`, `(<subject>_id, day)`                                                                                           |

CAND-06 invariant: `application.vertical_id = candidate.vertical_id` (checked at application create → 409 `CANDIDATE_VERTICAL_MISMATCH`; transfer requires no active applications; closed applications keep their historical vertical).
Denormalised for index-only scoping (kept consistent by the service in the same transaction): `application.vertical_id`, `application.position_id`, `application.team_lead_id` (copied from vacancy; updated when the vacancy's TL changes), `application.max_stage_reached` (monotonic except force/move-back recompute), `bonus_tranche.vertical_id`.
Soft delete: every predicate is AND-ed with `deleted_at IS NULL` except in `archive.deleted.read` queries.

## 4. VIS-02 — no leaks, by surface

| Surface                             | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lists, boards, kanban               | Repository list functions require a `scope: SQL` argument (lint-enforced); one query, no JS post-filter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Referenced ids in requests          | Each id resolved by a scoped fetch or a role-in-vertical check; Zod `.strict()` bodies; no client-set `ownerId`/`sourcerId`/`stage`/`verticalId` (DG-10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Counts / mini-funnels               | Counters only for `G`/`V` application scope; otherwise scoped live counts (ADR-008)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Global search (UI-03), autocomplete | Same scope predicate + pg_trgm; results capped, no total                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Detail `GET /x/{id}`                | Scoped fetch → 404 if absent; never 403 on read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Dedupe (CAND-02)                    | Unscoped existence check (server only) → `{ match: 'VISIBLE', candidateId }` if the match passes `candidate.read`, else `{ match: 'HIDDEN' }` with no id/fields. DG-11: exact normalised match only, run on submit (not per keystroke), never says which field matched; per-user limit on hidden matches (security default 20/day ⚠ OWNER value) + `audit_log` security event; burst → Head Recruiter alert. Race-proof via **unique** partial indexes on normalised email/phone/Telegram/LinkedIn (DG-19) — ⚠ OWNER: these assume exact duplicates are **blocked**; if the owner picks "warn", they become non-unique (ADR-002 §10b) |
| Timeline                            | Card must be readable; events of unreadable applications excluded; `sensitivity` redaction (ADR-003)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Files                               | Parent scoped fetch + file-class permission; polygraph file without `polygraph.file.read` → 404                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Notifications                       | Recipients resolved by evaluating `can(recipientCtx, 'application.read', ref)`; payload holds ids only; labels resolved at read time through scoped joins                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Mentions                            | Picker lists only users for whom `can(userCtx, <entity>.read, ref)` is true (≤ vertical users, in memory)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Realtime                            | Opaque ids only, no `actorId`; private channels only; no client INSERT; topics authorised per vertical (ADR-007, DG-11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Statistics & exports                | Scope predicate on aggregate subject columns; Finance only here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Error messages                      | 409/400 bodies never include data of other objects (e.g. "active application exists" says nothing about which vacancy if not visible)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 5. Custom roles (ROLE-04) — no schema rewrite

- Built-in map lives in code: `BUILTIN_ROLES: Record<BuiltinRole, readonly Grant[]>` (§2 tables).
- `user_role.role` is `text`. Later: `role_definition(code, name, is_builtin=false, is_global, active)` + `role_permission(role_code, permission text, scope jsonb)` — additive tables.
- Loader merges built-in + custom grants into the same `Grant[]`; validation: permission ∈ registry, scope ∈ `PERMISSION_REGISTRY[permission].allowedScopes`, `is_global` roles must use `user_role.vertical_id = null` and only `G` scopes, vertical roles never `G`.
- Settings UI later edits `role_permission`; all checks/predicates already work on grants, not role names.

## 6. Tests (VIS-03)

- Generated from §2: for every (permission, role, scope) cell → one **allowed** fixture and one **denied** fixture (other vertical, other recruiter, stage below floor, TL of another vacancy, Finance, **mixed-role user** `HEAD_RECRUITER@A + RECRUITER@B` acting in B — DG-10).
- Per-role response snapshots for DTOs that carry salary, polygraph file ids, bonus and BONUS-16 amounts (DG-10).
- Self-benefit denied cases for every ⁷ permission (DG-19).
- Contract: `can()` and `scopeWhere()` evaluated on the same seeded fixtures must agree (list contains X ⇔ `can(read, X)`).
- Route gating: every `/api/v1` route × every role → expected 2xx/403/404.

## 7. Interfaces (types/signatures only)

> Implemented in `server/authz/` (T3 + security review SEC-CORE-04/05/08): `AuthContext` has **no** `roles` field and `ResolvedGrant` has no role list (decisions read grants only; `/me` loads role names separately for display); self-benefit permissions use `canActOn`/`assertCanActOn(ctx, permission, resource, incoming)`; `findVisibleOrThrow(ctx, readPermission, adapter, load)` accepts only `write: false` permissions and computes the scope itself. The sketch below is the original design.

```ts
// server/authz/types.ts
export type UserId = string & { readonly __brand: 'UserId' };
export type VerticalId = string & { readonly __brand: 'VerticalId' };

export type BuiltinRole =
  | 'ADMIN'
  | 'HEAD_RECRUITER'
  | 'RECRUITER'
  | 'HEAD_HR'
  | 'HR'
  | 'TEAM_LEAD'
  | 'FINANCE';
export type RoleCode = BuiltinRole | `custom:${string}`;

export type Stage =
  | 'NEW'
  | 'IN_WORK'
  | 'SUBMITTED_TO_TL'
  | 'TL_INTERVIEW'
  | 'POLYGRAPH'
  | 'OFFER'
  | 'PROBATION'
  | 'PROBATION_PASSED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'PROBATION_FAILED';

export type PermissionCode =
  | 'vacancy.read'
  | 'vacancy.create'
  | 'vacancy.update'
  | 'vacancy.assign_recruiters'
  | 'vacancy.self_assign'
  | 'vacancy.team_lead.set'
  | 'vacancy.approve'
  | 'vacancy.hold'
  | 'vacancy.resume'
  | 'vacancy.cancel'
  | 'vacancy.reopen'
  | 'vacancy.delete'
  | 'vacancy.priority.override'
  | 'vacancy.bonus_scheme.override'
  | 'vacancy.bonus.update'
  | 'vacancy.probation_length.set'
  | 'position.manage'
  | 'position.read'
  | 'candidate.read'
  | 'candidate.contacts.read'
  | 'candidate.transfer_vertical'
  | 'candidate.create'
  | 'candidate.update'
  | 'candidate.bonus_flags.set'
  | 'candidate.bonus_flags.clear'
  | 'candidate.file.read'
  | 'candidate.file.upload'
  | 'candidate.merge'
  | 'candidate.delete'
  | 'candidate.purge'
  | 'archive.deleted.read'
  | 'archive.restore'
  | 'comment.create'
  | 'application.read'
  | 'application.create'
  | 'application.reactivate'
  | 'application.move.in_work'
  | 'application.move.submitted_to_tl'
  | 'application.tl_decision'
  | 'application.move.tl_interview'
  | 'application.interview.manage'
  | 'application.interview.reschedule_request'
  | 'application.move.polygraph'
  | 'application.interview.reject'
  | 'application.reject.recruiting'
  | 'application.reject.hr'
  | 'application.withdraw'
  | 'application.move_back.recruiting'
  | 'application.move_back.hr'
  | 'application.force_move'
  | 'application.reassign_owner'
  | 'application.bonus_split.set'
  | 'application.move.probation'
  | 'polygraph.assign'
  | 'polygraph.assign.self'
  | 'polygraph.schedule'
  | 'polygraph.result.record'
  | 'polygraph.review'
  | 'polygraph.file.read'
  | 'offer.read'
  | 'offer.salary.read'
  | 'offer.draft'
  | 'offer.send'
  | 'offer.outcome.record'
  | 'probation.length.set'
  | 'probation.pass'
  | 'probation.pass.override'
  | 'probation.fail'
  | 'bonus.read'
  | 'bonus.approve'
  | 'bonus.hold'
  | 'bonus.release'
  | 'bonus.mark_paid'
  | 'bonus.clawback.settle'
  | 'bonus.adjust'
  | 'bonus.self_referral.approve'
  | 'bonus.payout_report.read'
  | 'bonus.payout_report.export'
  | 'statistics.funnel.read'
  | 'statistics.hr.read'
  | 'statistics.bonus.read'
  | 'statistics.export'
  | 'settings.verticals.manage'
  | 'settings.vertical_flags.manage'
  | 'settings.users.manage'
  | 'settings.priorities.manage'
  | 'settings.bonus_schemes.manage'
  | 'settings.reference_data.manage'
  | 'settings.retention.manage'
  | 'settings.jobs.run'
  | 'audit.read'
  | 'user.directory.read';

export type Scope =
  | { readonly kind: 'GLOBAL' }
  | { readonly kind: 'VERTICAL' }
  | { readonly kind: 'VERTICAL_FROM_STAGE'; readonly stage: Stage }
  | { readonly kind: 'OWN' }
  | { readonly kind: 'OWN_INITIATED_NEW' }
  | { readonly kind: 'ASSIGNED' }
  | { readonly kind: 'UNASSIGNED_OPEN' }
  | { readonly kind: 'SUBMITTED_TO_ME' };

export interface Grant {
  readonly permission: PermissionCode;
  readonly scope: Scope;
}

export interface RoleAssignment {
  readonly role: RoleCode;
  readonly verticalId: VerticalId | null;
}

/** Implemented (T3) as one grant per (permission, scope) with the verticals of every assignment producing that same scope; different scopes are never merged (DG-10). */
export interface ResolvedGrant {
  readonly scope: Scope;
  readonly verticalIds: readonly VerticalId[] | 'ALL';
  readonly fromRole: RoleCode;
}

export interface AuthContext {
  readonly userId: UserId;
  readonly roles: readonly RoleAssignment[];
  readonly grants: ReadonlyMap<PermissionCode, readonly ResolvedGrant[]>;
  readonly mfaVerified: boolean; // aal2; required for ADMIN and FINANCE grants
  readonly timezone: string;
}

export type ResourceType =
  | 'vacancy'
  | 'candidate'
  | 'application'
  | 'bonus_tranche'
  | 'file'
  | 'statistics'
  | 'settings';

export interface VacancyRef {
  readonly type: 'vacancy';
  readonly id: string;
  readonly verticalId: VerticalId;
  readonly status: VacancyStatus;
  readonly teamLeadId: UserId | null;
  readonly createdBy: UserId;
  readonly assignedRecruiterIds: readonly UserId[];
  readonly maxApplicationStage: Stage | null;
}
export interface ApplicationRef {
  readonly type: 'application';
  readonly id: string;
  readonly verticalId: VerticalId;
  readonly stage: Stage;
  readonly maxStageReached: Stage;
  readonly ownerId: UserId;
  readonly sourcerId: UserId;
  readonly teamLeadId: UserId | null;
}
export interface CandidateRef {
  readonly type: 'candidate';
  readonly id: string;
  readonly verticalId: VerticalId;
  readonly sourcerId: UserId;
  readonly ownerId: UserId | null;
  readonly applications: readonly Omit<ApplicationRef, 'type'>[];
}
export interface BonusTrancheRef {
  readonly type: 'bonus_tranche';
  readonly id: string;
  readonly verticalId: VerticalId;
  readonly recipientId: UserId;
}
export interface StatisticsRef {
  readonly type: 'statistics';
  readonly verticalId: VerticalId | null;
  readonly subjectUserId: UserId | null;
}
export interface SettingsRef {
  readonly type: 'settings';
}
export type VacancyStatus =
  'DRAFT' | 'OPEN' | 'ON_HOLD' | 'FILLED' | 'CANCELLED';

export type ResourceRef =
  | VacancyRef
  | ApplicationRef
  | CandidateRef
  | BonusTrancheRef
  | StatisticsRef
  | SettingsRef;

/** Compile-time map: which resource each permission is checked against. */
export interface PermissionResourceMap {
  'vacancy.read': VacancyRef;
  'application.move.polygraph': ApplicationRef;
  'bonus.approve': BonusTrancheRef;
  'statistics.funnel.read': StatisticsRef;
  'settings.users.manage': SettingsRef; /* …one entry per PermissionCode */
}
export type ResourceFor<P extends PermissionCode> =
  P extends keyof PermissionResourceMap ? PermissionResourceMap[P] : never;

export interface PermissionDefinition {
  readonly resource: ResourceType;
  readonly allowedScopes: readonly Scope['kind'][];
  readonly isWrite: boolean;
}
export declare const PERMISSION_REGISTRY: Readonly<
  Record<PermissionCode, PermissionDefinition>
>;
export declare const BUILTIN_ROLES: Readonly<
  Record<BuiltinRole, readonly Grant[]>
>;
```

```ts
// server/authz/context.ts
export declare function loadAuthContext(
  accessToken: string,
): Promise<AuthContext>; // throws UnauthenticatedError
export declare const getAuthContext: () => Promise<AuthContext>; // React.cache(...) for RSC

// server/authz/can.ts
/** In-memory check on an already-loaded (visible) resource. */
export declare function can<P extends PermissionCode>(
  ctx: AuthContext,
  permission: P,
  resource: ResourceFor<P>,
): boolean;
/** Throws ForbiddenError(403) — call only after a scoped (visible) fetch. */
export declare function assertCan<P extends PermissionCode>(
  ctx: AuthContext,
  permission: P,
  resource: ResourceFor<P>,
): void;
/** Route gating: false ⇒ the whole route answers 404. */
export declare function hasAnyGrant(
  ctx: AuthContext,
  permission: PermissionCode,
): boolean;
/** Effective permissions on one resource — input for pipeline.availableActions(). */
export declare function permissionsFor(
  ctx: AuthContext,
  resource: ResourceRef,
): ReadonlySet<PermissionCode>;
```

```ts
// server/authz/scopes.ts
import type { SQL } from 'drizzle-orm';

export type PermissionsOn<R extends ResourceType> = {
  [P in keyof PermissionResourceMap]: PermissionResourceMap[P]['type'] extends R
    ? P
    : never;
}[keyof PermissionResourceMap];

/** Returns a WHERE fragment: sql`true` for GLOBAL, sql`false` when no grant; OR of all grants otherwise. */
export declare function scopeWhere<
  R extends 'vacancy' | 'application' | 'candidate' | 'bonus_tranche',
>(ctx: AuthContext, resource: R, permission: PermissionsOn<R>): SQL;

export type StatTable =
  | 'stat_recruiter_daily'
  | 'stat_vacancy_daily'
  | 'stat_hr_daily'
  | 'stat_rejection_daily'
  | 'stat_bonus_monthly';
export declare function statisticsScopeWhere(
  ctx: AuthContext,
  permission:
    'statistics.funnel.read' | 'statistics.hr.read' | 'statistics.bonus.read',
  table: StatTable,
): SQL;

/** Scoped single fetch: null from the repository ⇒ NotFoundError(404). */
export declare function findVisibleOrThrow<T>(
  load: (scope: SQL) => Promise<T | null>,
  scope: SQL,
  notFoundCode: string,
): Promise<T>;
```
