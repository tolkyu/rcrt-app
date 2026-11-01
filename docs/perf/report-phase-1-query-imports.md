# Phase 1 — TanStack Query import optimization

Date: 2026-11-01. Scope: PERF-04, UI-04..07; one small follow-up to `a92f0fc`.

## Change

- Added `@tanstack/react-query` to the existing Next.js `optimizePackageImports` list. No dependencies, application behavior, authorization or data changed.
- Retained the existing menu implementation. Deferring navigation Sheets saved only 0.76 kB on the shell and increased the audit route by 1.11 kB, so that implementation was reverted.
- Added keyboard navigation/focus regression coverage and tablet/mobile navigation screenshots in both themes.

## Measured initial JavaScript

Production builds, gzip, page plus ancestor layouts using the unchanged `perf:size` script. Baseline: `a92f0fc`; final: query-import optimization only.

| Route | Before, kB | After, kB | 180 kB gate |
|---|---:|---:|---|
| App shell / home | 188.02 | 186.72 | Fail |
| Settings | 190.90 | 189.60 | Fail |
| Audit | 206.06 | 205.05 | Fail |
| Verticals | 194.66 | 193.31 | Fail |
| Profile | 195.30 | 194.28 | Fail |
| Public/auth routes | 102.97–175.35 | 103.00–175.38 | Pass |

The shell reduction is 1.30 kB. PERF-04 remains unmet; this is an incremental optimization, not completion of T8. API P95 and Web Vitals were not measured in this slice.

## Verification

- Clean production build (including lint and TypeScript) passed; 1,860 unit/integration tests passed.
- Full E2E: 52 passed + 6 existing intentional mobile-vertical skips; screenshot suite: 24/24. Four new tablet/mobile navigation images in both themes; each phase/latest gallery has 32 images with no missing files, visually checked by QA.
- Code reviewer approved the final configuration and tests.
- Next small performance task: investigate interaction-only loading of shared dropdown/tooltip code without changing keyboard behavior or hiding initial dependencies from the size script.
