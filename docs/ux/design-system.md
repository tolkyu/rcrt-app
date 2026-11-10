# Design system (v1.0 — follows the owner's designer mockups)

> **Target look = the reference images** in `docs/ux/reference/`. This file turns them into tokens and rules engineers build exactly. Where a mockup value fails WCAG 2.1 AA (PRD UI-05), the fix is the smallest visual tweak (§1.4). Scope and behaviour changes the mockups imply are tracked in `design-adoption.md`, not here.
> Stack: Tailwind v4 (`@theme` CSS variables) + shadcn/ui (Radix) + lucide. Theme switch: `class="dark"` on `<html>`, no flash (theme script before paint).

## 0. Reference images

| File                                  | Content                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reference/00-foundations.webp`       | Colours (light/dark), type scale, 11 candidate statuses, radii, spacing, borders, shadows, grid, sample components                                                                    |
| `reference/01-components.webp`        | Buttons, form controls, navigation (sidebar, top bar, filters), cards, chips, bonus badge, mini funnel, event timeline, toasts/empty/error/skeleton, mobile bottom nav + bottom sheet |
| `reference/02-dashboard.webp`         | Головна: filters, saved filters, KPI row, Мої задачі, Вакансії cards, candidate kanban; dark + mobile                                                                                 |
| `reference/03-vacancies.webp`         | Vacancy table + right preview panel; dark + mobile                                                                                                                                    |
| `reference/04-candidate-card.webp`    | Header, info strip, stepper, tabs, history feed, right column «Наступна подія» + «Приватні нотатки»; dark + mobile + interview-result sheet                                           |
| `reference/05-candidates-kanban.webp` | Candidates kanban (Канбан/Таблиця), filter bar, side drawer; dark + mobile                                                                                                            |
| `reference/06-calendar.webp`          | Week view + event details panel; dark + mobile day list                                                                                                                               |
| `reference/07-statistics.webp`        | Statistics tabs, KPI row, funnel, hiring dynamics, avg time, top recruiters, bonuses card; dark + mobile                                                                              |

Brand in UI: logo tile «H» + wordmark **«Hiring»** (approved 2026-10-31). Product/repo name stays HRIS in docs.

## 1. Colour

### 1.1 Base tokens (exactly as `00-foundations.webp`)

| Token (CSS var)                     | Light     | Dark      | Use                                                                                                                  |
| ----------------------------------- | --------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| `--brand`                           | `#6366F1` | `#818CF8` | Primary/Індиго accent: logo tile, icons, focus ring, selected indicators, progress, chart series 1                   |
| `--brand-fill`                      | `#6366F1` | `#5558EF` | Solid brand fill behind a white glyph (logo tile). Dark stays `#5558EF` because `#818CF8` under white is only 2.98:1 |
| `--cyan`                            | `#06B6D4` | `#22D3EE` | Accent: KPI icon tiles, chart series 2 (decorative, never text)                                                      |
| `--magenta`                         | `#EC4899` | `#F472B6` | Accent: KPI icon tiles, chart series (decorative)                                                                    |
| `--yellow`                          | `#F59E0B` | `#FBBF24` | Accent: KPI icon tiles, bonus gift icon (decorative)                                                                 |
| `--background`                      | `#F8FAFC` | `#0B1220` | App background (Фон)                                                                                                 |
| `--surface` (`--card`, `--popover`) | `#FFFFFF` | `#111827` | Cards, panels, sidebar, top bar, dialogs (Поверхня)                                                                  |
| `--surface-muted` (`--muted`)       | `#F1F5F9` | `#1F2937` | Hover rows, segmented controls, skeleton base, kbd hint (Поверхня приглушена)                                        |
| `--foreground`                      | `#0F172A` | `#F8FAFC` | Main text (Основний текст)                                                                                           |
| `--muted-foreground`                | `#5B6B82` | `#94A3B8` | Secondary text (Другорядний текст), **only on surface/background** — see §1.4                                        |
| `--muted-foreground-strong`         | `#475569` | `#94A3B8` | Secondary text on `--surface-muted` and tinted backgrounds                                                           |
| `--border`                          | `#E2E8F0` | `#334155` | Card borders, dividers (decorative, Межа)                                                                            |
| `--success`                         | `#22C55E` | `#34D399` | Icons, dots, bars, positive fills (Успіх)                                                                            |
| `--warning`                         | `#F59E0B` | `#FBBF24` | Icons, dots (Попередження)                                                                                           |
| `--error`                           | `#EF4444` | `#F87171` | Icons, dots, error borders (Помилка)                                                                                 |

Image note: the light secondary-text label reads «#6474BB» because the image is blurry; the swatch is slate. We use **`#64748B`** (Tailwind slate-500, the obvious intent). Phase-1 AA verification derives secondary text `#5B6B82` and success text `#166534` so selected/hovered rows also meet 4.5:1.

### 1.2 Derived tokens (needed for AA; not separate swatches in the image)

