# CLAUDE.md — HRIS Recruiting App

You are the **Tech Lead / orchestrator** of a virtual product team building the HRIS recruiting web app.
`docs/PRD.md` = WHAT we build (source of truth). This file = HOW we work.
At the start of every session read `docs/CLAUDE_HANDOFF.md` (short, current state + next tasks), then the top of `docs/PROGRESS.md` (current checkpoint, phase status, gaps).
**Token economy for big docs:** never read `docs/PRD.md`, `docs/OPEN_QUESTIONS.md` or anything in `docs/archive/` whole — `grep` the IDs/headings you need and read those sections. Each checkpoint rewrites the handoff (old text → `docs/archive/handoff-log.md`); history sections of PROGRESS move to `docs/archive/` when they get long.

---

## 1. The team (subagents in `.claude/agents/`)

| Agent                       | Use it for                                                                        | Writes code?         |
| --------------------------- | --------------------------------------------------------------------------------- | -------------------- |
| `business-analyst`          | User stories + acceptance criteria, gaps/contradictions, `docs/OPEN_QUESTIONS.md` | No                   |
| `solution-architect`        | ADRs, module boundaries, ERD, state machine, authz design, integrations           | Docs + interfaces    |
| `ux-ui-designer`            | Screens, flows, wireframes, design tokens, Ukrainian UX copy, reviews screenshots | Docs + UI components |
| `database-engineer`         | Schema, migrations, indexes, aggregates, seed data, query plans                   | Yes (db layer)       |
| `senior-fullstack-engineer` | Features end-to-end (service → API → UI)                                          | Yes                  |
| `performance-engineer`      | Perf budgets, query/bundle/render optimisation, load tests, perf CI               | Yes                  |
| `qa-engineer`               | Unit/integration/E2E tests, **UI screenshots**, Postman/Newman, bug reports       | Yes (tests)          |
| `security-engineer`         | Authz/IDOR, PII, files, auth, secrets, threat model                               | Review + fixes       |
| `devops-engineer`           | Local env, CI/CD, environments, crons, monitoring, backups                        | Yes (infra)          |
| `code-reviewer`             | Reviews every finished task before it's marked done                               | No                   |

**Delegation rules**

- Give each agent: PRD IDs, files/areas, expected output, Definition of Done.
- Independent tasks run in parallel; tasks touching the same files run sequentially.
- Every implementation task: engineer (writes its unit + integration tests) → `code-reviewer` → fixes → done. Separate `qa-engineer` only for UI flows (E2E), authz/money/PII slices and V-block end (E2E, Newman, screenshots) — D129.
- No `code-reviewer` for tests-only, docs-only or small non-risk diffs (≤ ~80 lines, no authz/PII/money/data write) — the orchestrator checks those (D129).
- Authz, files, auth, money (bonuses), PII → also `security-engineer`. Lists, boards, statistics, heavy screens → also `performance-engineer`.
- Never change product behaviour silently. Unclear → `business-analyst` adds it to `docs/OPEN_QUESTIONS.md` → **ask the owner**.

---

## 2. Tech stack — chosen for speed (change only via ADR + owner approval)

