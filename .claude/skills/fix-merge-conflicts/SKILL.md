---
name: fix-merge-conflicts
description: Resolve merge conflicts non-interactively, validate build and tests, and finalize conflict resolution
---

# Fix merge conflicts

## Trigger

Branch has unresolved merge conflicts and needs a reliable path to a buildable state.

## Workflow

1. Detect all conflicting files from git status and conflict markers.
2. Resolve each conflict with minimal, correctness-first edits.
3. Prefer preserving both sides when safe. Otherwise, choose the variant that compiles and keeps public behavior stable.
4. Regenerate lockfiles with package manager tools instead of hand-editing.
5. Run compile, lint, and relevant tests.
6. Stage resolved files and summarize key decisions.

## Guardrails

- Keep changes minimal and readable.
- Do not leave conflict markers in any file.
- Avoid broad refactors while resolving conflicts.
- Do not push or tag during conflict resolution.

## Output

- Files resolved
- Notable resolution choices
- Build/test outcome

## Project notes (recruiting-app)

- Source: `michael-denyer/pstack-claude`, added by owner request 2026-11-17.
- Lockfile: `corepack pnpm install` (never hand-edit `pnpm-lock.yaml`). Migrations: never merge two Drizzle migrations into one number — regenerate with `corepack pnpm db:generate` and check `drizzle/meta` journal order. Generated contracts: rerun `corepack pnpm api:openapi` and `corepack pnpm exec tsx scripts/postman.ts`. Screenshots: take either side, then regenerate only changed screens (CLAUDE.md §7).
- Checks: lint, typecheck, unit + touched integration (PowerShell).
