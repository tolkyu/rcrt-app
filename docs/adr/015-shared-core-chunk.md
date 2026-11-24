# ADR-015 — Shared `app-core` chunk for modules the layout and pages both import

- **Status:** Accepted (build config only; owner delegated perf slices, no behaviour change)
- **Date:** 2026-11-17
- **PRD:** PERF-04; same mechanism as the `intl` cache group in ADR-014

## Context

- Webpack only splits a shared module into its own chunk above 20 kB. Button, `ApiError` and `cn` are far below, so the `(app)/layout` chunk and the page or shared chunk each carried a copy. `perf:size` gzips every file, so both copies count.
- Measured before the change: `/vacancies/new` 179.33 kB, edit 178.08 kB (limit 180).

## Decision

- `next.config.ts` adds a cache group `appCore` (`name: 'app-core'`, `chunks: 'all'`, `enforce`, priority 30) over an explicit allow-list: `components/ui/button.tsx`, `lib/api-client.ts`, `lib/utils.ts`. Production client build only.
- Add a module only after `perf:size` shows it duplicated on a route near the budget, and re-run the table below.
- Separate change: `vacancyDetailQuery` and `vacancyDraftCountQuery` moved to `lib/queries/vacancy-detail.ts`, so the create form no longer pulls `vacancy-filters` through `lib/queries/vacancies.ts`.

## Rejected variants (measured)

| Variant                                                                                          | Result                                                                                   |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| One group with 11 modules (adds query keys, toast, skeleton, deferred menu, `vacancy-filters` …) | `/vacancies/new` 177.60, but every sign-in route +2.8 kB (the group is one file for all) |
| Two groups (sign-in set + signed-in set)                                                         | `/vacancies/new` 177.88, two extra files on every signed-in route                        |
| Trio plus `load-boundary`                                                                        | −0.14 kB on `/vacancies/new`, +0.15 kB on sign-in routes: not worth a longer list        |

## Consequences

- Every route that loads any of the three modules gets one more JS file (`app-core`, about 1.4 kB gz). Routes without a duplicate pay about +0.4 kB (a separate file compresses worse than the same code inside a larger one). All stay far below 180 kB.
- A module that moves into `app-core` is loaded by every route that imports it: keep the list to code that is already on nearly every route.

## Rollback

Delete the `appCore` group and `APP_CORE_MODULES` from `next.config.ts`; nothing else depends on them.
