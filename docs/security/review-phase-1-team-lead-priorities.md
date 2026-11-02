# Security review — Team Lead priorities

Date: 2026-11-02. Scope: T6 slice 10, STORY-ROLE-01-3, ROUTE-01, VIS-01..03, D5/D47/D73. Covers the priorities page, vertical tabs, list and save API, priority history, and cleanup when TEAM_LEAD is removed by a role edit or by reactivation. Reviewed against the uncommitted `phase-1` tree. Files: `server/services/team-lead-priority.ts`, `server/repositories/team-lead-priority.ts`, `lib/schemas/team-lead-priority.ts`, `app/api/v1/settings/priorities/verticals/route.ts`, `app/api/v1/verticals/[verticalId]/team-lead-priorities/route.ts`, `app/(app)/settings/priorities/page.tsx`, migration `0009_team_lead_priority_bounds.sql`, plus the diffs in `user-roles.ts`, `user-activation.ts`, `user-timeline.ts`, `repositories/user.ts` and `authz/types.ts`.

**Verdict: approved for this slice. There are no open Critical, High or Medium findings.** `tests/integration/settings-team-lead-priorities.test.ts` passes 28/28 (run 2026-11-02, 19:59). This approval does not cover Phase 1 deployment or the future routing engine.

## Findings

| ID | Severity | Evidence | Fix / disposition |
|---|---|---|---|
| SEC-TLP-01 | Medium, **fixed and verified** | `repositories/team-lead-priority.ts` `lockTeamLeadEligibility`: the first statement takes `FOR NO KEY UPDATE OF u` in `u.id` order. A second statement (a fresh READ COMMITTED snapshot) then evaluates `eligibleTeamLead`. | Regression test: "rechecks eligibility after a save waits for a concurrent role removal to commit". The save blocks on `app_user`, sees the committed removal, and returns 409 with no row and no event. A companion test covers the save racing a role removal. |
| SEC-TLP-02 | Medium, **fixed and verified** | `nextTeamLeadPriorityVersion` sets `app_user.version = greatest(version, previous) + 1` under the held user lock. Every write path also bumps `app_user.version` (`bumpUserVersion`, `setUserActive`), so the counter only goes up. | Regression tests: "clears and recreates … ABA" (service) and "a TEAM_LEAD removed and re-assigned never revives the old row version" (API). |
| SEC-TLP-03 | Low, inherited (T9) | `server/http/define-route.ts:83`: the body is parsed before the handler's `requirePermission`. A malformed PUT from an authenticated non-Admin gets 400 instead of 404. That reveals the route exists, but no data. | Still tracked in T9: check permission metadata before parsing. A valid unauthorised request already gets 404 without reading any target data (test `it.each` covers 6 roles, including Finance). |
| SEC-TLP-04 | Info | `services/user.ts:179` (`listUserEventPage`) returns `priorityChange` under `settings.users.manage`. The card field in `getUserDetail` is gated by `settings.priorities.manage`. | Both permissions are currently GLOBAL+MFA and Admin-only. A global custom role is ignored (`authz/context.ts:74`), so today the two gates are equivalent. If the settings permissions are ever split, gate `priorityChange` with `settings.priorities.manage`. |
| SEC-TLP-05 | Info | `updateTeamLeadPriorities` runs about 4 sequential statements per change, for up to 200 changes, while holding all target `app_user` locks. `recordAuthLogin` (UPDATE `app_user`) waits behind it. | This is bounded: only an aal2 Admin can do it, and the cap is 200. A target Team Lead's login can stall for about 1–2 s at worst. No deadlock (see below). This is a performance-engineer item if batches ever grow. |

## Verified controls