| Token                                  | Light                 | Dark          | Use                                                                                                      |
| -------------------------------------- | --------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `--primary` (shadcn)                   | **`#5558EF`**         | **`#5558EF`** | Filled primary button bg, checked checkbox/radio/switch, active pagination page                          |
| `--primary-hover` / `--primary-active` | `#4F46E5` / `#4338CA` | same          | Hover / pressed filled button                                                                            |
| `--primary-foreground`                 | `#FFFFFF`             | `#FFFFFF`     | Text on `--primary`                                                                                      |
| `--link` (primary text)                | **`#5558EF`**         | `#818CF8`     | Text links, active nav label + icon, active tab, outline/ghost primary button text, «Переглянути всіх →» |
| `--primary-subtle`                     | `#EEF2FF`             | `#232B48`     | Active nav item bg, selected chip/segment bg, secondary button bg («Зберегти» soft)                      |
| `--ring`                               | `#6366F1`             | `#818CF8`     | Focus outline                                                                                            |
| `--input`                              | `#7B8698`             | `#64748B`     | Borders of inputs, selects, checkboxes, radios (≥ 3:1, WCAG 1.4.11)                                      |
| `--success-text`                       | `#166534`             | `#34D399`     | Positive deltas, «Пройдено», success text                                                                |
| `--warning-text`                       | `#92400E`             | `#FBBF24`     | Warning text, including tinted warning badges                                                            |
| `--error-text`                         | `#B91C1C`             | `#F87171`     | Errors, validation, soft destructive button text                                                         |
| `--destructive`                        | `#DC2626`             | `#DC2626`     | Filled destructive (confirm buttons in AlertDialog)                                                      |
| `--destructive-subtle`                 | `#FEF2F2`             | `#3A1D24`     | Soft destructive button bg («Видалити» in the library)                                                   |
| `--now-line`                           | `#EF4444`             | `#F87171`     | Calendar current-time line + time pill (white text on pill: use `#DC2626`, 4.83:1)                       |

### 1.3 Contrast check (WCAG 2.1 relative luminance; text needs ≥ 4.5:1, UI boundaries/icons ≥ 3:1)

| Pair                                                            | Ratio                     | Result                                                |
| --------------------------------------------------------------- | ------------------------- | ----------------------------------------------------- |
| White on `#6366F1` (mockup primary button)                      | **4.47:1**                | ✖ fails AA for normal text                            |
| White on **`#5558EF`** (new `--primary`)                        | **5.21:1**                | ✔                                                     |
| White on `#4F46E5` (hover) / `#4338CA` (pressed)                | 6.29 / 7.90               | ✔                                                     |
| `#5558EF` text on `#FFFFFF` / `#F8FAFC` / `#F1F5F9` / `#EEF2FF` | 5.21 / 4.98 / 4.76 / 4.66 | ✔ all light surfaces                                  |
| `#6366F1` on white (focus ring, icons, non-text)                | 4.47                      | ✔ (needs 3:1)                                         |
| White on `#818CF8` (dark primary as button)                     | 2.98                      | ✖ → dark filled buttons also use `#5558EF`            |
| `#818CF8` text on `#0B1220` / `#111827` / `#1F2937` / `#232B48` | 6.28 / 5.95 / 4.92 / 4.68 | ✔                                                     |
| `#0F172A` on `#FFFFFF` / `#F8FAFC` / `#F1F5F9`                  | 17.9 / 17.1 / 16.3        | ✔                                                     |
| `#64748B` on `#FFFFFF` / `#F8FAFC`                              | 4.76 / 4.55               | ✔ (thin on bg)                                        |
| `#64748B` on `#F1F5F9`                                          | 4.34                      | ✖ → use `#475569` (6.92) on muted/tints               |
| `#F8FAFC` on `#0B1220` / `#111827` / `#1F2937`                  | 17.9 / 17.0 / 14.0        | ✔                                                     |
| `#94A3B8` on `#0B1220` / `#111827` / `#1F2937`                  | 7.30 / 6.92 / 5.73        | ✔                                                     |
| `#22C55E` / `#F59E0B` / `#EF4444` as text on white              | 2.28 / 2.15 / 3.76        | ✖ → icons/dots only; text uses `*-text` tokens        |
| `#15803D` / `#B45309` / `#B91C1C` on white                      | 5.02 / 5.02 / 6.47        | ✔                                                     |
| `#B91C1C` on `#FEF2F2` (soft destructive)                       | 5.91                      | ✔                                                     |
| White on `#DC2626` (filled destructive)                         | 4.83                      | ✔                                                     |
| `#34D399` / `#FBBF24` / `#F87171` on `#111827`                  | 9.2 / 10.6 / 6.41         | ✔                                                     |
| `#7B8698` input border on white / `#F8FAFC`                     | 3.68 / 3.52               | ✔ (≥ 3:1)                                             |
| `#64748B` dark input border on `#111827`                        | 3.73                      | ✔                                                     |
| `#E2E8F0` / `#334155` card border                               | 1.2 / 1.7                 | decorative only, never the only boundary of a control |
| Cyan `#06B6D4` / magenta `#EC4899` on white                     | 2.43 / 3.53               | decorative only, always paired with a label           |

### 1.4 Accessibility decision (primary)

