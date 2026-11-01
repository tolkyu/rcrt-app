# Phase 1 — deferred shell menus (PERF-04 initial JS gate)

Date: 2026-11-01. Scope: PERF-04, UI-04..07.

## Change

- Theme, vertical and user menus render only their trigger; the Radix DropdownMenu module loads on hover/focus and the menu opens on press (pointer, Enter, Space, ArrowDown) — `components/ui/deferred-menu.ts`.
- Collapsed-sidebar labels: small in-house tooltip (focus or 300 ms hover, Escape dismisses, hoverable, `role="tooltip"`) instead of Radix Tooltip/Popper. `TooltipProvider` and `components/ui/tooltip.tsx` removed.
- Audit period presets compute Kyiv dates with built-in `Intl` instead of `date-fns` + `@date-fns/tz` on the client; server bounds keep date-fns.

## Measured initial JavaScript (gzip, page + ancestor layouts, `pnpm perf:size`)

| Route | Before, kB | After, kB | 180 kB gate |
|---|---:|---:|---|
| App shell / home | 186.72 | 165.70 | Pass |
| Settings | 189.60 | 168.58 | Pass |
| Audit | 205.05 | 178.44 | Pass |
| Verticals | 193.31 | 172.28 | Pass |
| Profile | 194.28 | 173.25 | Pass |
| Public/auth routes | 103.00–175.38 | unchanged | Pass |

`pnpm perf:size` passes for every route. Audit has the least headroom (1.6 kB); its next candidates are the infinite-query chunk and the record sheet.

## Verification

- lint, typecheck, 1711 unit, 149 integration, build, full E2E 58/58 + new keyboard test for deferred menus (desktop + mobile).