| Control | Evidence | Result |
|---|---|---|
| Admin + aal2 only; everyone else gets 404 | `permissions.ts:131` `settings.priorities.manage: write(['settings'], [G], MFA)`. All three services call `requirePermission` first. The page uses `requirePrivilegedSession` (aal1 → `/mfa/verify`) and then `hasAnyGrant` → `notFound()`. Tests deny HREC, REC, HHR, HR, TL and FIN in their own vertical, and give aal1 Admin 401 `MFA_REQUIRED` (service and API). | Pass |
| Finance confinement | Finance has no grant, so the list, detail, save and the `/settings/priorities` page all return 404 (test). | Pass |
| IDOR across verticals | `verticalId` comes only from the path. Malformed → 404 (`userIdOf`), unknown → 404 (`priorityVerticalExists` / `findVerticalTeamLeads`). Every `userId` in the body must hold TEAM_LEAD in **that** vertical, be active and have accepted the invite; otherwise the whole batch gets 409. Priority row lookups and writes are keyed by `(vertical_id, user_id)`. A Team Lead with roles in two verticals: independent rows, no false conflict (test). | Pass |
| Input | `.strict()` body and items. 1–200 changes. `z.uuid().toLowerCase()` before the uniqueness refine and before the Map lookup against DB ids. Priority must be an integer 0–99 or null; version a positive integer or null. Parameterised SQL only (`sql.join` of bound `::uuid` params). DB `CHECK priority BETWEEN 0 AND 99`. 400 `VALIDATION_FAILED` with paths (API test). | Pass |
| All-or-nothing | One transaction. Every version is checked before the first write, and later failures roll back rows, events and audit. Stale-batch test: a later stale row rejects an earlier current row. Same-version double creation: exactly one commits. | Pass |
| No-op | `old === change.priority` → `continue`: no version bump, no event, no audit. The version is still checked. | Pass |
| Role/lifecycle cleanup | `removeTeamLeadPriorities` runs inside the `updateUserRoles` / `reactivateUser` transaction after `lockUser`. It deletes the `(user, removed TL vertical)` rows and records old→null as an event plus audit. Deactivation does not call it, so the row survives; the list hides the inactive user (wireframe rule 3/19, owner-confirmed 2026-11-02). Test covers both. | Pass |
| `isTeamLeadAssignment` | `authz/types.ts:24`. Its only caller is `removeTeamLeadPriorities`, which uses it to choose which removed assignments carry a priority row to delete. It is a data selector, not an access decision: access is decided only by `settings.priorities.manage`. It sits next to `isAdminAssignment` for the same ROLE-04 lint reason. | Pass |
| History / audit privacy | `EVENT_PAYLOADS['vertical.tl_priority_changed']` is strict `{userId, old, new}` (UUID + integers). Subject = the Team Lead's own `app_user`. `vertical_id` is an envelope column. No PII side row, no `change_feed` emission. Audit: entity `vertical`, `before/after {priority}`, `details.teamLead` UUID. No names, emails, tokens or free text. The timeline reader stays subject-filtered, and the payload is re-parsed with `safeParse` before `priorityChange` is exposed. No other `entity_event` reader filters by `vertical_id` today. | Pass |
| Transport / cache | Existing `defineRoute` factory: Origin/CSRF, bounded JSON, response schema parse, `private, no-store`. Logs carry the route template only. The RSC page checks authz before it prefetches; a bad `?vertical=` is UUID-gated and an unknown id falls back to the first tab (prefetch errors are swallowed and not dehydrated). | Pass |
| Client | No `dangerouslySetInnerHTML`, no web storage, no console output in `priorities-view.tsx`, `priorities-leave-dialog.tsx`, `team-lead-priority-draft.ts` or `queries/team-lead-priority.ts`. | Pass |

## Lock ordering (deadlock analysis)

| Writer | Acquisition order | Conflict with priority save |
|---|---|---|
| Priority save | target `app_user` rows (NO KEY UPDATE, UUID order) → `team_lead_priority` rows (FOR UPDATE, only for already-locked users) → UPDATE same `app_user` rows → FK KEY SHARE on `vertical`, actor `app_user` (`updated_by`, `actor_id`) | Two saves: identical global UUID order, so they serialise. KEY SHARE on the actor is compatible with another save's NO KEY UPDATE, so Admins can save batches that contain each other without deadlock. |
| Roles editor / reactivation | `user_invite` (FOR UPDATE) → `app_user` (NO KEY UPDATE) → `user_role` → `team_lead_priority` delete | The save never touches `user_invite` and only reaches `team_lead_priority` after holding the user lock, so no cycle is possible. Test: save vs removal → exactly one wins, and the loser gets 409. |
| Invite acceptance | `user_invite ⋈ app_user` FOR UPDATE (one statement) → `user_role` | Waits on the save's user lock. Holds nothing the save needs. An unaccepted user can never be a target. |
| Deactivation | `user_invite` → `app_user` | Serialises on the user row and never touches priority rows. |
| Vertical rename | `vertical` FOR UPDATE; actor KEY SHARE | A save's FK KEY SHARE on `vertical` waits for the rename. The rename never waits on user locks (KEY SHARE vs NO KEY UPDATE are compatible), so no cycle. |
| Login (`recordAuthLogin`) | UPDATE `app_user` (no version bump) | Waits briefly (SEC-TLP-05). Never causes a 409 on the priorities page. |

## Design trade-off assessed

- **Shared version counter.** A priority save bumps the Team Lead's `app_user.version`, so a second Admin with that user's card open gets 409 `STALE_STATE` on the next role, email or lifecycle edit, and must reload. **Accepted.** It fails safe (no lost update, no privilege effect). It is rare (two Admins editing the same Team Lead within seconds). It is the price of race-free ABA protection without a separate sequence. The reverse direction does not invalidate the priorities page unless a TEAM_LEAD row actually changes.

## Follow-ups (not blocking this slice)

| Item | Owner | Phase |
|---|---|---|
| T9: check permission before parsing params/body in `defineRoute` (SEC-TLP-03) | senior-fullstack-engineer | 1 |
| Routing engine must read priorities only for currently eligible Team Leads (active, accepted, current TEAM_LEAD in the vertical), because deactivated Team Leads keep their rows (threat T-Z14) | solution-architect / engineer | Routing phase |
| Purge checklist (DG-20): `team_lead_priority.user_id/updated_by` are `ON DELETE RESTRICT`. Anonymisation must not hard-delete `app_user`; otherwise drop these rows first | database-engineer | 5/7 |