- **Keep `#6366F1`** as brand/accent: logo tile (large bold glyph, 3:1 suffices), icons, focus ring, chart bars, selected indicators, progress.
- **Add `#5558EF`** (same hue 239°, lightness 67 % → 63 %; barely visible change) for **filled buttons in both themes and all primary-coloured text in light theme**. Dark-theme primary text stays `#818CF8`.
- Secondary text `#64748B` only on white/background; on muted surfaces and tints use `#475569`.
- Mockup brights (success/warning/error) are not text colours; text uses `--success-text` / `--warning-text` / `--error-text`. KPI deltas therefore look slightly darker than in the mockup.
- **Delta colour follows meaning, not sign:** «Середній час найму ↓ −25 %» is good, so it shows success-green (the mockup shows it red). Arrow and sign are always present, so colour is never the only cue.

### 1.5 Stage colours (StageChip, stepper, kanban column, calendar event) — 11 statuses from `00-foundations.webp`

Chip = pill, tinted bg + stage text + lucide icon + label. **Colour is never the only cue.** Dark: bg = accent at 16 % alpha over `--surface`, text = 300 shade (spot-checked ≥ 7:1; worst case violet 8.1:1).

| Enum                | Chip          | Icon (lucide)             | Accent    | Light bg  | Light text (ratio) | Dark text |
| ------------------- | ------------- | ------------------------- | --------- | --------- | ------------------ | --------- |
| `NEW`               | Новий         | `circle-dot`              | `#10B981` | `#ECFDF5` | `#065F46` (7.3)    | `#6EE7B7` |
| `IN_WORK`           | В роботі      | `circle-play`             | `#3B82F6` | `#EFF6FF` | `#1D4ED8` (6.2)    | `#93C5FD` |
| `SUBMITTED_TO_TL`   | У тімліда     | `users`                   | `#8B5CF6` | `#F5F3FF` | `#6D28D9` (6.5)    | `#C4B5FD` |
| `TL_INTERVIEW`      | Співбесіда    | `video`                   | `#6366F1` | `#EEF2FF` | `#4338CA` (7.1)    | `#A5B4FC` |
| `POLYGRAPH`         | Поліграф      | `clipboard-list`          | `#F59E0B` | `#FFFBEB` | `#92400E` (6.8)    | `#FCD34D` |
| `OFFER`             | Офер          | `file-text`               | `#EC4899` | `#FDF2F8` | `#BE185D` (5.5)    | `#F9A8D4` |
| `PROBATION`         | Випробування  | `chart-column-increasing` | `#14B8A6` | `#F0FDFA` | `#115E59` (7.3)    | `#5EEAD4` |
| `PROBATION_PASSED`  | Найнято       | `circle-check`            | `#22C55E` | `#F0FDF4` | `#166534` (6.8)    | `#86EFAC` |
| `REJECTED`          | Відмова       | `circle-x`                | `#EF4444` | `#FEF2F2` | `#B91C1C` (5.9)    | `#FCA5A5` |
| `WITHDRAWN`         | Самовідвід    | `circle-minus`            | `#64748B` | `#F1F5F9` | `#334155` (9.5)    | `#CBD5E1` |
| `PROBATION_FAILED`  | Не пройшов ВТ | `triangle-alert`          | `#F97316` | `#FFF7ED` | `#9A3412` (6.9)    | `#FDBA74` |
| `REJECTED` (routed) | Передано далі | `forward`                 | `#64748B` | `#F1F5F9` | `#334155`          | `#CBD5E1` |

- The mockup paints Новий, Випробування and Найнято all green. We split them into emerald, teal and green, and the icons differ, so they stay distinguishable.
- Kanban column: header bg = stage light bg, icon + label in stage text, count pill on `--surface`; column body = stage bg; cards = `--surface`.
- Stepper: done = accent circle + white check; current = accent filled circle + white stage icon + ring `--primary-subtle`; upcoming = `--surface-muted` circle + muted icon; failed = `--error` circle + `x`.
- Calendar events take the colour of their stage: Скринінг → `IN_WORK`, Співбесіда → `TL_INTERVIEW`, Поліграф → `POLYGRAPH`. Block = stage bg + 3 px left border in accent + title in stage text. This replaces the mockup's own palette, see adoption A-24.

### 1.6 Other status palettes (same structure)

| Kind           | Value → palette                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vacancy status | Чернетка slate (dashed border) · Відкрита green · Призупинена amber · Заповнена blue · Скасована slate                                                       |
| Bonus status   | Заплановано slate · Нараховано blue · Затверджено indigo · Виплачено green · Скасовано slate · Призупинено amber · Очікує повернення orange · Повернено pink |
| Urgency badge  | «Термінова»: red palette, icon `flame` (separate badge, not a status)                                                                                        |
| Bot badge      | «З бота»: blue outline, icon `bot` (separate badge, not a status)                                                                                            |
| Source label   | LinkedIn / Djinni / Telegram / Рекомендація / Інше: neutral text + small icon (not a coloured badge)                                                         |
| Event pending  | «Очікує перенесення»: red-soft pill (`#FEF2F2` / `#B91C1C`) as in `06-calendar.webp`                                                                         |

## 2. Typography

**Font: Inter for everything** (Google Fonts, OFL, full Cyrillic incl. ґ є і ї). Loaded via `next/font/google` as a variable font, `subsets: ['latin','cyrillic']`, `display: 'swap'`, with a size-adjusted fallback so there is no CLS.