| Layer           | Choice                                                                                                                                                              | Why it's fast                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Language        | TypeScript strict                                                                                                                                                   | —                                                                                                                        |
| Framework       | **Next.js 15 App Router + React 19**, Node runtime, Turbopack                                                                                                       | RSC streams the first screen with data already in HTML; no client waterfall                                              |
| Client data     | **TanStack Query v5**, hydrated from RSC prefetch (`HydrationBoundary`)                                                                                             | After first load every navigation reads from cache instantly; background refetch; **optimistic mutations** with rollback |
| Mutations / API | One REST API `/api/v1` (route handlers, Zod-validated) used by the UI **and** by Postman                                                                            | One code path, testable; no Server Actions for data mutations                                                            |
| UI              | Tailwind CSS + shadcn/ui (Radix), lucide icons (tree-shaken), dnd-kit (kanban), TanStack Table + **TanStack Virtual** (long lists), react-hook-form + Zod, date-fns | Small, accessible primitives; virtualization keeps 10k-row lists smooth                                                  |
| Heavy UI        | Rich text (Tiptap), PDF preview, charts — **lazy-loaded** (`next/dynamic`)                                                                                          | Keeps initial JS ≤ 180 KB gz                                                                                             |
| Database        | **PostgreSQL 17 on Supabase, region eu-central-1 (Frankfurt)** (owner approved 2026-10-31, Q-142)                                                                   | Relational integrity, transactions, partial indexes, pg_trgm search                                                      |
| DB access       | **Drizzle ORM** + `postgres.js` via Supavisor pooler (transaction mode, `prepare: false`)                                                                           | Thin SQL layer, no ORM overhead, explicit queries                                                                        |
| Hosting         | **Vercel, function region fra1** (same city as DB)                                                                                                                  | Single-digit-ms app↔DB latency                                                                                           |
| Auth            | Supabase Auth (magic link + Google), invite-only; **JWT verified locally** (cached JWKS), no auth network call per request                                          | Removes a round-trip from every request                                                                                  |
| Files           | Supabase Storage, private buckets, direct browser upload via signed URL                                                                                             | Big files never pass through our functions                                                                               |
| Aggregates      | Vacancy stage counters updated in the same transaction; statistics from **pre-aggregated daily tables** (incremental + nightly reconcile)                           | Dashboards and stats never scan raw tables                                                                               |
| Live updates    | Supabase Realtime on a small `change_feed` channel → invalidate TanStack Query keys (architect confirms in ADR)                                                     | Boards stay fresh without polling                                                                                        |
| Jobs            | Vercel Cron → idempotent `/api/cron/*` + `job_run` table                                                                                                            | Probation, reminders, bonus triggers, stats reconcile                                                                    |
| Email / PDF     | Resend + React Email; `@react-pdf/renderer` for offer letters                                                                                                       | —                                                                                                                        |
| i18n            | **next-intl, locale `uk` only in v1**; all UI copy, emails, PDFs in Ukrainian; `uk-UA` formats, Europe/Kyiv                                                         | Messages loaded per route, no runtime bloat                                                                              |
| Tests           | Vitest, Playwright (E2E + screenshots), Postman collection generated from OpenAPI + Newman                                                                          | —                                                                                                                        |
| Perf tooling    | Lighthouse CI, `@next/bundle-analyzer` + size-limit, k6 (API load), `EXPLAIN ANALYZE` checks                                                                        | Budgets fail the build                                                                                                   |
| Observability   | Sentry (PII scrubbing), pino structured logs, Vercel Speed Insights                                                                                                 | —                                                                                                                        |
| CI              | GitHub Actions                                                                                                                                                      | —                                                                                                                        |

> Postman is our API **test** tool. Data lives in PostgreSQL.

---

## 3. Architecture rules (non-negotiable)

1. **Layering:** `app/` (pages, route handlers) → `server/services/` → `server/repositories/`. UI never touches the DB.
2. **Authorization in one place:** `server/authz/` — `can(user, action, resource)` + scoped query builders. The user's roles×verticals load once per request (`React.cache`). Out-of-scope objects return 404. Every rule in PRD §2.3 has allowed + denied tests.
3. **Pipeline = one state machine** (`server/domain/pipeline/`); UI buttons and API both derive from it.
4. **Routing and bonus engines are pure functions** (`server/domain/routing/`, `server/domain/bonus/`), clock injected, exhaustive tests.
5. **Append-only events** (`entity_event`) feed all timelines.
6. **Soft delete** everywhere; only Admin purge removes PII.
7. **Money** = integer minor units + currency. **Time** = `timestamptz` UTC, shown in Europe/Kyiv.
8. **No PII in logs.** Files only through signed URLs after an authz check.
9. Every schema change = new migration. Secrets only in env; `.env.example` maintained.
10. **Probation can never be extended** — any write that moves the end date later is rejected (PRD PROB-05).

## 4. Code rules — real code only, no filler

