# Performance review — Phase 2 V1 vacancies (list + detail)

PRD: PERF-02/03/04/05. Reviewer: performance-engineer, 2026-11-08. Executor times only (scratch PG 17 replica of migration 0011, synthetic data); endpoint P95 not yet measured.

## Verdict

No budget blocker. One scalability defect in the recruiter scope SQL (fix 1) and one first-load waterfall (fix 2) to close before commit.

## Budgets

| Budget                      | Result                                                                                                 | Status              |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| PERF-04 initial JS ≤ 180 kB | `/vacancies` 165.00, `/vacancies/[id]` 158.57, shell 154.74, `/settings/audit` 169.03; `/login` 179.34 | Pass                |
| PERF-02 list/detail P95     | DB executor: list 1.6–2.8 ms (admin/TL/HR/recruiter, 2k–100k rows), detail 0.11 ms                     | DB passes; P95 open |
| PERF-03 LCP/INP/CLS         | Vacancy routes not in Lighthouse/runtime specs                                                         | Gap                 |
| PERF-05 one query per list  | One statement per page (+ one rate-limit upsert when `q` set); no N+1; filters indexed                 | Pass                |
| PERF-01 perf seed           | No `db:seed:perf` script, no vacancies in it                                                           | Gap                 |

## Recruiter scope

Recruiters hold ASSIGNED and UNASSIGNED_OPEN grants, OR-ed by `scopeWhere`. The planner cannot turn `NOT EXISTS` into a join and hashes a sequential scan of all `vacancy_recruiter` rows on every list call (O(total assignments)).

| Recruiter list, first page      | 2k     | 30k     | 100k       |
| ------------------------------- | ------ | ------- | ---------- |
| `NOT EXISTS` (before)           | 3.4 ms | 31 ms   | 39–51 ms   |
| `(select count(*) …) = 0` (fix) | —      | ~2–3 ms | 2.8–3.2 ms |

Other scopes at 30k: global 1.7 ms, vertical 1.6 ms, ASSIGNED-only 0.8–4.1 ms. Search: rare term 100k ≈ 16 ms; 2-character term 100k ≈ 52–65 ms (no trigram) — watch.

## Recommended fixes (ranked)

| #   | Impact     | Fix                                                                                                                                   |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium     | `vacancy-scope.ts` UNASSIGNED_OPEN: replace `not exists` with scalar `(select count(*) …) = 0`; existing scope tests cover semantics  |
| 2   | Medium     | Prefetch the default preview (`items[0]`) on RSC and `setQueryData`; add intent prefetch on the preview button                        |
| 3   | Low-medium | Isolate search text state / `memo(VacanciesList)` to avoid re-rendering up to 200 row trees per keystroke; profile INP at `limit=100` |
| 4   | Low        | Messages: `settings` namespace is 76 % of the 39 KB shipped everywhere — move it to the settings layout provider (separate task)      |
| 5   | Gap        | Add vacancies to perf seed + `db:seed:perf`; `/vacancies` routes to Lighthouse/runtime specs; k6 list/detail script                   |
| 6   | Watch      | `VACANCY_SEARCH_MIN` 2→3 (owner decision); rate-limit upsert runs serially before list query                                          |