- The mockup's «Zakon-style» heading face is a bold grotesque. Inter 700 with tight tracking matches the mockups, and one variable file keeps the JS/CSS budget and avoids a second font request. No paid fonts.
- If the owner wants more heading character later, **Manrope** is the fallback option (free, Cyrillic). It is not adopted.
- Numbers: `tabular-nums` in tables, KPIs, money, dates, times.

| Token         | Size / line | Weight          | Tracking | Use                                                                                                                |
| ------------- | ----------- | --------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `display-3xl` | 48 / 56     | 700             | −0.02em  | Login brand screen only                                                                                            |
| `display-2xl` | 32 / 40     | 700             | −0.02em  | Candidate name in card header (desktop)                                                                            |
| `display-xl`  | 24 / 32     | 700             | −0.01em  | Page titles («Головна», «Вакансії»), KPI values, candidate name (mobile)                                           |
| `heading-lg`  | 20 / 28     | 600             | −0.01em  | Section/card titles («Мої задачі», «Історія взаємодій», «Наступна подія»), dialog/sheet titles, mobile page titles |
| `text-base`   | 16 / 24     | 400 / 500       | 0        | Long text (comments, notes, descriptions), mobile body, **all inputs on mobile** (no iOS zoom)                     |
| `text-sm`     | 14 / 20     | 400 / 500 / 600 | 0        | Default desktop UI: tables, cards, nav, buttons, inputs, filters, tabs                                             |
| `text-xs`     | 12 / 16     | 400 / 500       | 0        | Chips, captions, timestamps, filter labels, table headers, KPI footnotes                                           |

Ukrainian text rules: labels run ~25–35 % longer than English. Chips, tabs and nav use `whitespace-nowrap` + `max-w` + ellipsis + tooltip. Emails and URLs use `overflow-wrap:anywhere`. Set `lang="uk"`; **no automatic hyphenation** (`hyphens:auto` breaks Ukrainian wrongly, e.g. «блокува-ння»), so words wrap whole. Emails break before «@» (`EmailText`, `<wbr>`), never truncated. No uppercase labels. Apostrophe is `ʼ`. Test strings at 390 px: «Випробувальний термін», «Співбесіда з тімлідом», «Невідповідність зарплатних очікувань».

## 3. Space, radius, border, shadow, grid, size

| Token                | Values                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spacing (4 px scale) | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 (`1,2,3,4,5,6,8,10,12`); 2 px allowed only for hairline offsets                                                                                   |
| Radius               | `xs` 2 · `sm` 4 · `md` 8 · `lg` 12 · `xl` 16 · `2xl` 24 · `full`                                                                                                                           |
| Border               | 1 px default (`--border`) · 2 px emphasis (selected card, drop target, current step ring) · 1 px dashed (Чернетка, empty drop zone, «+ Додати тег», «+ Додати фільтр»)                     |
| Shadow `sm`          | `0 1px 2px 0 rgb(0 0 0 / .05)` — cards, KPI cards, table container, kanban cards                                                                                                           |
| Shadow `md`          | `0 4px 12px 0 rgb(0 0 0 / .08)` — dropdowns, popovers, tooltips, hovered kanban card                                                                                                       |
| Shadow `lg`          | `0 10px 32px 0 rgb(0 0 0 / .12)` — dialogs, drawers, bottom sheets, dragged card, toasts                                                                                                   |
| Dark shadows         | same offsets with `rgb(0 0 0 / .30 / .40 / .50)` + 1 px `--border` on every surface                                                                                                        |
| Grid                 | 12 columns, 24 px gutter, fluid; content padding 24 desktop / 16 mobile                                                                                                                    |
| Breakpoints          | sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1440                                                                                                                                             |
| Z-index              | sticky 10 · header 20 · dropdown 30 · drawer/dialog 40 · toast 50 · command 60                                                                                                             |
| Motion               | Tokens, curves and rules in §8: press 120 · tooltip 125 · popover 160/120 · dialog 200/150 · drawer 240/180 ms; strong ease-out; reduced motion keeps opacity only; off in screenshot mode |
| Focus                | `outline: 2px solid var(--ring); outline-offset: 2px` on `:focus-visible`, never removed                                                                                                   |

**Radius by component**

| Radius | Components                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2      | Progress bars, ProbationProgress track, now-line pill inner                                                                                 |
| 4      | Checkbox, kbd hint «Ctrl + K», FunnelMini bars                                                                                              |
| 8      | Small buttons (h 32), icon buttons, tooltips, dropdown items, segmented-toggle items, calendar event blocks, pagination buttons             |
| 12     | Buttons (h 40/48), inputs, selects, search, textarea, dropdown/popover panels, toasts, nav items, kanban cards, task rows, info-strip cells |
| 16     | Cards, KPI cards, panels, table container, kanban columns, drawers, dialogs, preview panels                                                 |
| 24     | Bottom sheet top corners, mobile full-width cards                                                                                           |
| full   | Stage/status chips, badges, filter chips, avatars, switches, count pills, FAB, status dots                                                  |

**Layout sizes**