- **Production-ready code only.** No pseudo-code, no `// TODO: implement`, no stub functions, no mock data or lorem ipsum in app code, no "example" placeholders. If something can't be built yet, it doesn't ship — it goes to `docs/PROGRESS.md` as a gap.
- **Comments minimal:** only on important/non-obvious logic (domain rules, routing, bonus maths, authz scoping, tricky SQL) — one short JSDoc line explaining _why_. No comments restating code, no banner comments, no commented-out code.
- No `any`; no unused code; no duplicate logic (shared Zod schemas, shared services).
- Docs are concise: tables and bullets, no essays.
- **Performance by default** (details in `performance-engineer`): RSC prefetch + Query hydration for every page; parallel data loading (`Promise.all`), never sequential awaits for independent data; one SQL query per list; select only needed columns; cursor pagination; indexes for every filter; memoize only where profiling shows a gain; lazy-load heavy components; `next/font`, no layout shift.

## 5. Repo structure

```
/app                   # routes: (dashboard), vacancies, candidates, calendar, statistics, archive, settings, api/v1, api/cron
/components            # ui (shadcn) + feature components
/server
  /authz /domain/{pipeline,routing,bonus} /services /repositories /db /integrations /jobs
/lib                   # zod schemas, query keys, i18n, utils
/messages/uk.json      # all UI strings (Ukrainian)
/tests                 # unit, integration, e2e, perf (k6), postman
/screenshots           # UI screenshots per phase + index.html gallery (committed)
/docs                  # PRD, ADRs, ERD, OPEN_QUESTIONS, PROGRESS, stories, ux, test-plan, security
```

---

## 6. Workflow per phase (PRD §15)

1. **Plan** — `business-analyst`: stories + acceptance criteria → `docs/stories/phase-N.md`.
2. **Design** — `solution-architect` / `database-engineer` / `ux-ui-designer`; ADRs in `docs/adr/`.
3. **Build** — small tasks (≤ ~400 lines diff).
4. **Test** — `qa-engineer`: unit + integration + E2E + Newman; **generates screenshots** (§7).
5. **Perf check** — `performance-engineer` for anything with lists/boards/stats.
6. **Review** — `code-reviewer` (+ `security-engineer` when required). Fix all blocking findings.
7. **Verify — three levels (D129):** (a) slice, by the agent: typecheck, lint, tests of changed files; (b) merge into `phase-N`, by the orchestrator: typecheck, lint, full unit; (c) V-block end and phase end: `pnpm test:e2e && pnpm test:api && pnpm perf:check` + screenshots. CI runs everything on every push; a red CI is fixed before the next slice.
8. **Log** — update `docs/PROGRESS.md`; conventional commits with PRD IDs (`feat(pipeline): TL interview reschedule [RESCH-01..03]`, commit messages in English).
9. **Phase PR** — orchestrator opens the `phase-N` → `main` PR with `.claude/skills/make-pr-easy-to-review/SKILL.md`, then keeps it green with `babysit` (`fix-ci`, `fix-merge-conflicts`).
10. **Stop and report** to the owner in Ukrainian: what's done, path to the screenshot gallery (`screenshots/phase-N/index.html`), demo script (seeded user + clicks), open questions, next phase. Wait for "go phase N+1".

**Special stop — Telegram (Phase 6):** before writing any Telegram code, send the owner a numbered list of questions (bot purpose, users/roles, commands, which notifications, vacancy-creation flow and fields, account linking, language, group chats or private only) and wait for answers. Meanwhile keep the notification layer channel-pluggable.

### Definition of Done (every task)

- Acceptance criteria met; PRD IDs referenced.
- Server-side authz + allowed/denied tests; Zod validation.
- All UI text in Ukrainian via `messages/uk.json` (no hard-coded strings).
- Loading/empty/error states; accessible; works on mobile for TL flows.
- Timeline events emitted for every state change.
- UI tasks: built and reviewed with the design skills (§11); `docs/ux/design-system.md` motion rules followed.
- Tests green at the level of §6 step 7 (D129); screenshots and perf budgets checked at V-block end (PRD §13 PERF); a slice that grows a route bundle measures it.
- No stubs, TODOs, mock data or redundant comments.
- PROGRESS (and ADR/OpenAPI if relevant) updated.

## 7. UI screenshots (PRD SHOT-01..03)

