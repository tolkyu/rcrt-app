---
name: deslop
description: Remove AI-generated code slop and clean up code style
---

# Remove AI code slop

Check the diff against the branch's base and remove AI-generated slop introduced in the branch. The base is the PR's base branch, else the branch this one was cut from, else the repository's default branch. Include uncommitted changes.

## Focus Areas

- Extra comments that are unnecessary or inconsistent with local style
- Defensive checks or try/catch blocks that are abnormal for trusted code paths
- Casts to `any` used only to bypass type issues
- Deeply nested code that should be simplified with early returns
- Other patterns inconsistent with the file and surrounding codebase

## Guardrails

- Keep behavior unchanged unless fixing a clear bug.
- Prefer minimal, focused edits over broad rewrites.
- After editing, rerun the checks that verified the change (tests, type check, and the driver skill for UI work) and report their results.
- Revert any edit whose check fails.
- Keep the final summary concise (1-3 sentences).

## Project notes (recruiting-app)

- Source: `michael-denyer/pstack-claude` (plugins/pstack/skills/deslop), added by owner request 2026-11-17.
- Scope = the current slice's diff (`git diff <slice-base>`), not the whole `phase-2` branch vs `main`.
- Local style = CLAUDE.md §4 (one-line *why* comments, no `any`, no stubs) and `docs/engineering-self-check.md`.
- Keep defensive code that guards real failure paths named in the self-check (rejected chunk imports, lost responses, retries).
- Checks to rerun: lint, typecheck, touched unit/integration/E2E (PowerShell, `corepack pnpm`).
