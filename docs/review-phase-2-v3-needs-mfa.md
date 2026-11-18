# Review: v3-needs-mfa (3bf9d21)

Verdict: APPROVED

## Blocking
None.

## Checks
| Area | Result |
|---|---|
| Leak of augmented ctx | `afterStepUp` builds a fresh object inside `needsMfa`; it is used only for boolean predicates and never returned, stored or passed to a service. Real writes still read `ctx.grants`. |
| `mfaWithheld` / `can.ts` | Unchanged semantics: withheld set still pruned for permissions that have real grants. |
| AuthContext builders | Only `request-context.ts:145` and `vacancy.ts:288` (test harness) build it; both use `buildAuthContext`, so the new field is always present. Test fixtures updated, typecheck green. |
| Spread/serialise | Spreads of ctx in services only add `db`; none serialise `auth`. Extra map is empty at aal2 and small (few grants) at aal1; no measurable cost. |
| `next` link | Built from `usePathname` + query, `encodeURIComponent`. The verify page runs `safeNextPath` (relative only, no `//`, no backslash, no dot-segment tricks, 512 cap). No open redirect. |
| Tests | typecheck OK; vacancy-mfa, step-up, vacancies-ui: 63/63 pass. |

## Should fix (non-blocking)
- `status-actions.tsx`: `locked` uses `actionsFrom(status)` without a per-action grant check. If `needsMfa` is true only because of assign/team-lead, a viewer holding some status actions shows a locked HOLD/RESUME/REOPEN only when not already shown, so currently safe because Admin is global. Revisit if a non-global withheld grant appears.
- `next` over 512 chars silently drops to `/` after verify; acceptable.

## Nit
None.

## Self-check line
- A "would unlock after step-up" flag must come from a hypothetical context used only for predicates, never returned.
