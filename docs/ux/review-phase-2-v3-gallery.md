# Phase 2 — V2/V3 gallery review (47–50)

Reviewed: PNGs 47–50 (22 files), `index.html` captions, against `docs/ux/wireframes/vacancy-card.md` V3 and `design-system.md`. Skill: `emil-design-eng`.

No blockers. Desktop light/dark are clean: contrast, dialog hierarchy, red/neutral urgency states, Ukrainian text all fit.

| # | PNG | Issue | Severity | Exact fix |
| --- | --- | --- | --- | --- |
| 1 | `50-team-lead-vacancy-status-menu-mobile-light` (and every mobile card: `48-*-mobile`) | BUG-V3-3. `[⋯]` is a bare 14 px glyph alone on its own line; its menu is a small popover glued to x=0 (no 16 px gutter), covering the «Команда» heading. Touch target far below 44 px. Wireframe §2 requires a bottom action sheet. | should-fix | FIX. Below 768 px: put `[⋯]` in the same row as «Призупинити» (icon button 44x44, `aria-label` = «Інші дії», outline like the neighbour; «Призупинити» takes the remaining width). Open the existing mobile sheet (`motion-sheet-up`, handle, items h 48, «Скасувати вакансію…» red and separated, 8 px above safe area) instead of the dropdown. Desktop keeps the dropdown. Same component serves the preview panel. |
| 2 | `49-recruiter-vacancy-team-claim-list-mobile-light` | Sheet body is clipped by an ellipsis («…це зможе зробити керівни…»). The consequence text of a commitment dialog must be fully readable. | should-fix | Remove line clamp / fixed height on sheet description; body scrolls (`max-h: calc(100dvh - 160px); overflow-y:auto`). Add an E2E assertion that the text is not truncated. |
| 3 | `48-*` (all), `49-*`, `50-head-*-on-hold`, `47-*` | Urgency block shows two stacked labels: section «Терміновість» then radiogroup label «Терміновість вакансії». Redundant, costs 28 px on mobile. | nit | Hide the section heading (keep as `sr-only`) and show only the row label; or keep the heading and make the radiogroup label `sr-only`. Update wireframe lines 164–167, 196–197. |
| 4 | `48-*-mobile-light`, `50-*-mobile-*` | «Поділитися» is a content-width button above a full-width «Призупинити»: two different widths stacked, ragged left edge. Wireframe says «next to the status row». | nit | Row 1: «Поділитися» (icon+text) + `[⋯]` 44 px; row 2: full-width status action. Or accept as-is and fix wireframe wording. Prefer fixing with issue 1. |
| 5 | `47-admin-vacancy-share-clipboard-blocked` | Fallback panel has no copy button (expected, the clipboard is blocked) and «Закрити» is a text button indented ~28 px vs the panel text (looks misaligned). | nit | Align «Закрити» to the panel's left padding (`-ml-3` ghost-button offset or use `variant="outline" size="sm"`). Panel `role="status"` is fine. |
| 6 | `50-head-recruiter-vacancy-status-cancel-dialog-desktop-*` | ~44 px empty space under the buttons (vs 24 px elsewhere). Looks like reserved space for an error line. | nit | Reserve the error line only when an error exists, or use `min-h` on the error slot inside the field group, not after the footer. |
| 7 | `31-*` banner in `48-head-recruiter-vacancy-urgency-filled` | Banner «Вакансію закрито 13.11.2026 — Заповнена» repeats the chip and the info line «Вакансію закрито — червоне виділення вимкнено» above it: two closing notices stacked. | nit | Keep the date banner; drop the chip-adjacent info line for FILLED/CANCELLED (the neutral `Термінова` chip with `title` is enough). |
| 8 | `50-*-reopen-dialog-desktop-light` | The seats input value is shown fully selected (blue) in the capture. Fine behaviour (select on focus), but the centered number inside a wide field looks like a selected label. | nit | No code change. Re-capture after typing or blur so the owner does not read it as a bug. |
| 9 | `49-recruiter-vacancy-team-claim-confirm-desktop-light`, `49-*-team-lead-dialog` | Dialogs sit slightly above centre (title y~385 of 900). Consistent with other dialogs. | nit | None. |

## Captions (index.html)

Ukrainian headings read well. Two should be tightened: s-47 «Буфер обміну заблоковано — повне посилання виділено в полі, кнопка «Закрити»» -> «Поділитися: буфер обміну недоступний — посилання виділено для ручного копіювання»; s-50 long «…— «Призупинити» й меню «⋯» з пунктом «Скасувати вакансію…»» is fine but update after fix 1 (now «нижня шторка»).

## BUG-V3-3 decision

FIX (not accept). Reasons: a destructive action hides behind a 14 px target, the popover touches the screen edge and overlaps content, and TL mobile flows are a hard rule. Wireframe stays unchanged. Instruction: issue 1 above. Re-capture `50-team-lead-vacancy-status-menu-mobile-light` (sheet open) after the fix.

## Stale PNGs (re-capture, light + 1 dark per D125)

- All `31-*` detail captures (`31-admin-vacancy-detail*`, `31-team-lead-…-long-title`, `31-recruiter-…-no-team-lead`): they predate the V3 header (status action row, `[⋯]`, urgency section, team assign buttons, share).
- `30-*` list captures: the filter bar now has «Терміновість» and status chips with counters (seen in `49-…-claim-list-mobile`); old lists lack them and the urgent row tint. Re-capture `30-admin`, `30-head-recruiter`, `30-recruiter` desktop and the mobile card list.
- `30-finance-vacancies-denied`: unchanged, keep.
