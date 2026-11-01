# PROGRESS

Single log of phase status, deliverables, gaps and decisions. Updated at the end of every task.

## Phase status

| Phase | Scope (PRD §15) | Status | Gallery |
|---|---|---|---|
| 0 | Discovery & design | ✅ Done 2026-10-31 — owner approved Phase 1 | — |
| 1 | Foundation | 🔄 In progress (branch `phase-1`) | `screenshots/foundation/index.html` (404 only; full phase gallery pending) |
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
| T6 | Settings: users & invites, roles, verticals, TL priorities, audit viewer | senior-fullstack-engineer | ⏳ |
| T7 | Tests (integration, E2E, Newman), screenshots + gallery | qa-engineer | ⏳ |
| T8 | Perf seed + perf:check | performance-engineer | ⏳ |
| T9 | Security review, code review, fixes, verify | security-engineer, code-reviewer | ⏳ Carry-over from foundation review: CI action SHA pins, `pnpm audit` gate, Drizzle drift check, `format:check`, `NEXT_PUBLIC_`/static secret grep; DG-03 storage policy test on local Supabase; AGENTS.md/.codex duplication (owner call) |

## Implementation checkpoint — 2026-10-31 (Codex)

- Resumed after Claude's T3 commit `e6be251`; kept its uncommitted Supabase SDK dependencies and phase status changes. Current handoff: `docs/CLAUDE_HANDOFF.md`.
- Delegated implementation, QA, security and independent code review. Added T4 JWT verification and retained verified identity in request context; DB remains the only role/session authority.
- Fixed the security review's bounded-input finding: streamed 1 MiB JSON reader, cancellation, UTF-8 byte accounting, sanitized 413 and automatic OpenAPI documentation.
- Verified: frozen install, lint/typecheck, 1,505 unit/integration tests (50 credential tests; 53 PostgreSQL integration cases), OpenAPI/Postman generation, production build, 102.67 kB gzip initial JS, 8 desktop/mobile E2E. Local public Supabase JWKS: HTTP 200, ES256. No real Auth/session rows changed or read in this slice; no UI changed.
- Owner confirmed second TOTP/Admin reset and mixed-role `aal1` access (D22/D63). Security review: `docs/security/review-phase-1-auth-identity.md`; independent code review approved this slice. Full T4/Phase 1 remain in progress; no new commits, push or deployment in this session.

## Gaps (cannot be built yet)

| Item | Reason | Unblocked by |
|---|---|---|
| T4 sign-in/session completion | Magic-link/Google/refresh/invite flows, TOTP enrolment/reset, local dev-login and 12 h idle/7 day absolute enforcement not implemented by the credential slice | T4, with real local Supabase/mailbox E2E and fixture provisioning |
| Database rate limiter, Newman runner, Lighthouse/k6 | OpenAPI/Postman and error types exist; actual limiter consumption, API runner and broader perf gates are pending | T4/T7/T8; do not claim full authentication or Phase 1 complete |
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
