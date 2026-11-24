# ADR-014 — Precompiled ICU messages (next-intl `messages.precompile`)

- **Status:** Accepted (experimental next-intl option); owner approved 2026-11-16 («мені окей»)
- **Date:** 2026-11-16
- **PRD:** PERF-04, UI-05; builds on ADR-009 (next-intl, `uk` only)

## Context

- The default next-intl runtime parses ICU strings in the browser (formatjs parser, skeleton parser, `intl-messageformat`): about 12 kB gz on every route, while `/vacancies/new` and `/login` sat at the 180 kB budget.
- The catalog (`messages/uk.json`, ~1,365 strings) is static and known at build time.

## Decision

- `next.config.ts` passes `experimental.messages { path: './messages', format: 'json', locales: 'infer', precompile: true }` to `createNextIntlPlugin`. A webpack loader compiles every catalog string with `icu-minify` at build time; `use-intl/format-message` is aliased to `format-only`, which only formats compiled messages.
- Only production builds (`next build` / `next start`) use it: the Turbopack loader needs Next 16, so `next dev --turbopack`, Vitest and Playwright dev-ui keep the runtime parser (`development` check in `next.config.ts`).
- Catalog rules: strings only (no arrays, no `t.raw`); a literal `<`, `{` or `'` that is not ICU is quoted (`'<'`). Both are enforced by the build (the loader throws) and by the guard below.
- Direct readers of the raw catalog: `app/global-error.tsx` (`errors.appError*`) and `server/integrations/email/templates.ts` (`createTranslator`, aliased to `format-only` in the server bundle). Plain strings compile to themselves, so the first is safe; the second formats through the same alias.
- A shared `intl` cache group in `next.config.ts` keeps the (now small) formatter in one chunk instead of one copy per nested provider.

## Risks

| Risk                                                                      | Mitigation                                                                                                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dev/test (runtime parser) and production (precompiled) format differently | `tests/unit/i18n/precompile-parity.test.ts`: every leaf, fixed argument matrix (plural categories, select branches, number, date, tags), compiled vs runtime, 0 differences required |
| Experimental API changes between next-intl releases                       | `next-intl` and `use-intl` pinned to the same exact version (asserted by the same test)                                                                                              |
| A new message shape the compiler rejects or formats differently           | The parity test and `pnpm build` both fail; the raw `global-error` keys are asserted to stay plain strings                                                                           |

## Rule: bumping

Bump `next-intl` and `use-intl` together (exact versions, same number). Re-run the parity test, `pnpm build`, `pnpm perf:size` and the E2E suite (production server) before merging.

## Rollback

Remove the `experimental.messages` block from `next.config.ts` (and the `intl` cache group if desired). Nothing else changes: the catalog stays plain JSON, `t.raw`/arrays become allowed again, cost is ≈12 kB gz on every route (`/vacancies/new` and `/login` return to the budget edge).
