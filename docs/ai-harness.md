# Shared AI engineering harness

Task HARNESS-01 (tooling, PRD n/a). Engineering policy: [CLAUDE.md §13](../CLAUDE.md). Shared entry: [AGENTS.md](../AGENTS.md). Codex and Claude Code each orchestrate their own session; neither orchestrates the other.

## Everyday use

1. Start either tool in the checkout. Read the current handoff and PROGRESS top; compare branch, HEAD and dirty paths. State outcome, acceptance criteria, complexity, risk and file ownership. SIMPLE work stays in the main session unless a specific benefit requires help.
2. Before edits, generate a unique session ID, for example with `node -e "console.log(require('node:crypto').randomUUID())"`. Run `node scripts/ai-edit-lease.mjs acquire <id>`. Assigned workers share that lease with disjoint files. `node scripts/ai-edit-lease.mjs status` is read-only. Another orchestrator waits or uses an isolated worktree. The lease serializes all writers in one checkout, deliberately stricter than per-file coordination.
3. Delegate only bounded outputs, at most two open workers, no nested agents. Use existing responsibilities in `.claude/agents/`; Codex adapters live in `.codex/agents/`. Preserve uncommitted work. A review is read-only. Inspect each completion claim against the diff and test evidence.
4. Run relevant gates below. Count at most two repair attempts per failure across all workers/models; after two failed repairs, escalate with evidence. Do not repeat a passing full suite or spawn a replacement to reset the counter.
5. Record the compact handoff below, then `node scripts/ai-edit-lease.mjs release <id>`. A crashed session leaves a lease; never auto-expire or steal it. Confirm the owning session has stopped and obtain explicit owner recovery before removing a stale/corrupt `.cache/ai-edit-lease`. The recorded PID belongs to the short-lived lease command and is diagnostic only.

The lease is cooperative and cannot stop external editors or old clients. Separate worktrees have separate checkout leases; integrate sequentially. The shared build/integration/Playwright lock in `docs/CLAUDE_HANDOFF.md` still applies across worktrees. Do not launch heavy verification concurrently.

## Model and task routing

| Tier             | Codex adapter                                                                   | Claude Code                                                                   | Scope                                                                        |
| ---------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Strong reasoning | Sol High: solution-architect, security-engineer, critical-specialist            | Capable session model for final decisions; existing specialist Sonnet efforts | Architecture, critical risk, complex diagnosis and final technical decisions |
| Balanced         | Sol Medium: existing ordinary roles and orchestrator                            | Existing Sonnet role aliases; D128 efforts unchanged                          | Implementation, integration, substantial review                              |
| Fast             | Direct CLI first; repository-explorer = Sol Low for useful read-only delegation | Haiku repository-explorer or runtime-exposed built-in Explore                 | Targeted discovery and routine checks; never critical approval               |

No new model family is enabled. Low reasoning effort does not establish lower pricing. Check active runtime access before using the new explorer role; restart/reload may be required. If unavailable, handle the question directly or use a verified balanced role. Critical fallback follows CLAUDE §12 without exceeding the two-repair limit. No Luna adoption or unmeasured savings claim.

Complexity guides decomposition: SIMPLE = one narrow change; MEDIUM = bounded feature/fix; COMPLEX = cross-module or architecture. Risk independently selects gates: small / standard / critical from CLAUDE §12. A small authz fix remains critical. Do not invoke every role just because a task is complex.

## Actual quality gates

Use `corepack pnpm` if `pnpm` is not on PATH. Choose explicit relevant test files; the commands below are a matrix, not instructions to run every row for every task.

| Change                                   | Required evidence                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Harness-only                             | `python scripts/check-ai-harness.py` (Python 3.11+), `node --check scripts/ai-edit-lease.mjs`, `node --test tests/harness/edit-lease.test.mjs`, focused ESLint/Prettier, `git diff --check` |
| TypeScript/product slice                 | `pnpm typecheck`, focused `pnpm exec eslint <files> --max-warnings=0`, `pnpm exec vitest run <relevant-files>`; separate reviewer under D129                                                |
| Authz, isolation, PII, auth/files, money | Positive and negative units/integration, required independent QA/security, affected shared-screen E2E; High critical implementation/review                                                  |
| API contract                             | `pnpm api:postman`, inspect generated OpenAPI/collection diff, relevant API/integration tests; Newman at V-block end                                                                        |
| Schema/migration                         | New migration, `pnpm db:check`, fresh disposable DB migration and affected integration tests; inspect constraints, locking and data-loss risk; no production execution                      |
| Shared screen                            | All E2E specs for each affected screen, sequential desktop/mobile, relevant accessibility and Ukrainian copy checks                                                                         |
| Lists/boards/stats or bundle growth      | Performance review; measure relevant route bundles; perf budgets and D125 screenshots at V-block end                                                                                        |
| Merge / V-block                          | CLAUDE §6/D129: only conflict-resolution tests locally at merge; hosted CI full suite; V-block `pnpm test:e2e`, `pnpm test:api`, `pnpm perf:check` and screenshots                          |

