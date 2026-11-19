# S3.5 — draft cancel/delete performance [PERF-04, PERF-05]

Date: 2026-11-17. Coordinator verification; independent reviewer completed the source-boundary check but reached its usage limit before issuing a final verdict.

## Production bundle

`corepack pnpm build` and `corepack pnpm perf:size` passed. The size gate includes ancestor layout chunks (the Next route table alone does not).

| Route                         | Initial JS, gzip |  Limit |
| ----------------------------- | ---------------: | -----: |
| `/vacancies`                  |        165.44 kB | 180 kB |
| `/vacancies/[vacancyId]`      |        157.14 kB | 180 kB |
| `/vacancies/new`              |        177.73 kB | 180 kB |
| `/vacancies/[vacancyId]/edit` |        177.95 kB | 180 kB |

## Source checks

- `draft-row-menu.tsx` and `draft-header-actions.tsx` retain the synchronous own-draft gate and lazy boundaries. Close dialogs, hooks, response validators and toasts load inside those chunks.
- `ownDraftActions` imports schema types only. The new cancel input schema is separate from the create/edit schema module; reason helpers have no Zod dependency.
- No new list/detail SQL, joins, filters or indexes. Mutations use the existing bounded, row-locked services.
- Completion cancels list/count and exact detail reads before changing cached rows. The single cache pass removes only the affected row and decrements the draft count once; cancelled-draft deletion leaves the count unchanged.
- Reconciliation uses one direct detail GET only after an uncertain cancellation meets a conflict. It does not publish an early cache transition or retry automatically.

Runtime/Lighthouse load budgets were not re-certified for this slice. Independent final performance approval remains pending; the source-boundary check and measured initial-JS gate are green.
