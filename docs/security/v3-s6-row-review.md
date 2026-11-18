# Security review: V3 slice 6b row menu (`statusGrantMirror`)

Scope: `git diff phase-2...v3-row-menu` (a1c0ece). Verdict: **PASS**. No Critical/High/Medium findings.

| Check | Result | Evidence |
| --- | --- | --- |
| Derived only from the viewer's own auth | OK | `statusGrantMirror(ctx)` reads `ctx.grants` and `ctx.userId` only; no DB or other-user input (`server/authz/vacancy-status.ts`, `statusGrantMirror`, `verticalsOf`). Page passes `ctx.auth` (`app/(app)/vacancies/page.tsx:139`). |
| Admin at aal1 (D63) and roles without grants get `null` | OK | `ctx.grants` already excludes aal2-withheld grants (`server/authz/context.ts:82-84`); all-empty -> `null`. Tests: "Admin with aal1 gets nothing", `NO_GRANT` roles, user with no assignments. |
| No foreign data | OK | Payload = own `userId` + vertical ids of own grants (or `'ALL'`). No names, no other users, no ids beyond the viewer's grants. |
| Client twin is advisory only | OK | `rowStatusActions` only filters menu items. No new endpoint. Every write goes through the existing `PUT /status` (`server/services/vacancy-status.ts:35-62`): `vacancy.read` + `holdsAnyStatusGrant`, write rate limit, Zod, scoped `readVacancy` (404), `mayRequestStatusAction` checked twice (before and after the row lock), version check. |
| Hover prefetch | OK | `prefetchQuery(vacancyDetailQuery(id))` uses the existing scoped card GET. No new data path. Rows come from the scoped list, so ids are already in scope. |
| Team Lead OWN abuse | OK | The client compares `row.teamLead.id` with `viewerId`; a spoof only changes which items show. The server takes `teamLeadId` from the DB row (`current.teamLead?.id`, locked `row`) and applies `hasOwnGrant`; a mismatch returns 403. |
| Unit tests | OK | 52/52 pass (`tests/unit/authz/vacancy-status.test.ts`). Mirror allowed/denied per role, mixed HR/TL grants, aal1 Admin. Parity test `rowStatusActions` vs `permittedStatusActions` over every role x status x vertical x leader. |

Notes (Low, no action needed):
- `lib/vacancy-status-menu.ts` imports the pure domain table `server/domain/vacancy-status/transitions` into the client bundle. The table has no secrets and no server-only imports.
- Mirror staleness (role change during a session) only affects what the UI offers. The server re-checks the grant on every write, so the result is a 403 and a toast.
