# Phase 1 — deferred shell menus (PERF-04 initial JS gate)

Date: 2026-11-01. Scope: PERF-04, UI-04..07.

## Change

- Theme, vertical and user menus render only their trigger; the Radix DropdownMenu module loads on hover/focus and the menu opens on press (pointer, Enter, Space, ArrowDown) — `components/ui/deferred-menu.ts`.
- Collapsed-sidebar labels: small in-house tooltip (focus or 300 ms hover, Escape dismisses, hoverable, `role="tooltip"`) instead of Radix Tooltip/Popper. `TooltipProvider` and `components/ui/tooltip.tsx` removed.
- Audit period presets compute Kyiv dates with built-in `Intl` instead of `date-fns` + `@date-fns/tz` on the client; server bounds keep date-fns.

## Measured initial JavaScript (gzip, page + ancestor layouts, `pnpm perf:size`)

| Route | Before, kB | After, kB | 180 kB gate |
|---|---:|---:|---|
| App shell / home | 186.72 | 166.16 | Pass |
| Settings | 189.60 | 169.04 | Pass |
| Audit | 205.05 | 178.95 | Pass |
| Verticals | 193.31 | 172.75 | Pass |
| Profile | 194.28 | 173.71 | Pass |
| Public/auth routes | 103.00–175.38 | unchanged | Pass |

`pnpm perf:size` passes for every route. Numbers include the review fixes (`5be02ea`: load boundary, transition, tooltip state). Audit has the least headroom (1.05 kB); its next candidates are the infinite-query chunk and the record sheet.

## Verification

- Code review CR-PERF-01..07 fixed in `5be02ea`: stale-deploy chunk failure no longer crashes the shell (load boundary + reload on next press), focus kept while loading (transition), first item focused on keyboard open, WCAG 1.4.13 tooltip, locale-independent Kyiv date, Ukrainian `app/global-error.tsx`.
- lint, typecheck, 1711 unit, 149 integration, build, `perf:size` pass, full E2E 64 passed + 2 intentional desktop-only skips.
