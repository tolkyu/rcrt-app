# PROGRESS

Single log of phase status, deliverables, gaps and decisions. Updated at the end of every task.

## Phase status

| Phase | Scope (PRD §15) | Status | Gallery |
|---|---|---|---|
| 0 | Discovery & design | ✅ Done 2026-10-31 — owner approved Phase 1 | — |
| 1 | Foundation | 🔄 In progress (branch `phase-1`) | `screenshots/phase-1/index.html` (auth + audit; full role gallery pending T7) |
| 2 | Vacancies & candidates | ⏳ | |
| 3 | Pipeline + routing | ⏳ | |
| 4 | Bonuses & statistics | ⏳ | |
| 5 | Archive & notifications | ⏳ | |
| 6 | Telegram — owner questions first, nothing built before answers | ⏳ | |
| 7 | Hardening & launch | ⏳ | |

## Phase 0 deliverables

| Deliverable | Owner agent | Status |
|---|---|---|
| `docs/OPEN_QUESTIONS.md` (Q-01…Q-105, Top-10, Phase-1 blockers) | business-analyst | ✅ |
| `docs/stories/phase-1.md` (37 stories) | business-analyst | ✅ |
| `docs/adr/001..009` | solution-architect | ✅ |
| `docs/architecture.md` | solution-architect | ✅ |
| `docs/pipeline-state-machine.md` | solution-architect | ✅ |
| `docs/authz-matrix.md` | solution-architect | ✅ |
| `docs/erd.md` (47 tables, integrity rules, purge map, index table, seed outline) | database-engineer + architect | ✅ |
| `docs/perf/plan.md` | performance-engineer | ✅ (P95 figures are estimates, verified from Phase 1) |
| `docs/ux/screens.md`, `flows.md`, `glossary.md`, `design-system.md`, `wireframes/` (dashboard, vacancy card, candidate card, TL priorities, bonus schemes, finance statistics) | ux-ui-designer | ✅ |
| Wireframe: Archive (Відмови / Видалені / Закриті вакансії) — owner request | ux-ui-designer | ✅ |
| Wireframes: general Statistics, Bonuses, Settings (verticals, users & roles) | ux-ui-designer | ⏳ Phase 4/5 design step |
| `docs/test-plan.md` (877 authz cases, 33 transitions, 26 routing, 69 bonus, 26 probation rows; screenshots 152 in phase 1 → 1 236 total) | qa-engineer | ✅ |
| `docs/security/threat-model.md` (60 threats, DG-01..22 design changes) | security-engineer | ✅ |
| Apply DG-01..22 to ADRs / perf plan / ERD + final cross-doc consistency pass | architect, performance-engineer, database-engineer | ✅ |
| `docs/ux/designer-brief.md` — brief for the owner's designer | orchestrator | ✅ |

## Phase 1 tasks