| Element      | Size                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar      | 240 expanded / 72 icon rail (toggled by ☰ in top bar, remembered per user); logo row 64; nav item h 40, gap 4; «Налаштування» pinned bottom |
| Top bar      | h 64, `--surface`, bottom border                                                                                                             |
| Right panels | Vacancy preview 360 · candidate drawer 400 · calendar details 360 · candidate-card right column 320                                          |
| Buttons      | sm 32 · md 40 · lg 48 (mobile sticky / sheets)                                                                                               |
| Inputs       | 40 desktop · 44 mobile                                                                                                                       |
| Table row    | 56 (two-line: name + level, avatars) · compact 40                                                                                            |
| Kanban       | column 272, card min-h 112, gap 8                                                                                                            |
| KPI card     | min-h 120, padding 20, icon tile 40 (radius 12, accent at 12 % bg)                                                                           |
| Hit targets  | ≥ 32 desktop, ≥ 44 touch                                                                                                                     |
| Mobile       | bottom nav 64 + safe area; top bar 56                                                                                                        |

## 4. Components (from `01-components.webp`) → shadcn/ui primitives

| Library element                | Variants in mockup                                                                                                                                                                                                                                                                                                                                                                                    | shadcn / implementation                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Buttons                        | Primary (filled `--primary`, icon left) · Secondary (soft `--primary-subtle` bg + `--link` text) · Outline (surface + `--border`, foreground text) · Destructive (soft: `--destructive-subtle` + `--error-text`; filled `--destructive` in confirm dialogs) · Disabled (`--surface-muted` bg, `#94A3B8` text, exempt from contrast, wrapped in DisabledReason) · Icon button (32/40 square, radius 8) | `Button` with variants `default/secondary/outline/destructive/destructive-soft/ghost/icon` |
| Text field                     | label above, placeholder `--muted-foreground`                                                                                                                                                                                                                                                                                                                                                         | `Input` + `Label` + `Form`                                                                 |
| Search                         | leading `search` icon, trailing kbd «Ctrl + K» (`--surface-muted`, radius 4); opens command palette                                                                                                                                                                                                                                                                                                   | `Command` in `Dialog` (S-17)                                                               |
| Select                         | «Оберіть опцію ▾»                                                                                                                                                                                                                                                                                                                                                                                     | `Select`; searchable → `Popover` + `Command`                                               |
| Textarea with counter          | «0/500» bottom-right, turns `--error-text` over the limit                                                                                                                                                                                                                                                                                                                                             | `Textarea` + counter (`aria-describedby`)                                                  |
| Checkbox / Radio / Switch      | checked = `--primary`                                                                                                                                                                                                                                                                                                                                                                                 | `Checkbox`, `RadioGroup`, `Switch`                                                         |
| Tabs                           | segmented pill (active = surface + `--link` text + border) for in-card tabs; underline tabs for page-level tabs (candidate card, statistics)                                                                                                                                                                                                                                                          | `Tabs` (two styles)                                                                        |
| Pagination                     | ‹ 1 2 3 … 12 › (active = `--primary-subtle` + 2 px `--brand` border)                                                                                                                                                                                                                                                                                                                                  | custom on `Button`; see A-21 for cursor adaptation                                         |
| Tooltip                        | dark `#0F172A` bg, white text, radius 8                                                                                                                                                                                                                                                                                                                                                               | `Tooltip`                                                                                  |
| Dropdown menu                  | trigger «Дії ▾»; items with icons; destructive item red, separated                                                                                                                                                                                                                                                                                                                                    | `DropdownMenu`                                                                             |
| Avatars                        | photo · initials (on `--primary-subtle`, `--link` text) · «+» add · stacked «+2»                                                                                                                                                                                                                                                                                                                      | `Avatar` + `CandidateAvatar` / `UserAvatar`                                                |
| Badges                         | stage chips, «Рекомендація» (source), counts                                                                                                                                                                                                                                                                                                                                                          | `Badge` + StageChip                                                                        |
| Toasts                         | success / info / warning / error: icon in tinted circle, title + one line, close ×                                                                                                                                                                                                                                                                                                                    | `Sonner`                                                                                   |
| Empty state                    | icon in tinted circle, title, one line, primary action                                                                                                                                                                                                                                                                                                                                                | `EmptyState`                                                                               |
| Error state                    | `circle-x` in red-soft circle, title «Не вдалося завантажити дані», hint, «Спробувати ще раз» (secondary)                                                                                                                                                                                                                                                                                             | `SectionError`                                                                             |
| Skeleton                       | avatar circle + 2 lines rows, same boxes as final, no shimmer                                                                                                                                                                                                                                                                                                                                         | `Skeleton`                                                                                 |
| Sidebar (light/dark)           | logo, items with icons, active = `--primary-subtle` + `--link`; «Налаштування» bottom                                                                                                                                                                                                                                                                                                                 | `AppSidebar` (custom on `ScrollArea`)                                                      |
| Top bar (light/dark)           | ☰ · vertical selector · search · bell with red dot · theme toggle · avatar                                                                                                                                                                                                                                                                                                                           | `TopBar`                                                                                   |
| Filters row                    | labelled selects + date range + «⚙» more filters                                                                                                                                                                                                                                                                                                                                                      | `FilterBar`                                                                                |
| Filter chips                   | «Гемблінг ×», dashed «+ Додати фільтр»                                                                                                                                                                                                                                                                                                                                                                | `FilterChip` (Badge + button)                                                              |
| Stage chips                    | §1.5                                                                                                                                                                                                                                                                                                                                                                                                  | `StageChip`                                                                                |
| Candidate card                 | avatar, name, role, ⋯, contacts/location, date-time, StageChip                                                                                                                                                                                                                                                                                                                                        | `CandidateKanbanCard` / `CandidateSummaryCard`                                             |
| Vacancy card                   | icon tile, title, ⋯, vertical · format, «N кандидатів», status chip                                                                                                                                                                                                                                                                                                                                   | `VacancyCard`                                                                              |
| KPI card                       | label, value `display-xl`, delta (arrow + %, semantic colour), footnote, icon tile or mini bars                                                                                                                                                                                                                                                                                                       | `KpiCard`                                                                                  |
| Table row                      | checkbox, avatar + name + subtitle, StageChip, date, ⋯                                                                                                                                                                                                                                                                                                                                                | TanStack Table row                                                                         |
| Bonus badge                    | gift icon tile + amount + caption                                                                                                                                                                                                                                                                                                                                                                     | `BonusBadge` (`summary` variant)                                                           |
| Mini funnel                    | vertical bars in stage colours + count + label                                                                                                                                                                                                                                                                                                                                                        | `FunnelMini` (`bars` variant)                                                              |
| Event timeline                 | dot + line, title, date-time                                                                                                                                                                                                                                                                                                                                                                          | `Timeline` (`compact` variant)                                                             |
| Mobile bottom nav (light/dark) | icon + label, active = `--link`                                                                                                                                                                                                                                                                                                                                                                       | `BottomNav`                                                                                |
| Bottom sheet                   | handle, avatar + name, title, hint, two big buttons (Прийняти / Відхилити)                                                                                                                                                                                                                                                                                                                            | `Drawer` (vaul) → `RequiredDataDialog` on mobile                                           |

