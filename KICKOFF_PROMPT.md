# Kickoff prompt — paste this into Claude Code (first message)

```
You are the Tech Lead / orchestrator of a virtual product team. We are building "HRIS" — an internal recruiting web application. UI language: Ukrainian. Report to me in Ukrainian.

1. Read CLAUDE.md and docs/PRD.md completely. They are the source of truth (HOW and WHAT).
2. List the subagents in .claude/agents/ and what you'll use each for.
3. Start PHASE 0 (Discovery & design) only — no feature code yet:
   a. business-analyst: review the whole PRD, write docs/OPEN_QUESTIONS.md (gaps, contradictions, PRD §14 defaults still unconfirmed) and docs/stories/phase-1.md.
   b. In parallel:
      - solution-architect: ADRs 001–009, docs/architecture.md, docs/pipeline-state-machine.md (mermaid), docs/authz-matrix.md;
      - database-engineer: docs/erd.md (mermaid) with the architect;
      - performance-engineer: docs/perf/plan.md — how every hot path (dashboard, kanban, cards, search, statistics) meets PRD PERF budgets, and the perf CI setup;
      - ux-ui-designer: docs/ux/screens.md, docs/ux/flows.md, docs/ux/glossary.md (Ukrainian terms), wireframes for Dashboard, Vacancy card, Candidate card (timeline), Settings → TL priorities and Bonus schemes, Finance (Statistics only).
   c. qa-engineer: docs/test-plan.md incl. routing and bonus test tables (worked examples with dates and amounts) and the screenshot plan (which screens × roles).
   d. security-engineer: docs/security/threat-model.md.
   e. Create docs/PROGRESS.md.
4. STOP and report to me in Ukrainian, short: what was produced, top open questions with your recommended answers, plan for Phase 1.

Rules: follow CLAUDE.md strictly (real code only, minimal comments, speed budgets, screenshots every phase). Never change product behaviour without asking me. Do not start Phase 1 until I reply "go phase 1".
The Telegram bot (Phase 6) is not defined yet — when we reach it, ask me questions first and build nothing before my answers.
```

## Follow-up prompts

**After answering the open questions:**
```
Answers: <your answers>. business-analyst updates PRD and OPEN_QUESTIONS. Then go phase 1, workflow CLAUDE.md §6 for every task. At the end: screenshots gallery, demo script, stop and report.
```

**Next phase:**
```
Phase N accepted. Go phase N+1. Same workflow; stop and report with screenshots.
```

**Design feedback from screenshots:**
```
Design feedback on screenshots/phase-N: <file name> — <what to change>. ux-ui-designer updates the design, senior-fullstack-engineer implements, qa-engineer regenerates screenshots.
```

**Bug:**
```
Bug: <what I did> → <what happened> → <what I expected>. qa-engineer: failing test first, then senior-fullstack-engineer fixes, code-reviewer reviews.
```

**Telegram phase (when you're ready):**
```
Go phase 6. Ask me your Telegram questions first.
```

**Before launch (Phase 7):**
```
Release-readiness check: security-engineer full review, performance-engineer perf report on 50k seed, qa-engineer full regression (unit, integration, E2E, Newman, screenshots), ux-ui-designer accessibility pass, devops-engineer backup-restore test and runbook. Give me a go/no-go list.
```
