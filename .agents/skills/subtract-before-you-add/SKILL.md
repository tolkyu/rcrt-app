---
name: subtract-before-you-add
description: "Apply when sequencing an addition, refactor, or rewrite. Remove dead code, redundant validators, and stub references first, then build on the simpler base."
user-invocable: false
---

# Subtract Before You Add

When evolving a system, remove complexity first, then build. Default to subtraction.

Make simplification a continual investment. Leave the design slightly simpler and more capable behind the same or smaller surface than you found it.

- Sequence removal before construction
- Cut before you polish (get to the minimum before investing in quality)
- Design for observed usage, not speculative edge cases
- No speculative validators, parsers, or guards beyond what the spec demands
- Simplify prompts (remove redundant instructions, excessive templates)
- When a reference has no novel content, delete it rather than leaving a stub

Source: michael-denyer/pstack-claude (MIT).

## Project limits

- Authz, PII, idempotency and Zod validation required by the PRD or `docs/security/` are not "speculative" — never remove them.
- Removal is still a behaviour change: tests stay green and `blast-radius` checks consumers before deleting shared code.