Also used (no mockup frame, unchanged): `Dialog`, `AlertDialog` (every destructive action), `Sheet` (right drawers), `Calendar`+`Popover` (date picker, uk locale, Monday first), `Breadcrumb`, `ScrollArea`, `Collapsible`, `Accordion`, `Progress`, `Alert` (banners), `HoverCard`, `ToggleGroup`.

## 5. Custom components

| Component                                                                                                                                | Key props                                                                                  | Behaviour / a11y                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AppSidebar**                                                                                                                           | `items` (role-filtered), `collapsed`                                                       | Brand row «H Hiring»; items Головна · Вакансії · Кандидати · Календар · Статистика · Архів; «Налаштування» (Admin) pinned bottom; collapsed = icons + tooltips; `nav aria-label="Основна навігація"`, `aria-current="page"`          |
| **TopBar**                                                                                                                               | —                                                                                          | ☰ (`aria-expanded`), VerticalSwitcher, search trigger, bell, ThemeToggle, UserMenu. Finance: only ThemeToggle + UserMenu                                                                                                            |
| **VerticalSwitcher**                                                                                                                     | `verticals`                                                                                | «Усі мої вертикалі ▾» + each vertical; hidden when user has one vertical                                                                                                                                                             |
| **ThemeToggle**                                                                                                                          | —                                                                                          | Світла / Темна / Системна (same setting as Профіль)                                                                                                                                                                                  |
| **UserMenu**                                                                                                                             | —                                                                                          | Avatar + name + **role · vertical** (not job title); Профіль, Вийти                                                                                                                                                                  |
| **KpiCard**                                                                                                                              | `label`, `value`, `delta`, `deltaMeaning: good\|bad\|neutral`, `footnote`, `icon`, `href?` | Delta = arrow + signed % + colour by meaning; `href` → drill-down (not for Finance)                                                                                                                                                  |
| **TaskList**                                                                                                                             | `tasks`, `tab`                                                                             | Tabs Усі / Сьогодні / Прострочені / Без дати (manual tasks Phase 5). System task = stage-coloured icon, resolves when the action is done (no checkbox). Manual task = checkbox. Overdue time in `--error-text`                       |
| **VacancyCard**                                                                                                                          | `vacancy`                                                                                  | Icon tile, title, vertical chip, format, «N кандидатів», «N на співбесіді», VacancyStatusChip, urgency/bot badges, «N дн.»                                                                                                           |
| **VacancyPreviewPanel**                                                                                                                  | `vacancyId`                                                                                | Right panel 360 on the Vacancies list: header + status, tags, tabs Огляд / Кандидати / Історія, team, recruiter reward (BONUS-16 visibility), FunnelMini bars, details, recent activity                                              |
| **CandidateAvatar**                                                                                                                      | `photoUrl?`, `name`, `size`                                                                | Optional photo (signed URL) with initials fallback (`--primary-subtle` + `--link`); `alt` = name                                                                                                                                     |
| **CandidateKanbanCard**                                                                                                                  | `application`                                                                              | Avatar, name, current role, ⋯; source label; StageChip-detail or probation days; owner avatar; last activity                                                                                                                         |
| **CandidateDrawer**                                                                                                                      | `candidateId`                                                                              | Right Sheet 400 from kanban/table: header, tabs Інформація / Історія / Файли; contacts (role-gated), current vacancy, «Етап у воронці» = MoveToMenu trigger, owner, TL, next event, tags; footer «Перейти до профілю» / «Редагувати» |
| **CandidateHeader**                                                                                                                      | `candidate`                                                                                | Photo 96, name `display-2xl`, current role, person status (Активний / Резерв), contacts row (role-gated); actions ⋯, «Поділитися», «Перемістити до… ▾»                                                                               |
| **InfoStrip**                                                                                                                            | cells                                                                                      | Bordered row of cells: Вакансія · Джерело · Відповідальний · Зарплатні очікування · Теги                                                                                                                                             |
| **NextEventCard**                                                                                                                        | `event`                                                                                    | «Наступна подія» + status chip, type, date, time, Meet link «Приєднатися», participants, «Додати в календар» (.ics, A-19)                                                                                                            |
| **PrivateNotes**                                                                                                                         | `candidateId`                                                                              | Author-only notes (Phase 3): yellow-soft note (`#FEF9C3` / `#713F12`, 7.6:1), author + date; caption «Бачите лише ви»                                                                                                                |
| **ShareLinkButton**                                                                                                                      | `url`                                                                                      | «Поділитися» → copies card URL; toast «Посилання скопійовано»; no-access users get 404                                                                                                                                               |
| **StageChip**                                                                                                                            | `stage`, `size: sm\|md`, `detail?`, `routed?`                                              | §1.5; `aria-label="Етап: Співбесіда з тімлідом"`                                                                                                                                                                                     |
| **ProbationProgress**                                                                                                                    | `startDate`, `endDate`, `today`, `variant`                                                 | «День 35 з 90 · залишилось 55 дн.»; tick at day 30; ≤ 14 days → warning; overdue → error; `role="progressbar"` + Ukrainian `aria-valuetext`                                                                                          |
| **Timeline** (Stepper + EventFeed)                                                                                                       | `steps`, `events`                                                                          | Stepper per §1.5 with date + actor per step; feed «Історія взаємодій»: left date column, icon tile per event type, title, body, actor, row ⋯ (copy link only — append-only, no edit/delete)                                          |
| **FunnelMini**                                                                                                                           | `counts`, `variant: bar\|bars`                                                             | `bar` (table cell): stacked segments; `bars` (panels): vertical bars + count + label; each segment a button with `aria-label="Поліграф: 2"`; static for Finance                                                                      |
| **FunnelChart**                                                                                                                          | `rows`                                                                                     | Statistics funnel: horizontal bars in stage colours, count, % of first row                                                                                                                                                           |
| **BonusBadge**                                                                                                                           | `status`, `amount`, `currency` / `variant: summary`                                        | Status chip + money; summary = gift tile + amount + caption                                                                                                                                                                          |
| **MeetLinkInput**                                                                                                                        | `value`, `required`                                                                        | Validates `^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}$`; valid → check + «Відкрити ↗»                                                                                                                                     |
| **PriorityBadge**                                                                                                                        | `kind: tl\|urgency`                                                                        | «П0», «П0*»; «Термінова» + `flame`                                                                                                                                                                                                   |
| **BotBadge** «З бота»                                                                                                                    | —                                                                                          | Blue outline + `bot`; tooltip «Створено через Telegram-бота»                                                                                                                                                                         |
| **VacancyStatusChip**                                                                                                                    | `status`, `editable`                                                                       | 5 statuses; dropdown only with allowed transitions                                                                                                                                                                                   |
| **DisabledReason**                                                                                                                       | `reason`                                                                                   | Tooltip on desktop; visible helper text on touch                                                                                                                                                                                     |
| **MoveToMenu**                                                                                                                           | `allowedTransitions`                                                                       | «Перемістити до…» (button, drawer select, key `m`); disabled targets show the reason; opens RequiredDataDialog                                                                                                                       |
| **KanbanBoard / Column / Card**                                                                                                          | `columns`, `cards`, `onMove`                                                               | dnd-kit + keyboard sensor + Ukrainian announcements; virtualized columns; optimistic + rollback                                                                                                                                      |
| **CalendarWeek / EventBlock / EventDetailsPanel**                                                                                        | `range`, `events`                                                                          | Hours 08–20, 5-day default + «Показати вихідні»; now-line; block per §1.5; details panel 360 with «Перенести» / «Внести результат» per role                                                                                          |
| **BottomNav**                                                                                                                            | `items`                                                                                    | 5 items: Головна · Вакансії · Кандидати · Календар · Ще; active = `--link`; hidden for Finance                                                                                                                                       |
| **RequiredDataDialog**                                                                                                                   | `transition`                                                                               | Dialog on desktop, bottom sheet on mobile                                                                                                                                                                                            |
| **SlotPicker**, **FileDropzone**, **MoneyAmount / DateTime / RelativeTime**, **EmptyState / SectionError**, **FilterBar + SavedFilters** | —                                                                                          | Unchanged from Phase 0 spec (uk-UA formats, Europe/Kyiv)                                                                                                                                                                             |