| # | Task | Agent(s) | Status |
|---|---|---|---|
| T1 | Repo bootstrap, local Supabase stack, CI, security baseline (FND-1..5) | devops-engineer (done by Codex) | ✅ Foundation committed `c34712a`; PostgreSQL 17 approved (Q-142); remaining hardening tracked in T9 |
| T2 | Drizzle schema + migrations (phase-1 tables), grants/triggers, demo + perf seed | database-engineer (done by Codex; review fixes by database-engineer) | ✅ 14 tables, grants, triggers, demo seed (`c34712a`); review fixes in migration `0003` (timeline/audit indexes, plain-DESC keys, file CHECKs, `app_setting` row, `auth` USAGE revoke), grant-matrix test, seed guard against non-demo data; 35 integration tests green on PostgreSQL 17.11. Perf seed → Phase 2 (SEED-1) |
| T3 | Server core: request context, authz module + matrix tests, API wrapper/OpenAPI, audit + events | senior-fullstack-engineer | ✅ `e6be251` + security fixes `da6733b`; code review approved 2026-11-01. Open Low/Info: SEC-CORE-13/14/16 (T9 / before routing) |
| T4 | Auth: magic link, Google, invites, TOTP (Admin + Finance), sessions, dev-login | senior-fullstack-engineer + security-engineer (identity slice by Codex) | ✅ `10ca37b`, `18e0447` (R01), `bb620e8` (CR-P1 + R02/R03/R05). Security re-check: acceptable for Phase 1 (`docs/security/review-phase-1-auth-completion.md`). Remaining: invite resend/revoke, deactivation (+R04), D69/D70 → T6; hosted config drift → T9 |
| T5 | Design system shell, navigation per role, profile, states — owner's designer mockups (docs/ux/reference) are the target look | senior-fullstack-engineer | ✅ `838e20f`, `024bdd9`, tests `a213c76` (96 unit, 15 integration, 12 E2E). Known: server field error not shown on name form (Minor, remount by `key`); axe not installed; screenshots → T7 |
| T6 | Settings: users & invites, roles, verticals, TL priorities, audit viewer | senior-fullstack-engineer | 🔄 Slice 1 `b7520c6`: settings frame + Вертикалі. Slice 2: bounded audit list/detail + filters, Admin aal2 only, migration `0006`; review approved. Slice 3: «Користувачі та ролі» list (search, status/role/vertical filters, derived status, 2FA via `app.auth_mfa_totp`, migration `0007`), Admin lands on it; code + security review fixes applied. Slice 4: «Запросити користувача» dialog — look from the designer mockup, content per PRD (Q-155 open), roles × verticals matrix (D40), «Підсумок доступу», 409s in place with «Показати в списку», concurrent same-email invite → 409 `INVITE_PENDING`. Deliberate departures from wireframe §1.2 until the drawer slice: no blur validation (it shifted the matrix under the cursor), no optimistic row (status/expiry are server-derived), not-delivered = error toast (no warning tone), «Показати в списку» instead of «Відкрити користувача» / «Надіслати повторно» / «Активувати знову» (AC for deactivated users pending). Server still answers `INVITE_PENDING` for a revoked user → fix with D70 re-invite. Slice 5 (team flow: engineer → QA → code + security review → fixes): read-only «Картка користувача» (`?user=<id>`): profile, roles, TL priorities, invitation block, sign-in security, «Історія» (allowlisted user timeline, `GET /users/{id}` + `/events`); event subject unified to `app_user` for new writes, legacy `user` rows read as-is (no relabel of append-only rows); seed writes real invite rows + valid `user.invited` events (fresh seed only). Owner decisions D71–D73. Slice 6 (engineer → QA → code + security + perf review → fixes): invitation actions in the drawer [STORY-ROLE-05-3, D42, D70] — «Надіслати повторно» (new 72 h link, old one dies), «Відкликати» (AlertDialog), «Запросити знову» after revoke; POST `/users/{id}/invite`, `/invite/resend`, `/invite/revoke`, Admin aal2 only; events `user.invite_resent` / `user.invite_revoked` / `user.reinvited` + audit in the same transaction; mail after commit → `delivered:false` on failure (config errors logged); invite dialog answers `INVITE_REVOKED` for a revoked user (D70 fix); migration `0008` index `user_invite_latest_idx`. Reviews: `docs/security/review-phase-1-user-invite-actions.md`, `docs/perf/report-phase-1-user-invite-actions.md`. Browser E2E for actions is route-mocked; real transitions covered by integration tests on a fresh DB. Screenshots `11-admin-user-invite-*`. Slice 7 (BA story → UX §1.11 → engineer → code + security review → fixes → QA screenshots): «Змінити email» for a never-activated user [STORY-ROLE-05-7, ROLE-05, D69, D44, D72] — drawer ⋯ menu, Dialog, `PUT /users/{id}/email` `{ email, expectedVersion }` (Admin aal2), 409 `USER_ACTIVATED` / `USER_DEACTIVATED` / `STALE_STATE` / `INVITE_ROLES_INVALID` / taken (field errors in `ConflictError`), 400 `EMAIL_UNCHANGED`; one tx: revoke old invite → new email → new 72 h invite → `user.email_changed` (ids + roles; addresses only in `entity_event_pii` + audit); mail to the new address after commit. Shared `invite-dialog-behaviour.ts`. Seed fix: `seed:auth` no longer activates the pending invitee. Review: `docs/security/review-phase-1-user-email-change.md` (SEC-EML-01 orphan auth users → Gaps; SEC-EML-03 lock order → deactivation). Screenshots `11-admin-user-change-email-*`. UX polish P1–P5 completed in slice 12 (see checkpoint below). Slice 8: roles editing completed in the 2026-11-02 checkpoint below (independently re-reviewed by Claude: APPROVED; follow-ups in handoff). Slice 9 (started by Codex, finished by Claude's team; engineer → QA → security + code review → fixes): «Деактивувати / Активувати знову» [STORY-ROLE-05-5, ROLE-05/06, D23/D42/D44/D45, SEC-AUTH-R04, SEC-ROL-02, ADR-011] — `POST /users/{id}/deactivate` (`expectedVersion`, reason ≤500 audit-only) and `/reactivate` (subset of retained roles, zero allowed); checked provider ban/unban under the user lock before Auth writes, failure still commits local denial + DENIED audit → 503 + retry with current version; reactivation ends old sessions → fresh sign-in; `lockAdminMembership` shared with role removal; invite dialog «Активувати знову» opens the deactivated user's card (`details.userId`, U3); audit booleans shown as «Так/Ні». GoTrue ordering probe passed on local Supabase (throwaway user). Review: `docs/security/review-phase-1-user-activation.md`. Screenshots `13-admin-user-*`; drawer sticky footer re-shot in 10–12. D24 open-work reassignment deferred to Phase 2–3. Roles follow-ups (code review of fc5063b): guarded version adoption after saves (roles/email/activation), one card-wide mutation key, roles dialog sticky mobile footer, shared `RoleChips`, sorted audit role lists. Slice 10 (started by Claude's engineer, continued by Codex after a rate limit, finished by Claude's team; UX Phase-1 scope → engineer → QA → security + code review → fixes): «Пріоритети тімлідів» [STORY-ROLE-01-3, ROUTE-01, D5, D47, D73] — `/settings/priorities` (vertical tabs in URL, number field 0–99 / empty = не задано, ↑↓ + Alt+↑↓, ties with D5 hint, «Без пріоритету» group, batched save + unsaved-changes guard, 409/5xx banners, mobile cards); `GET /settings/priorities/verticals`, `GET|PUT /verticals/{id}/team-lead-priorities` (per-row versions from the TL's user version, all-or-nothing, 409 `STALE_STATE`); event `vertical.tl_priority_changed` in the TL's own «Історія» + audit (Тімлід name resolved); removing TEAM_LEAD deletes the priority (old→null), deactivation keeps it; migration `0009` (CHECK 0..99, partial index). Review: `docs/security/review-phase-1-team-lead-priorities.md`. Screenshots `14-admin-priorities-*`. Deferred to Phase 2–3: per-vacancy override, routing preview, vacancy counts, auto-routing banner. Actor search and UX polish completed in slices 11–12. Slice 13: grouped multi-action audit filter + «Входи та безпека» view [STORY-AUD-2, D74] (see checkpoint 2026-11-03). Slice 14: «Показати новіші» bounded window [STORY-AUD-4]. Slice 15: «Свій період» draft follows Back/Forward/reset/entity links. T6 audit scope done; j/k row navigation (wireframe §3.1) not built. Screenshot `09-admin-invite-dialog-*` is not byte-stable between runs → T7. Known gaps: multi-select filters (API supports them), TanStack Virtual for 10k rows, trigram index for `q` (seq scan is ms at 10k) |
| T7 | Tests (integration, E2E, Newman), screenshots + gallery | qa-engineer | ⏳ Full E2E green; Newman all 37 operations done; byte-stable screenshots done; CI wiring of test:api pending (devops) |
| T8 | Perf seed + perf:check | performance-engineer | 🔄 Initial-JS gate (PERF-04) green 2026-11-01 (`e251de6`, `5be02ea`): all routes ≤ 180 kB. Pending: API P95, Web Vitals/Lighthouse, perf seed (Phase 2) |
| T9 | Security review, code review, fixes, verify | security-engineer, code-reviewer | ⏳ Carry-over from foundation review: route framework validates query/body before `requirePermission` → non-admin gets 400 instead of 404 for malformed input (add `permission` to `RouteSpec`, SEC review of users list S2); deploy smoke `set role app_rw; select count(*) from app.auth_mfa_totp` and runbook note that GoTrue tables must exist before app migrations (0002/0007 skip silently otherwise); CI action SHA pins, `pnpm audit` gate, Drizzle drift check, `format:check`, `NEXT_PUBLIC_`/static secret grep; DG-03 storage policy test on local Supabase; AGENTS.md/.codex duplication (owner call) |

## Implementation checkpoint — 2026-11-03 (Claude team, gallery review step A)

- Fixed from `docs/ux/review-phase-1-gallery.md`: UX-G-03 (fixtures match the seed, causal times), G-04 (role-matrix checkbox ≥3:1, indigo like other checkboxes), G-05 (removed-role chip 5.9:1 + minus icon), G-06 (Ukrainian gallery captions/alt, one heading per state, 1:1 file check both ways), G-11 (unfiltered audit list, new denied detail). G-10 partly: realistic UA/ids/IPs/15 events; seed emails `expired.invite@demo`, `inactive.recruiter@demo` need a DB reset (owner question).
- `AUDIT_SECURITY_PREFIXES` shared by repository and E2E mock; audit shot fixture in `tests/support/audit-shot-fixture.ts`; captureScreen blurs non-text focus.
- Verified: lint, typecheck, 2,196 Vitest, build, perf:size (users 178.45, audit 179.19), full E2E 171 + 2 skips, screens 24, zero screenshot drift on rerun; 136 phase-1 PNGs. Code review APPROVED; UX re-check 5/6 fixed + 1 partly.
- Open: owner decisions on seed reset (person-like emails, history dated two weeks earlier); P1 UX-G-01/02 (other roles, missing screens) → step B; mobile P2 → step C; new P3 RA-02/03 noted in the review.

## Implementation checkpoint — 2026-11-03 (Claude team, T7 slice 4 — Newman Auth)

- Newman covers all 37 Phase-1 operations (Auth, Profile, Users, Verticals, Priorities, Audit): 285 requests, 1,660 assertions. Auth: confirm / invite preview / accept refusals issue no session cookie, INVALID is one state; CSRF on every public POST; own sessions/history only; logout and end-other-sessions revoke server-side (second `tl.crypto@demo` session proven ended); Bearer-only MFA verify refused before the attempt counter [ADR-006, SEC-AUTH, DG-06].
- Safety: no well-formed TOTP code for seeded users except the Bearer-binding case (refused before counting), no real invite or factor touched, cookie jar disabled, cookies/tokens in memory only. Budget: 7 `/auth/confirm` per run → ≤ 4 runs per 15 min (shared with E2E locally).
- Integration: expired / revoked / consumed invite previews equal the unknown answer; a consumed sign-in link gives the same 401 as an unknown one.
- Verified: lint, typecheck, 2,196 Vitest, generator byte-stable, test:api green, no repo/DB drift, e2e-sessions 6/6; full E2E 171 + 2 skips during the slice. Code review APPROVED, security no blockers.
- T9 (app code): magic-link response time reveals whether an address belongs to an eligible user → equalise; `enrollTotp` spends the per-user enrol limit before the Bearer refusal → reorder. Owner 2026-11-03: team is fully remote, no shared office IP → keep the per-IP confirm limit as is.

## Implementation checkpoint — 2026-11-03 (Claude team, T7 slice 3 — Newman Users + Priorities)

- Newman now covers Profile, Users (12 ops), Verticals, Priorities (3 ops), Audit: 233 requests, 1,363 assertions. Every Users/Priorities op: 404 for Head Recruiter / Finance / crypto recruiter, 401 `MFA_REQUIRED` for Admin aal1, 401 without token, 403 without CSRF header, unknown-id 404 parity [VIS-01..03, ROLE-05, DG-06].
- Mutations only as refusals that cannot write (stale version 2147483647, self-target, invalid payload proven refused for Admin too); current-version no-ops followed by whole-card `sameAs` checks; reads with filters, keyset paging, timelines with exact event keys and no subject email.
- Generator: array query values, `snapshot`/`sameAs` case fields. Profile rename/restore replaced by a no-op save (old pair bumped `app_user.version` +2 per run).
- Verified: lint, typecheck, generator byte-stable, test:api green twice, no repo drift, read-only DB snapshot identical (only sign-in `last_login_at`). Code review APPROVED, security no blockers.
- Gaps: Auth folder (13 ops) → next slice; mutation success paths, `LAST_ADMIN`, existing-email 409s need disposable fixtures (409s covered by integration tests); `resetUserMfa` has no `expectedVersion` (a repeated request after re-enrolment resets again) → owner question for Phase 2; `resetUserMfa` malformed id 400 vs 404 elsewhere → T9 with the validation-before-authz carry-over.

## Implementation checkpoint — 2026-11-03 (Claude team, T7 slice 2 — byte-stable screenshots)

- SHOT-DET-01: reruns leave `screenshots/` byte-identical. Causes found by pixel diff (not text anti-aliasing): colour transitions still running at capture, Chromium partial re-raster seams on just-changed rounded borders, DB-dependent last-sign-in times in the users list.
- Fix: `settleRendering` (fonts + finite running animations, capped 3 s) before measuring and after the viewport resize; `--disable-partial-raster` for all projects; `fixListSignInTimes` gives every active user a fixed time in the users screenshots.
- 32 PNGs × 2 galleries regenerated once: 4 `08-admin-users-list-*` show fixed sign-in times for all active users; the rest are invisible 1–3-level edge pixels. Galleries 128 images, 1:1.
- Verified: 4 consecutive full `test:e2e` (171 + 2 skips) + `test:screens` (24) runs with zero screenshot diffs; lint, typecheck. Code review APPROVED.
- Gaps: `settings-priorities.spec.ts:271` failed once under full-suite load (passed 8/8 alone) — watch, fix if it recurs; determinism proven on Windows/Chromium only, CI on Linux renders different pixels; 2FA column still comes from seeded factors.

## Implementation checkpoint — 2026-11-03 (Claude team, T7 slice 1 — Newman runner)

- `pnpm test:api` [ADR-006, test-plan §10]: starts `next start` :3100 (loopback-only env guard, port probe), signs in seeded users through the app (`/auth/confirm` + TOTP aal2), tokens in memory only, Newman cli + junit (`test-results/newman/`), logs out and verifies tokens are revoked (401).
- Generator `scripts/postman.ts` + `scripts/postman-cases.ts`: deterministic collection; per-tag `tests/postman/cases/<tag>.json` cloned into role/validation/CSRF variants; asserts status, `no-store`, OpenAPI schema, exact problem+json keys/type/code; generation fails on uncaptured chained vars or undocumented statuses; any skipped request fails the run.
- Covered: Profile, Verticals, Audit (66 requests, 381 assertions) incl. VIS-01 per-vertical lists, 404 parity, DG-06 CSRF (no header, foreign/missing Origin, text/plain), audit `direction=newer` keyset. No business-data changes.
- `openApiRoute` now documents 400 for every route with params/query/body (docs-only; 3 operations gained 400).
- Verified: lint, typecheck, 2,194 Vitest, build, perf:size (all ≤ 180 kB), test:api green; full E2E 171 + 2 skips on 6ebaa9a. Code review APPROVED after fixes; security: no blockers, newman transitive advisories accepted as dev-only (threat-model T-S06).
- Gaps: Auth (13), Users (12), Priorities (3) cases → next T7 slices; refine codes reach clients as field code `custom` (S2, separate API-contract task); `test:api` not in CI (needs Supabase stack in Actions); ADR-006 says no Sec-Fetch-Site rule but `isTrustedMutation` rejects `cross-site` → align.

## Implementation checkpoint — 2026-11-03 (Claude team, audit «Показати новіші»)

- Completed T6 slice 14 [STORY-AUD-4]: after older pages evict the newest one, «Показати новіші» above the list walks back to the newest records; window stays ≤2 pages / 100 rows. API `direction=older|newer` + `prevCursor` (one SQL per page, mirror keyset, legacy cursor-only unchanged, 400 on bad direction / `newer` without cursor).
- Scroll anchor measured and restored (no reliance on CSS `overflow-anchor`), focus handoff when a button disappears, live region re-announces on every window move, `cancelRefetch: false` double-click guard; shared `Button` has `aria-disabled:` styles.
- Validation: lint, TypeScript, 2,194 Vitest, build + all JS gates (audit 179.15 kB, users 178.45, priorities 178.07), full E2E 169 passed + 2 existing skips, audit spec 14/14 desktop + mobile after review fixes; galleries 128 images (new `06-admin-audit-newer-*`). Code review blocker (silent live region) fixed.
- Gaps: j/k row navigation from wireframe §3.1; ~~Newman cases for `direction`~~ done (T7 slice 1); large-volume plans for `newer` → T8.

## Implementation checkpoint — 2026-11-03 (Codex → Claude team, audit action filters)

- Completed T6 slice 13 [STORY-AUD-2, D74, Q-158]: «Дія» is a lazy grouped checkbox picker; selected actions are ORed (`actions=` CSV, legacy `action=` kept, both together → 400); «Входи та безпека» keeps the manual selection and ANDs it with `auth.*` / `user.mfa_*` (historical codes included); empty intersection = normal empty state. One SQL statement, keyset paging unchanged.
- Bundle: server-only Kyiv date helpers moved to `server/audit/period.ts`, removing `@date-fns/tz` from the client graph. Audit initial JS 178.43 kB (was 180.08 before the fix), users 178.32, priorities 178.04.
- Code review APPROVED with follow-ups applied; security APPROVED; QA bug fixed (focused checked action scrolled into view on mobile, WCAG 2.4.11). Validation: lint, TypeScript, 2,172 Vitest, production build + all JS gates, full E2E 163 passed + 2 existing skips, audit spec re-run 11/11 desktop + mobile, public screenshot suite 24/24; galleries 124 images, none missing (new `06-admin-audit-{multi,actions,security}-*`).
- Reports: `docs/security/review-phase-1-audit-action-filters.md`, `docs/perf/report-phase-1-audit-action-filters.md`. Large-data plans for sparse security filters → T8.

## Implementation checkpoint — 2026-11-02 (Codex, settings visual polish)

- Completed T6 slice 12, wireframe settings-admin §8 P1–P5: measured menu offset below the entire user identity, cancel-first mobile buttons (48 px), full email wrapping before `@` through shared `EmailText`, and whole-word Ukrainian wrapping without automatic hyphens.
- Replaced duplicate settings/shell capture code with `captureScreen`: document/intrinsic modal height, no horizontal overflow, no `fullPage` fixed-bar artifacts, viewport restoration in `finally`. Fixed-dialog content also fits when the background page is short. Public capture source remains unchanged. Real 390×844 functional checks verify buttons and menu geometry independently of stretched images.
- Engineer, QA, designer and independent code review approved. Validation: 2,123 unit/integration tests, lint, TypeScript, production build and every JS gate passed (audit 179.63 kB, users 178.28 kB). Browser coverage: 149 scenarios passed + 2 existing skips; after fixing an accessibility-hidden/animation measurement in the test, all four desktop email cases passed again. Public screenshot suite 24/24. Both galleries contain 112 images with no missing files; UX inspected 29 fresh screenshots.
- Reports: `docs/ux/review-phase-1-settings-polish.md`, `docs/perf/report-phase-1-settings-polish.md`. No API, database or permission changes in this visual slice. Remaining T6 audit work: security preset/multiple actions, backward page window and custom-date Back synchronization. Phase 1 remains in progress.

## Implementation checkpoint — 2026-11-02 (Codex, audit actor filter)

- Resumed T6 slice 11 [STORY-AUD-2]: searchable «Хто» filter, `GET /api/v1/audit/actors`, Admin aal2 only. Picker includes accepted users (active and deactivated), with bounded keyset paging, escaped name/email search and a fixed «Система» option. Anonymous failed sign-ins remain visible in the unfiltered journal but are excluded from «Система».
- Closed review findings: the reload timestamp survives unrelated successful chunk loads; persistent failures reach the error boundary after one reload per 30 seconds. Stale search options cannot be selected while debounce/fetch is pending. Selected actor is announced, mobile clear target is 44 px, and actor UUIDs normalize before URL/state comparisons.
- Independent code and security reviews approved. Verification: full Vitest 2,122 passed plus the UUID regression in focused checks; production build/typecheck and lint passed; full browser run 155 passed + 2 existing mobile-shell skips. Twelve audit list/detail/picker screenshots visually reviewed. OpenAPI/Postman updated while preserving unrelated generated IDs/examples. Final actor-build size is recorded in `docs/perf/report-phase-1-audit-actor-filter.md`; endpoint P95/Web Vitals remain T8.
- Settings UX polish P1–P5 is completed in the checkpoint above. Phase 1 remains in progress.

## Implementation checkpoint — 2026-11-02 (Codex, T6 role editing)

- Resumed Claude's interrupted roles editor [STORY-ROLE-01-1/01-2, ROLE-01, D35/D40/D45]. Shared role matrix with invitations; lazy «Змінити ролі» dialog, separate additions/removals, removal confirmation, zero-role warnings, loading/error/focus states and optimistic drawer/list chips with rollback.
- `PUT /api/v1/users/{userId}/roles`: Admin aal2 only, strict bounded role validation, optimistic version check, pending invite → user → roles locks, D45 self/last active administrator protection with a shared advisory transaction lock. Assignment events and before/after audit commit with the role change. Invite acceptance reads the current roles; grants change on the next request.
- Team: implementation inspection → QA tests/screenshots → security/performance/code review → list-optimism fix. Reviews: `docs/security/review-phase-1-user-roles.md`, `docs/perf/report-phase-1-user-roles.md`. OpenAPI and the new Postman request updated without regenerating existing random request IDs.
- Verified: 1,998 unit/integration tests, lint, production build (including TypeScript), all initial-JS gates; users 178.06 kB / audit 179.94 kB. Browser scenarios: 118 passed + 2 existing skips (plus six successful session setup cases); after the final schema build, role checks 12/12 and screenshot suite 24/24. Added regression coverage for all non-Admin denials, D45, simultaneous editors, cross-admin removals, separate-connection invite acceptance races, optimistic list rollback and UUID casing. Assignment IDs now normalize before diff/dedup. Seed assertions count only demo fixtures rather than other tests' committed users. Eight new role PNGs visually reviewed; each phase/latest gallery has 76 images with no missing files. Code and security reviews approved. Unrelated timestamp-only audit images restored.
- D43 open-work reassignment remains Phase 2–3 as explicitly agreed in the story. Next T6 slice: deactivate/reactivate + SEC-AUTH-R04; must share the Admin membership lock and invite-first lock order (SEC-ROL-02). Full Phase 1 remains in progress.

## Implementation checkpoint — 2026-11-01 (Codex, query-import optimization)

- Performance engineer identified unused TanStack Query exports in the initial graph. Added only `@tanstack/react-query` to Next's existing import optimization list; retained the original shell/menu implementation after measuring negligible benefit from a Sheet extraction.
- Actual initial gzip: shell 186.72 kB (was 188.02), audit 205.05 (206.06), verticals 193.31 (194.66), profile 194.28 (195.30), settings 189.60 (190.90). The 180 kB gate remains red; T8/Phase 1 are not complete.
- Clean build (incl. lint/TypeScript), 1,860 unit/integration tests and independent code review passed. Full E2E: 52 passed + 6 existing mobile-vertical skips; screenshot suite: 24/24. QA added keyboard/focus coverage and 4 tablet/mobile navigation PNGs, visually checked both themes; each phase/latest gallery now contains 32 images with no missing files. Measurements: `docs/perf/report-phase-1-query-imports.md`.

## Implementation checkpoint — 2026-11-01 (Codex, T6 audit slice)

- Resumed Claude's unfinished audit viewer without discarding its working-tree changes. Added `/settings/audit`, GET `/audit` and `/audit/{recordId}`, URL filters (Kyiv presets/custom period, actor, action, entity and result), before/after sheet and vertical history links [STORY-AUD-2, VIS-01..03, AUD].
- Fixed host-timezone/DST range arithmetic, stale state on same-route navigation, invalid custom drafts reaching the API, delayed 404 details and recursive JSON OpenAPI generation. Added indexed UUID label joins and migration `0006` for filtered keyset queries.
- Read-only list is restricted to Admin with verified MFA; list payload excludes before/after JSON. Security review: `docs/security/review-phase-1-settings-audit.md`; code review approved the bounded slice.
- Explicit scope limits: actor picker contains actors in retained rows (searchable all-user/system lookup remains T6); at most two 50-row pages are retained, and loading older pages displaces newer ones (backward window navigation/virtualization remain T6 polish); security preset/multi-action filter and date-draft synchronization on Back remain polish. No retention job is added here.
- Verification: 1,860 unit/integration tests passed; lint and clean production build (incl. TypeScript) green. Full E2E after final import optimizations: 50 passed + 6 existing intentional mobile-vertical skips, including all 10 audit cases. Screenshot suite 24/24 passed; 8 audit PNGs, 28 images in each phase/latest gallery, visually reviewed desktop/mobile in both themes. Actual initial JS still exceeds the 180 kB gate (audit 206.06 kB, shell 188.02); carried explicitly into T8, with shared-shell optimization as the next small task. Query/bundle measurements: `docs/perf/report-phase-1-settings-audit.md`. OpenAPI/Postman generation passed; Newman runner and load/Web Vitals gates remain T7/T8. Phase 1 is not complete.

## Implementation checkpoint — 2026-10-31 (Codex)

- Resumed after Claude's T3 commit `e6be251`; kept its uncommitted Supabase SDK dependencies and phase status changes. Current handoff: `docs/CLAUDE_HANDOFF.md`.
- Delegated implementation, QA, security and independent code review. Added T4 JWT verification and retained verified identity in request context; DB remains the only role/session authority.
- Fixed the security review's bounded-input finding: streamed 1 MiB JSON reader, cancellation, UTF-8 byte accounting, sanitized 413 and automatic OpenAPI documentation.
- Verified: frozen install, lint/typecheck, 1,505 unit/integration tests (50 credential tests; 53 PostgreSQL integration cases), OpenAPI/Postman generation, production build, 102.67 kB gzip initial JS, 8 desktop/mobile E2E. Local public Supabase JWKS: HTTP 200, ES256. No real Auth/session rows changed or read in this slice; no UI changed.
- Owner confirmed second TOTP/Admin reset and mixed-role `aal1` access (D22/D63). Security review: `docs/security/review-phase-1-auth-identity.md`; independent code review approved this slice. Full T4/Phase 1 remain in progress; no new commits, push or deployment in this session.

## Gaps (cannot be built yet)

| Item | Reason | Unblocked by |
|---|---|---|
| Auth administrative follow-ups | T4 sign-in/session completion shipped; invite resend/revoke/re-invite (D70) shipped in T6 slice 6; deactivation (+R04), D69 remain T6; hosted config drift remains T9 | T6/T9 |
| Orphan Supabase auth users (SEC-EML-01, T-A14) | Invite acceptance calls `ensureUser` before the locked re-check; a lost race (revoke / D69 email change) or abandoned Google start leaves a confirmed `auth.users` row with no `app_user` link — no access, but a stranger's email stays in Auth | Cron `/api/cron/auth-orphans` (24 h, skip pending invitees) — T9 or Phase 6 jobs |
| Audit page initial-JS headroom | `/settings/audit` is 179.99 / 180 kB — any change there fails PERF-04 | T8: free bytes on the audit route before the next audit change |
| Client handling of 401 `MFA_REQUIRED` | Settings mutations show generic «saveFailed» instead of Alert + link to `/mfa/verify` (wireframe §1.10) | T9 |
| Ban-client timeout test (SEC-ACT-05) | 10 s aborting timeout in `server/auth/admin.ts` has no unit test | T9 (fake timers + never-resolving fetch) |
| Purge vs `team_lead_priority` FK (restrict) | DG-20 anonymisation must not hard-delete users or must delete priority rows first; routing engine must read priorities only for eligible TLs (T-Z14) | Phase 3 / Phase 5 |
| Deterministic Postman generation | `scripts/postman.ts` emits random ids/examples → ~2.7k-line diff on every regeneration | T9 (fixed seed / strip generated ids) |
| Database rate limiter, Newman coverage, Lighthouse/k6 | Newman runner exists (Profile/Verticals/Audit); limiter consumption, remaining API folders and broader perf gates are pending | T4/T7/T8; do not claim full authentication or Phase 1 complete |
| Perf seed `pnpm db:seed:perf` (PERF-01) | Needs Phase 2 tables (candidates, vacancies, applications) | Phase 2 (SEED-1) |
| FKs `audit_log.candidate_id`, `entity_event.vacancy_id` / `candidate_id` / `application_id` | Parent tables don't exist yet (`docs/erd.md` §10) | Phase 2 |
| `vertical.default_bonus_scheme_id`, `app_setting.global_bonus_scheme_id` | Added together with `bonus_scheme` | Phase 4 |
| `change_feed` → Realtime trigger (ADR-007) | No feature publishes live changes yet | First live board (Phase 2–3) |
| `purge_log`, `app.purge_candidate`, `app.reapply_purges` (ARCH-04, DG-20) | Need the candidate PII tables | Phase 5 |
| Telegram bot (VAC-06, Phase 6) | Scope not defined by owner | Owner answers to Telegram questions |
| Perf test-token signer (perf env only key pair, `docs/perf/plan.md` §8.2) | Needs security-engineer review | Phase 1 security review |
| Supabase pooler / region / cold start / Realtime / Cyrillic trigram checks | Perf CI runs on local PostgreSQL (owner: no paid tier) | Staging free tier before launch (`docs/perf/plan.md` §8.7) |

## Owner decisions log

| Date | Decision | Ref |
|---|---|---|
| 2026-11-01 | Email change in Phase 1 only for not-yet-activated users (revoke + new invite), activated users later (Phase 5, ends sessions); revoked invite can be re-sent with a new link | PRD D69, D70, Q-153, Q-154 |
| 2026-10-31 | Recovery uses second TOTP or reset by another Admin, without recovery codes. Mixed-role users retain nonprivileged role grants at aal1; ADMIN/FINANCE grants require aal2 | PRD D22/D63, Q-30/Q-128, ADR-002 |
| — | Probation extension not allowed, only shorter | PRD D10, PROB-05 |
| — | Finance role included, sees Statistics only | PRD D12, STAT-08 |
| 2026-10-30 | No paid Supabase tier for perf tests; perf runs on local PostgreSQL 16 (Docker) | perf plan Q6 |
| 2026-10-30 | Mobile budget left to team: desktop keeps PERF-03; mobile 4G = CWV "good" (LCP < 2.5 s, INP < 200 ms, CLS < 0.1). App is mainly desktop | PERF-03, perf plan Q2 |
| 2026-10-30 | New BONUS-16: Admin sets/changes recruiter reward per vacancy (e.g. $1000 → $500), max once per 2 months; accepted offers keep their snapshot | BONUS-16, BONUS-02 |
| 2026-10-31 | Paid services: nothing now; Supabase Pro + Vercel Pro before launch; backups = free nightly pg_dump (30 d); Resend free, staff reminders in-app | Q-114..117 |
| 2026-10-31 | Candidate belongs to one vertical; transfer by Admin, Head Recruiter, Head HR; history kept | Q-13, CAND-06 |
| 2026-10-31 | PII in history stored separately, purged only by Admin purge; funnel counts only of what viewer can open; HR sees contacts, TL not; Finance reports = full name + application ID | Q-38, Q-15, Q-17, Q-23 |
| 2026-10-31 | Google login only when email = invite email (domain later); Admin invites and assigns roles | Q-29 |
| 2026-10-31 | No vertical deactivation | Q-37, ROLE-03 |
| 2026-10-31 | Role combos allowed; nobody approves/pays/adjusts own bonus; Head Recruiter may carry candidates and earn bonuses | Q-21, Q-44, Q-130 |
| 2026-10-31 | Block A (D1–D9, D11, D13) confirmed; + Head Recruiter assigns recruiters; **D4 changed: Head HR polygraph review mandatory** (confirm / not confirmed → retake or reject) | Q-01..12, POLY-05 |
| 2026-10-31 | 2FA mandatory for Admin + Finance; no CAPTCHA (invite-only); DOC/DOCX download-only until AV; DPAs before launch; Kyiv timezone for all | Q-128, Q-132, Q-129, Q-131, Q-40 |
| 2026-10-31 | "Go phase 1"; repo https://github.com/tolkyu/rcrt-app; all remaining Top-10 / phase-1 questions per recommendations (Q-14, Q-16, Q-22, Q-25, Q-32, Q-34..36, Q-43, Q-44, Q-46, Q-93, Q-133..135, Q-140, Q-141 = local only) | OPEN_QUESTIONS |
| 2026-10-31 | Designer mockups = target look for the whole app (docs/ux/reference). Approved: brand «Hiring» in UI; manual personal tasks (Ph5); private notes author-only (Ph3); optional candidate photo (Ph2); «Поділитися» link (Ph2); dashboard KPI row; stats funnel on our stages; no «Онлайн»; Google Calendar post-launch; primary colour contrast tweak | design-adoption |
| 2026-10-31 | PostgreSQL 17 instead of 16 (Supabase CLI supports 15/17 only) | Q-142, CLAUDE.md §2 |
| 2026-10-31 | Design adoption A-11…A-48 approved as recommended; KPI «Вийшли на роботу»; probation marker on every candidate card | PRD D64 |
| 2026-10-31 | Recruiters can't delete candidates (reject → archive; delete = Head Recruiter/Admin); clearing bonus flags Admin-only; previous TL loses vacancy control; vacancy number V-0001 | PRD D65–D67, VAC-07 |
| 2026-10-30 | Phase 6 input (not designed yet): vacancy is entered fully via Telegram bot, then appears in the app (`source = TELEGRAM_BOT`) | VAC-06 |