`.github/workflows/ci.yml` retains the existing application gates and adds the dependency-free harness validator/tests. No deployment or merge automation is added. The Python validator parses TOML and deliberately accepts only the plain scalar frontmatter subset used by these role files; it is not a general YAML parser or live CLI/model probe. It rejects permission overrides and routing drift. CLI syntax acceptance is a separate local probe.

## Compact assignments and handoffs

Assignment fields: task ID/objective; PRD IDs or tooling n/a; exact files; acceptance criteria; constraints/dependencies; required tests; expected compact output. Pass only relevant snippets and verified findings. Do not copy full PRDs, histories or logs.

Worker output and checkpoint fields:

```text
STATUS: DONE | BLOCKED | NEEDS_REVIEW
Task / objective:
Implementation / files changed:
Decisions:
Validation: exact commands, results; skipped/unavailable checks with reason
Unresolved risks / reproduction:
Recommended next step:
```

Reuse `docs/CLAUDE_HANDOFF.md` and its archive procedure at the next product checkpoint. During active concurrent product work, record tooling evidence in this document and a scoped PROGRESS entry without overwriting the product checkpoint. Historical handoffs stay intact.

## Baseline and compatibility — 2026-11-19

Discovery baseline: `phase-2` at `b0e7c3e`, with pre-existing uncommitted vacancy GET/editor changes. Stack verified from package scripts and ADR-001: Next.js 15.5.28 / React 19.3.1 / strict TypeScript, Drizzle/PostgreSQL/Supabase, Vitest, Playwright, generated OpenAPI/Postman and GitHub Actions. No product, schema, dependency or runtime-stack change is part of this harness.

Installed Codex `0.169.0-alpha.11.1` advertises strict config validation and read-only execution. `codex --strict-config app-server --print-startup-config` accepted a copy of the project config as the base config in an isolated `.cache/harness-config-probe` CODEX_HOME (without changing global preferences). Sol Medium/High are exposed in this session; the local model catalog also lists Sol Low, but that alone does not prove a live Low request or newly added role works. Claude CLI was absent from PATH and the checked usual user bin directories, so its live loading/model compatibility remains unverified; existing Sonnet frontmatter and efforts are preserved.

Attempted live smoke: `codex exec --ephemeral --ignore-user-config --strict-config --sandbox read-only -c agents.enabled=false -m gpt-6.1-sol -c model_reasoning_effort=low <bounded-read-only-prompt>`. It exited before model execution: project-local config was untrusted in that fresh CLI context and the sandbox denied app-server initialization / local state writes. No trust or global permission changes were made; no live Low response or automatic agent selection was verified. Repeat in the owner's normally trusted CLI context using the bounded prompt below; no need to disable sandbox protections.

```text
HARNESS-SMOKE: Read only AGENTS.md and CLAUDE.md section 13.
This is SIMPLE read-only work. Do not spawn agents, acquire a lease,
write files or run product tests. Return complexity, risk, worker count,
engineering source of truth and the harness syntax validation command.
```

Expected: SIMPLE / small risk / zero workers / CLAUDE.md / `python scripts/check-ai-harness.py`. This expected output is an acceptance criterion, not a claimed successful live run. The orchestration smoke performed inside this already-running session read the policy and identified that exact direct path with zero additional workers for the smoke; implementation/review agents for HARNESS-01 are separate from that simple smoke.

HARNESS-02 (Claude, 2026-11-19): VS Code extension 2.1.328, orchestrator Opus 5.5 medium. Live smoke: `repository-explorer` with Haiku override ran the HARNESS-SMOKE prompt above and returned the expected SIMPLE / small / 0 workers / CLAUDE.md / `python scripts/check-ai-harness.py`; runtime reported `claude-haiku-5-5`. Frontmatter then pinned to `model: haiku` (effort medium kept, verified combination). All other Claude roles unchanged (Sonnet, D128). Token/cost delta: unknown until measured on equivalent tasks.

Measurement baseline: no comparable before/after task usage was supplied, so token and cost savings are **unknown**. For future comparisons record tool/version, model/effort, HEAD/dirty scope, complexity/risk, accepted outcome, agent count, input/output/cached tokens, cost if exposed, tool calls, elapsed time and repairs. Compare equivalent tasks only; unknown metrics remain unknown. A simple read-only smoke should spawn zero workers; testing a failed runtime probe does not count as a successful orchestration run.

HARNESS-01 execution record: three specialist sessions used sequentially as needed (architecture, implementation, review; architect reused for consistency review), at most two active specialists concurrently; one repair for missing explicit Node imports after focused ESLint. Six lease tests passed. Exact token/cost totals and comparable elapsed/tool-call baselines were not exposed as a reliable task aggregate, so remain unknown. This tooling task is not a before/after efficiency benchmark.

Validation results are recorded in the HARNESS-01 checkpoint at the top of `docs/PROGRESS.md`; unrelated product test results do not establish harness runtime compatibility.