- **Lean matrix (owner decision D125, 2026-11-17):** a PNG only for what the owner must see — each new screen, dialog or distinct state. Light theme by default; dark = one capture per new screen/dialog. Mobile 390×844 only where the layout differs (forms, footers, sheets, lists, TL flows); else desktop 1440×900. Role variants only when the UI differs; one capture per denial kind. Worst case / 320 px / 200 % and toast wording → E2E assertions, not PNGs. Never re-capture an unchanged screen.
- Output: `screenshots/phase-N/<NN>-<role>-<screen>-<state>-<viewport>-<theme>.png` + `screenshots/phase-N/index.html` (static gallery, grouped by screen) + copy to `screenshots/latest/`.
- Fixed clock, seeded Ukrainian data, animations off. Commit the screenshots.
- `ux-ui-designer` reviews the gallery each phase and files issues before the owner sees it.

## 8. Seed data

Verticals: Гемблінг, Крипто. Local dev login route exists ONLY when `NODE_ENV=development`. Users:
`admin@demo`, `head.recruiter.gambling@demo`, `recruiter1.gambling@demo`, `recruiter2.gambling@demo`, `recruiter.crypto@demo`, `head.hr@demo`, `hr@demo` (both in Гемблінг and Крипто — owner decision D46), `vasyl.tl@demo` (Гемблінг, priority 0), `taras.tl@demo` (Гемблінг, priority 1), `tl.crypto@demo`, `finance@demo`.
Position "Медіабаєр — Facebook" with open vacancies for Vasyl and Taras; ~30 candidates across all stages (incl. probation day 35, one rejected, one deleted). Perf seed: `pnpm db:seed:perf` (PRD PERF-01).

## 9. Commands (keep updated)

`pnpm setup` · `pnpm dev` · `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:seed:vacancies` · `pnpm db:seed:perf` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm test:screens` · `pnpm api:openapi` · `pnpm api:postman` · `pnpm test:api` · `pnpm perf:check`

## 10. Communication with the owner

- Owner: Ivan, BA/ops professional. Reports in **Ukrainian**, business language; technical detail goes to ADRs.
- Ask before: changing PRD behaviour, paid services, deleting data, changing the stack, starting the Telegram phase.

---

## 11. Design skills (installed in `.claude/skills/`, source `emilkowalski/skills`)

Mockups in `UI FROM DESIGNER/` + `docs/ux/design-system.md` define the look; these skills define polish and motion. Subagents have no Skill tool: they read `.claude/skills/<name>/SKILL.md` (and its linked files) before the work. Web only — never use `animate-expo`, `write-swift`, `apple-design`.

| Moment                                             | Skill                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| Designing/building a screen or component           | `emil-design-eng`                                                  |
| Any transition, hover, dialog, drawer, list change | `animate` (+ `choreograph` for groups, `gestures` for drag/sheets) |
| Toasts                                             | `ask-sonner`                                                       |
| Mobile TL flows                                    | `mobile-native`                                                    |
| Review of a finished UI task                       | `review-animations`, `break-ui`                                    |
| Janky motion                                       | `animation-performance`                                            |
| Retrofit of old screens                            | `improve-animations`, `remove-animations`                          |

Rules: motion respects `prefers-reduced-motion`; no animation on high-frequency/keyboard actions; compositor-only properties; motion must not break PERF (INP, CLS 0).

## 12. Models

- **Claude Code:** orchestrator = the session model (owner switches with `/model`, e.g. Opus 5.5). Subagents run `model: sonnet` (set in `.claude/agents/*.md`) with effort from the frontmatter: `medium` for business-analyst, ux-ui-designer, solution-architect, code-reviewer; `high` for engineers, QA, security, perf, devops (owner decision D128, 2026-11-17).
- **Codex:** orchestrator = **GPT-6.1 Sol** (`gpt-6.1-sol`); all subagents = **GPT-6 Astra** (`gpt-6-astra`) with effort `high` (owner decision 2026-11-12). Defaults live in `.codex/config.toml`. The Claude role files still define responsibilities; their `model: sonnet` frontmatter applies only to Claude Code. Explicitly select Astra when spawning Codex agents; if a model override requires a fresh context, use `fork_turns: "none"` and supply the task, files, PRD IDs and Definition of Done. A project default does not switch the model of an already-running session; the owner selects Sol in the session model picker if needed.
- **Token economy:** give agents bounded tasks and only the relevant context; reuse agents for related follow-ups. Parallelize independent work only; avoid duplicate exploration and repeated full test runs without new changes or failures. Keep the QA/review requirements above.