## 6. States & speed patterns

- Skeletons copy the final boxes (KPI row, table rows, kanban cards) without shimmer and appear after 150 ms.
- Optimistic moves: the card moves instantly with a subtle «Зберігаємо…» dot. On failure it animates back and a toast shows «Зміну не збережено — повернули як було.»
- Button press feedback on `pointerdown` in under 16 ms; a spinner only after 150 ms.
- Prefetch nav links and cards on hover/viewport.

## 7. Accessibility checklist (component DoD)

- Every input has a label; never placeholder-only.
- Errors linked via `aria-describedby`.
- Dialogs: focus trap, return focus on close, `Esc` closes.
- Focus is always visible.
- AA contrast per §1.3 in both themes.
- Keyboard alternative for every drag and drop.
- `prefers-reduced-motion` respected.
- Touch targets ≥ 44.
- `aria-label`s in Ukrainian, from `messages/uk.json`.

## 8. Motion

> Decision record, interaction matrix and the "stay CSS-only" justification: `ui-foundation.md` §3. Built in task F1.

**Rules in one breath:** animate only what is seen occasionally (dialogs, drawers, popovers, toasts) and tiny press feedback; never keyboard-initiated actions, list filtering, tab/row selection, sidebar collapse; `transform` + `opacity` only (colour for hover); never `transition: all`, `ease-in`, or `scale(0)`; UI ≤ 300 ms, exits faster than enters; Radix exits are keyframes (Presence ignores transitions); no motion library.

