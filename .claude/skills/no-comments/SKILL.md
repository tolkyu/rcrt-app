---
name: no-comments
description: Strip unnecessary comments from the current slice diff; flag code that needs a rename/extract instead of prose
---

# No comments

Adapted from `michael-denyer/pstack-claude` (`skills/no-comments` + `agents/comment-sicko`), added by owner request 2026-11-17. The original spawns a pstack-only subagent and uses pstack skills (`/how`, `/why`, `/architect`); this version is self-contained so any agent can apply it by reading this file.

## Scope

The current slice diff (`git diff <slice-base>` + working tree), not the whole branch. Never touch files outside it.

## Kill by default

Narration, comments restating code, banners, commented-out code, workaround sermons, stacked JSDoc, "IMPORTANT / do not remove / fine for now" without proof. When unsure a keep applies, delete.

## Keep (the only exceptions)

- Legal/license headers; `// prettier-ignore`.
- Non-obvious behaviour forced by a dependency, platform, vendor or protocol we cannot change (e.g. Next.js, React, Supabase, Postgres, browser quirks). If the rule cannot be checked in their docs/source, keep it and report it as `HOLD`.
- Doc comments that define a public API contract (route handlers' OpenAPI, exported lib API).
- Issue/RFC/bug links that explain a constraint the code cannot express (e.g. `BUG-S3-14`).
- **Project rule (CLAUDE.md §4, takes precedence):** one short line explaining *why* on domain rules, routing, bonus maths, authz scoping and tricky SQL — preferably citing a PRD/decision ID (`PROB-05`, `D92`). Trim it to one line; never delete the PRD/decision reference.

## Our-code surprises

A comment that explains a surprise in our own code dies; mark the symbol `MUST KILL` (rename, extract, type, or reshape so it is obvious without prose). Fix trivial ones in the slice; report the rest as open work, never bolt on guards.

## Suppressions

`eslint-disable`, `@ts-ignore`, `@ts-expect-error`: look up the rule. Correctness/safety rule → remove the suppression and fix the code (or report `MUST KILL`). Style-only rule → may stay.

## Constraint comments

"do not change wording", "talk to X first": encode as a test, type or lint when cheap and in scope, then delete; otherwise delete and report the constraint as open.

## After editing

Rerun lint, typecheck and touched tests (PowerShell, `corepack pnpm`). Revert any edit whose check fails. Report: deletion count, `HOLD`s, `MUST KILL` flags (one line each), fixes, open items.
