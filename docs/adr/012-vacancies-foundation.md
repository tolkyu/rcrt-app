# ADR-012 — Vacancies foundation and staged reads

- **Status:** Accepted for the first Phase-2 increment
- **Date:** 2026-11-06
- **PRD:** VAC-01..04/07, VIS-01..03, ROLE-06, D1/D19/D24/D43/D53/D67/D75..78, PERF-02/04/05

## Context

Foundation already provides permission grants, scoped repositories, request context, audit/events and RSC/TanStack hydration. Vacancies, positions and recruiter assignments have no tables yet. Applications, pipeline transactions and bonus schemes arrive in later increments. The designer reference covers that larger product, so the first read screen must display only persisted, supported facts.

## Decision

### First increment

- Add real `position`, `vacancy` and `vacancy_recruiter` persistence, a scoped list and a readable vacancy overview/detail.
- Search title and public vacancy number; initial filters are vertical, status and urgency. Additional filters ship with independently scoped option queries.
- No create/edit, assignment, cloning or lifecycle controls until their write services ship. No candidate, funnel, hires or bonus blocks until those sources and permissions exist.
- Demo rows live in the database seed only. Initial seed statuses are DRAFT/OPEN/ON_HOLD/CANCELLED; FILLED requires a real hire. No application or hire counts are invented.
- The full vacancy module remains incomplete after this increment. Creation, mutations, timeline display, applications and counters retain separate acceptance criteria.
- Follow-on writes use the owner's D75..78 decisions: Admin/Head Recruiter manage the position catalog and assign TLs; recruiter-initiated vacancies may lack a TL until submission/routing; assigned recruiters edit description/requirements only; vacancy probation defaults to 90 and stays in 30..90, managed only by Admin/Head HR. Detailed field/status permissions remain in the PRD and centralized catalog.

### Additive schema

| Table               | Initial columns and integrity                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `position`          | UUID, vertical FK, nonempty name, active flag, version/timestamps and actor references; unique `(vertical_id, lower(name))` and `(id, vertical_id)`                                                                                                                                                                                                                         |
| `vacancy`           | UUID, globally allocated `public_no`, vertical FK, nullable position, nonempty title, nullable TL FK, persisted `recruiter_initiated`, status, positive headcount, optional seniority/work format/employment/location, optional salary bounds/currency, priority flag, probation days, source, opened/closed timestamps, version/timestamps/actors and soft-delete metadata |
| `vacancy_recruiter` | `(vacancy_id,user_id)` PK, assignment time/actor FKs, reverse `(user_id,vacancy_id)` index; assignment removal is an audited/event-producing hard delete                                                                                                                                                                                                                    |

- Composite `(position_id,vertical_id)` FK targets `position(id,vertical_id)`; vacancy exposes unique `(id,vertical_id)` for later application FKs.
- Use the ERD status/source/priority/work-format sets. Seniority/employment labels remain stored text until the owner's options are settled; this read increment does not introduce a choice list.
- Check headcount >0, probation 30..90 (default 90; Q-50), positive version, nonnegative ordered salary bounds with a matching currency, and lifecycle timestamp consistency: closed iff FILLED/CANCELLED; every non-DRAFT row has `opened_at`.
- Do not add nullable references to absent bonus tables or preemptive aggregate tables. Rich-text documents arrive with a validated document schema and safe renderer/editor.
- Add the `entity_event.vacancy_id` FK when the parent table exists; verify existing event rows and update integration fixtures that previously used arbitrary vacancy UUIDs. Never rewrite an applied migration or append-only events to make that FK pass.
- Runtime grants are SELECT-only for this read increment. Identity-sequence usage and write grants arrive with the corresponding write migration; runtime never gets sequence reset or schema ownership. Position versioning arrives with catalog writes.

### Public numbers

PostgreSQL allocates a unique positive bigint identity/sequence value. API/display code formats it as `V-` plus at least four digits (`V-0001`, `V-10000`). Keep UUIDs for routing and relationships; expose bigint values as decimal strings at JSON boundaries. Allocation is concurrent-safe and gaps are acceptable. Never derive the next number with `MAX + 1`, recycle deleted numbers or reset the sequence in normal seed runs.

### Authorization

Add a vacancy `ScopeAdapter` beside the existing vertical/user adapters:

| Scope           | SQL predicate, in addition to live-row filtering                                                 |
| --------------- | ------------------------------------------------------------------------------------------------ |
| GLOBAL          | All live vacancies                                                                               |
| VERTICAL        | Vacancy vertical belongs to the grant                                                            |
| OWN             | Current `team_lead_id = me` within the grant's verticals; creation grants no permanent TL access |
| ASSIGNED        | Matching `vacancy_recruiter` row within the grant's verticals                                    |
| UNASSIGNED_OPEN | OPEN, no recruiter-assignment rows, within the grant's verticals                                 |

- List and detail use the same `vacancy.read` predicate. Detail uses `findVisibleOrThrow`; absent/out-of-scope/deleted rows return 404. Finance gets route-level 404 before parsing filters or IDs. Withheld Admin grants retain existing MFA recovery behavior.
- Mixed roles OR their existing scoped grants. HR/Head HR read vacancies by vertical; their candidate-stage restriction does not restrict vacancy reads.
- D53's read-only vacancy access through owned applications cannot arise before applications exist. Keep that branch closed now. Add a dedicated read scope, SQL/in-memory parity and allowed/denied tests before the first application/routing feature; never broaden recruiter reads to the whole vertical as a substitute.
- Vacancy counts and future participant autocomplete must derive from scoped vacancies, not unrestricted users or assignments. The vertical selector reuses the existing role-visible vertical directory: those names are already permitted independently, while every vacancy query still intersects its own read scope. Structured user contacts are not needed by the vacancy DTO.

### User lifecycle dependency

Persisting real work activates ROLE-06/D24/D43 for existing user administration:

- Share a repository predicate/summary for live vacancies in DRAFT/OPEN/ON_HOLD led by or assigned to a user.
- Deactivation checks all such work after the existing invite → user → roles locks and D45 checks, before provider ban, session revocation or app writes. Reject with 409 `USER_HAS_OPEN_WORK`; the UI explains that work must be reassigned first.
- Role removal checks work whose eligibility is lost in the proposed remaining role set, by vertical. TEAM_LEAD work requires that role; assigned recruiter work may retain RECRUITER or HEAD_RECRUITER. Removing one compatible role must not strand work or block solely because another compatible role remains.
- Guard reads do not lock vacancy rows. Future creation/assignment/TL-change/resume services first lock all affected target user rows in stable UUID order (`FOR SHARE`, or `FOR NO KEY UPDATE` when the row is also written; plain FK `FOR KEY SHARE` does not conflict with the lifecycle `NO KEY UPDATE` and is not enough), then validate accepted/active membership, then lock/write the vacancy. They must never acquire a user lock after a vacancy lock. This serializes assignment against deactivation/role removal without lock inversion.
- Add role-removal and deactivation denial tests proving no provider call, role/session mutation or timeline/audit success event occurs on refusal. Later application/polygraph/offer work extends the same lifecycle guard before those tables ship.

### Query and API boundaries

- `app/(app)/vacancies` → `server/services/vacancy` → `server/repositories/vacancy`; the UI never imports DB modules. REST handlers use the same services through `defineRoute` with declared permissions and shared Zod contracts.
- `GET /api/v1/vacancies` returns a bounded cursor page of minimal scalar summary fields, vertical/position names, current TL name and recruiter identities. `GET /api/v1/vacancies/{id}` returns the same visible identity plus supported overview fields. No events, salaries or user contacts are smuggled into list metadata.
- A stable descending public-number keyset provides total order without offset pagination. Use one SQL per list: scoped filtered base, bounded page, page-local recruiter aggregation and optional scoped total in one statement. No per-row service/DB calls.
- Index the live ordering and vertical/status/TL filters, title trigram search, public number uniqueness and reverse recruiter assignment lookup. Benchmark representative broad and narrow scopes with EXPLAIN before increasing filter/sort combinations.
- Page RSC loads independent visible data in parallel and prefetches the exact shared query keys. Client HTTP requests use the same contract; existing navigation/session infrastructure stays reusable. Render one responsive presentation; cap retained rows or lazy-load TanStack Virtual beyond 100 loaded rows.
- A chosen vacancy is represented in the URL; direct detail fetches still scope independently. Show real loading, filtered-empty, initial-empty, missing-detail and retryable-error states.

## Consequences

- The owner can inspect a genuine vacancy list and detail using the established Hiring shell, with the same records and visibility in API/browser tests.
- User administration cannot orphan the first persisted vacancy work. Reassignment controls remain a following write increment; until then the actionable guard refuses the destructive operation.
- Initial render stays below the existing 180 kB gzip budget; heavy rich text, candidate lists and bonus code do not enter this route yet.
- Database, security and performance reviews must approve the migration/scope/query implementation; engineer → QA/screenshots → code review remains required before the increment is done.
