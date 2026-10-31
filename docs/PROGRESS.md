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
| T1 | Repo bootstrap, local Supabase stack, CI, security baseline (FND-1..5) | devops-engineer | 🔄 Baseline verified; integration/API/rate limiting/observability depend on T2–T4; DB version Q-142 |
| T2 | Drizzle schema + migrations (phase-1 tables), grants/triggers, demo + perf seed | database-engineer | ⏳ |
| T3 | Server core: request context, authz module + matrix tests, API wrapper/OpenAPI, audit + events | senior-fullstack-engineer | ⏳ |
| T4 | Auth: magic link, Google, invites, TOTP (Admin + Finance), sessions, dev-login | senior-fullstack-engineer + security-engineer | ⏳ |
| T5 | Design system shell, navigation per role, profile, states | ux-ui-designer + senior-fullstack-engineer | ⏳ |
| T6 | Settings: users & invites, roles, verticals, TL priorities, audit viewer | senior-fullstack-engineer | ⏳ |
| T7 | Tests (integration, E2E, Newman), screenshots + gallery | qa-engineer | ⏳ |
| T8 | Perf seed + perf:check | performance-engineer | ⏳ |
| T9 | Security review, code review, fixes, verify | security-engineer, code-reviewer | ⏳ |

## Implementation checkpoint — 2026-10-31 (Codex)

- Continued Claude's unfinished T1; existing product decisions and working changes preserved. Details and exact next tasks: `docs/CLAUDE_HANDOFF.md` (also linked from `CLAUDE.md`).
- Added runnable Next.js baseline, runtime env validation/local-tool guard, typed Ukrainian i18n, HTTP liveness, nonce CSP/REST CSRF, lint/type/test configs, CI, per-page gzip budget, isolated test PostgreSQL and screenshot tooling.
- Verified: frozen install, lint, typecheck, 36 unit tests, production build, 102.67 kB gzip initial JS (<180 kB), 8 E2E, 4 screenshot cases, Gitleaks source/history scans. Foundation gallery: `screenshots/foundation/index.html`.
- Isolated PostgreSQL 16.13 was healthy and was removed after verification; existing Supabase containers/data were preserved. Supabase CLI rejects version 16; Q-142 records the unresolved discrepancy.
- Next: T2 schema/migrations/grants/local-only seeds, then T3 server/authz/API and T4 auth. Full setup, full Phase 1 acceptance, auth-aware screens, Newman, Lighthouse/k6 and independent security/code review remain pending. No commits/push/deployment performed.

## Gaps (cannot be built yet)

| Item | Reason | Unblocked by |
|---|---|---|
| Full `pnpm setup`, migration/seed/integration commands | T2 files not implemented; setup fails early with a specific message | T2 schema, migrations, local-only demo/perf seed |
| PostgreSQL version alignment (Q-142) | PRD specifies 16; installed Supabase CLI rejects 16; existing local Supabase is 17 | Owner decision + ADR before changing the agreed stack; isolated test DB runs 16.13 |
| Newman/OpenAPI, database rate limiter, auth, operational PII-safe logging, Lighthouse/k6 | Require the server core and actual authenticated screens | T2–T8; current CI only runs implemented gates |
| Telegram bot (VAC-06, Phase 6) | Scope not defined by owner | Owner answers to Telegram questions |
| Perf test-token signer (perf env only key pair, `docs/perf/plan.md` §8.2) | Needs security-engineer review | Phase 1 security review |
| Supabase pooler / region / cold start / Realtime / Cyrillic trigram checks | Perf CI runs on local PostgreSQL (owner: no paid tier) | Staging free tier before launch (`docs/perf/plan.md` §8.7) |

## Owner decisions log

| Date | Decision | Ref |
|---|---|---|
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
| 2026-10-30 | Phase 6 input (not designed yet): vacancy is entered fully via Telegram bot, then appears in the app (`source = TELEGRAM_BOT`) | VAC-06 |