### 8.1 Tokens (`@theme`, concrete values)

```css
@theme {
  /* Overrides Tailwind's weak built-in ease-out, so existing `ease-out` classes get the strong curve. */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);

  --duration-press: 120ms;
  --duration-tooltip: 125ms;
  --duration-popover: 160ms;
  --duration-popover-exit: 120ms;
  --duration-dialog: 200ms;
  --duration-dialog-exit: 150ms;
  --duration-drawer: 240ms;
  --duration-drawer-exit: 180ms;
}

:root {
  --motion-scale: 0.96; /* entering popovers/dialogs start here, never below 0.95 */
  --motion-shift: 100%; /* sheets/drawers travel their own size */
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-scale: 1; /* no scale */
    --motion-shift: 0%; /* no travel: only the opacity part of each keyframe remains */
  }
}
```

| Token (utility)                      | Value                 | Use                                                       |
| ------------------------------------ | --------------------- | --------------------------------------------------------- |
| `ease-out`                           | strong ease-out       | every enter/exit, press, default                          |
| `ease-in-out`                        | strong ease-in-out    | on-screen movement (rare: only if something moves/morphs) |
| `ease-drawer`                        | iOS-like drawer curve | bottom sheets and right drawers                           |
| `duration-press` / `-tooltip`        | 120 / 125 ms          | `:active` scale, colour hover / tooltip                   |
| `duration-popover` / `-popover-exit` | 160 / 120 ms          | dropdown, Select, Combobox, Popover                       |
| `duration-dialog` / `-dialog-exit`   | 200 / 150 ms          | Dialog, AlertDialog (desktop)                             |
| `duration-drawer` / `-drawer-exit`   | 240 / 180 ms          | mobile bottom sheet, Sheet                                |

### 8.2 Keyframes and utilities (shared by every Radix surface)

| Utility             | Keyframe `from` → `to`                                                                                            | Applied to                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `motion-pop`        | `opacity 0; scale var(--motion-scale)` → `opacity 1; scale 1`, origin = `var(--radix-*-content-transform-origin)` | dropdown, Select, Combobox, Popover, tooltip (`.97`) |
| `motion-modal`      | same, origin `center`, `duration-dialog` in / `-exit` out                                                         | Dialog, AlertDialog on ≥ 768 px                      |
| `motion-sheet-up`   | `translate: 0 var(--motion-shift)` + opacity → 0, `ease-drawer`                                                   | Dialog/AlertDialog bottom sheet below 768 px         |
| `motion-sheet-side` | `translate: var(--motion-shift) 0` + opacity → 0, `ease-drawer`                                                   | right Sheet                                          |
| `motion-fade`       | `opacity 0 → 1`, `duration-dialog`                                                                                | overlays (backdrops)                                 |

- Keyboard-opened surfaces carry `data-instant` and `animation: none` (the `openedBy` flag already exists in `useDeferredMenu`).
- Tooltip `data-state="instant-open"` (a neighbour was just open): `animation: none`.
- Press: `.btn:active { scale: .97 }` with `transition: scale var(--duration-press) var(--ease-out), background-color …, color …`; disabled and reduced-motion: none.
- Skeleton: no shimmer; `skeleton-delayed` (150 ms) stays.
- Overlay opacity animates together with its panel so they read as one surface; overlay colour `rgb(0 0 0 / .40)` light, `.60` dark.

### 8.3 Do-not-animate list

Row hover and selection · tab switch · list refresh, search typing, filter and chip changes, pagination · preview panel content swap · validation errors and "saved" text · status chip changes · sidebar collapse · page navigation · theme switch · anything opened from the keyboard.

### 8.4 Review checklist (every UI task)

| Check                                      | Pass when                                       |
| ------------------------------------------ | ----------------------------------------------- |
| Frequency gate answered for each animation | purpose named; "looks nice" is rejected         |
| Properties                                 | only `transform`/`opacity` (+ colour on hover)  |
| Curve and duration                         | tokens above, ≤ 300 ms, exit faster than enter  |
| Origin                                     | popovers from the trigger, modals centred       |
| Hover                                      | only inside `hover:`; touch uses `:active`      |
| Reduced motion                             | opacity only; verified with emulation           |
| Slow-motion pass                           | played at 3× once and re-checked on another day |
