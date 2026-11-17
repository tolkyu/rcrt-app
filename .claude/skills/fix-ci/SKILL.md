---
name: fix-ci
description: Find failing PR checks, inspect logs or external check links, and apply focused fixes
---

# Fix CI

## Trigger

Branch or PR CI is failing and needs a fast, iterative path to green checks.

## Workflow

1. Resolve the active PR and inspect `gh pr checks --json name,bucket,state,workflow,link`.
2. Inspect failed jobs and extract the first actionable error. Use GitHub Actions logs when available; otherwise use the check link to identify the failing command or service.
3. Apply the smallest safe fix.
4. Push, re-check the PR check set, and repeat until green.

## Guardrails

- Fix one actionable failure at a time.
- Prefer minimal, low-risk changes before broader refactors.
- Keep `gh pr checks` as the source of truth for overall PR CI state.

## Output

- Primary failing job and root error
- Fixes applied in iteration order
- Current CI status and next action

## Project notes (recruiting-app)

- Source: `michael-denyer/pstack-claude`, added by owner request 2026-11-17.
- Used by `devops-engineer` (CI owner) or the orchestrator. CI = GitHub Actions; reproduce locally with the same `corepack pnpm` script before pushing a fix.
- Never weaken a budget (`perf:check`, size-limit) or skip a check to get green; a flaky test gets a root-cause fix, not a retry.
