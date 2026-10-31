# Design system (Phase 0 spec)

> Tailwind + shadcn/ui (Radix) + lucide. Tokens are CSS variables consumed by `tailwind.config` (shadcn convention). Dense-but-calm: borders over shadows, 14 px body, one accent colour. Contrast values checked against WCAG 2.1 AA (text ≥ 4.5:1, large text / UI boundaries ≥ 3:1).

## 1. Colour tokens

### 1.1 Base (semantic)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FFFFFF` | `#0B0F17` | page |
| `--surface` (card) | `#FFFFFF` | `#111722` | cards, popovers, dialogs |
| `--surface-subtle` | `#F8FAFC` | `#151C29` | kanban column bg, table header, sidebar |
| `--foreground` | `#0F172A` | `#E6EAF2` | primary text (16.7:1 / 15.1:1) |
| `--muted` | `#F1F5F9` | `#1A2130` | hover rows, skeleton base |
| `--muted-foreground` | `#475569` | `#9AA4B5` | secondary text (7.6:1 / 7.6:1); never lighter for text |
| `--border` | `#E2E8F0` | `#253043` | dividers, card borders (decorative) |
| `--input` | `#7B8698` | `#5B6880` | input/checkbox borders (≥ 3:1 vs bg) |
| `--primary` | `#4F46E5` | `#818CF8` | primary buttons, links, selected nav |
| `--primary-foreground` | `#FFFFFF` | `#0B0F17` | text on primary (6.3:1 / 6.4:1) |
| `--ring` | `#4F46E5` | `#A5B4FC` | focus ring |
| `--destructive` | `#DC2626` | `#DC2626` | destructive buttons (white text 4.8:1) |
| `--destructive-text` | `#B91C1C` | `#FCA5A5` | error text, inline validation |
| `--success-text` | `#15803D` | `#86EFAC` | positive deltas, «Пройдено» |
| `--warning-text` | `#B45309` | `#FCD34D` | warnings, «Очікує перенесення» |
| `--info-bg` | `#EEF2FF` | `#1E2240` | info banners |
| `--skeleton` | `#E9EEF4` | `#1C2433` | skeleton blocks (no shimmer in screenshots) |

Theme: `class="dark"` on `<html>`, chosen in Профіль (Світла / Темна / Системна); default Системна; no flash (theme script before paint).

### 1.2 Stage colours (StageChip, stepper, kanban column accent)

Chip = tinted bg + dark text + 6 px dot + icon. **Colour is never the only cue** (text + icon always present). Dark chip bg = dot colour at 16 % alpha over `--surface`.

| Stage | Icon (lucide) | Light bg | Light text | Dot / accent | Dark text |
|---|---|---|---|---|---|
| `NEW` Новий | `circle-dashed` | `#F1F5F9` | `#334155` | `#64748B` | `#CBD5E1` |
| `IN_WORK` В роботі | `phone` | `#E0F2FE` | `#075985` | `#0284C7` | `#7DD3FC` |
| `SUBMITTED_TO_TL` У тімліда | `send` | `#EDE9FE` | `#5B21B6` | `#7C3AED` | `#C4B5FD` |
| `TL_INTERVIEW` Співбесіда | `video` | `#DBEAFE` | `#1E40AF` | `#2563EB` | `#93C5FD` |
| `POLYGRAPH` Поліграф | `activity` | `#FEF3C7` | `#92400E` | `#D97706` | `#FCD34D` |
| `OFFER` Офер | `file-signature` | `#FCE7F3` | `#9D174D` | `#DB2777` | `#F9A8D4` |
| `PROBATION` Випробування | `hourglass` | `#CCFBF1` | `#115E59` | `#0D9488` | `#5EEAD4` |
| `PROBATION_PASSED` Найнято | `badge-check` | `#DCFCE7` | `#166534` | `#16A34A` | `#86EFAC` |
| `REJECTED` Відмова | `circle-x` | `#FEE2E2` | `#991B1B` | `#DC2626` | `#FCA5A5` |
| `WITHDRAWN` Самовідвід | `undo-2` | `#F4F4F5` | `#3F3F46` | `#71717A` | `#D4D4D8` |
| `PROBATION_FAILED` Не пройшов ВТ | `circle-slash` | `#FFE4E6` | `#9F1239` | `#E11D48` | `#FDA4AF` |

Light text/bg pairs ≈ 7:1 or better; dark text on 16 % tint over `#111722` must stay ≥ 4.5:1 (target 7:1) — verify with axe in the Phase 1 screenshot review.

### 1.3 Other status palettes

| Kind | Value → palette (same structure as stages) |
|---|---|
| Vacancy status | Чернетка slate (dashed border) · Відкрита green · Призупинена amber · Заповнена indigo · Скасована zinc |
| Bonus status | Заплановано slate · Нараховано sky · Затверджено indigo · Виплачено green · Скасовано zinc · Призупинено amber · Очікує повернення orange (`#9A3412` / `#FFEDD5`) · Повернено rose |
| Urgency | Термінова: red text `#B91C1C`, bg `#FEF2F2`, icon `flame` |
| Bot source | «З бота»: sky outline badge, icon `bot` |

## 2. Typography

Font: **Inter** via `next/font` (subsets `latin`, `cyrillic`, `display: swap`, size-adjusted fallback → no CLS). Numbers: `font-variant-numeric: tabular-nums` in tables, KPIs, money, dates.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `text-xs` | 12 / 16 | 500 | chips, captions, timestamps |
| `text-sm` | 13 / 18 | 400 | dense tables, kanban card secondary |
| `text-base` | 14 / 20 | 400 | body (desktop) |
| `text-md` | 16 / 24 | 400 | body + **all inputs on mobile** (prevents iOS zoom) |
| `text-lg` | 18 / 26 | 600 | section titles |
| `text-xl` | 20 / 28 | 600 | card titles (candidate/vacancy name) |
| `text-2xl` | 24 / 32 | 600 | page titles |
| `text-3xl` | 30 / 36 | 600 | KPI numbers |

Ukrainian text rules: labels ~25–35 % longer than English — size containers for Ukrainian, not English. Chips/tabs/nav: `whitespace-nowrap` + `max-w` + ellipsis + `title`/tooltip. Long tokens (emails, URLs, Telegram) `overflow-wrap:anywhere`. `lang="uk"` on `<html>`; paragraphs `hyphens:auto`. Screenshot review checks: «Випробувальний термін», «Співбесіда з тімлідом», «Невідповідність зарплатних очікувань» at 390 px.

## 3. Spacing, sizing, radius, elevation, motion

| Token | Values |
|---|---|
| Spacing (4 px grid) | 0.5=2 · 1=4 · 1.5=6 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24 · 8=32 · 10=40 · 12=48 |
| Layout | sidebar 232 (collapsed 56) · topbar 52 · page padding 24 desktop / 16 mobile · section gap 24 · card padding 12–16 |
| Density | table row 36 (desktop) / 48 (mobile) · kanban card min-h 88, w 220–260, gap 8 · column w 272 |
| Hit targets | ≥ 32 desktop, ≥ 44 touch; mobile sticky action bar buttons 48 |
| Radius | `sm` 4 chips · `md` 6 buttons/inputs · `lg` 8 cards/dialogs · `xl` 12 bottom-sheet top · `full` avatars/dots |
| Elevation | `0` borders only (default) · `1` popover/dropdown `0 4px 12px rgb(15 23 42 / .08)` · `2` dialog `0 12px 32px rgb(15 23 42 / .16)`; dark mode: no shadows, use `--surface` step + border |
| Z-index | sticky 10 · header 20 · dropdown 30 · sheet/dialog 40 · toast 50 · command 60 |
| Motion | 120 ms (hover/press) · 160 ms (popover, card move) · 200 ms (sheet); `ease-out`; `prefers-reduced-motion` → 0; disabled in screenshot mode |
| Breakpoints | sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1440 |
| Focus | `outline: 2px solid var(--ring); outline-offset: 2px` on `:focus-visible` — never removed |

## 4. shadcn/ui components used

| Component | Used for |
|---|---|
| Button, Badge, Avatar, Separator, Skeleton | everywhere |
| Input, Textarea, Label, Form (react-hook-form + Zod), Checkbox, RadioGroup, Switch, Select, ToggleGroup | forms, filters, result toggles |
| Command + Popover (Combobox) | searchable selects (vacancy, TL, position), Ctrl K global search |
| Dialog, AlertDialog | required-data dialogs; **AlertDialog for every destructive action** |
| Drawer (vaul) / Sheet | mobile bottom sheets; side panel quick view |
| DropdownMenu, ContextMenu | `⋯` menus, «Перемістити до…» |
| Tooltip, HoverCard | disabled-reason tooltips, user hover cards |
| Tabs | card tabs, statistics, archive |
| Table (+ TanStack Table / Virtual) | lists, reports |
| Calendar + Popover (DatePicker), time select | scheduling (uk locale, week starts Monday) |
| Progress | upload progress (ProbationProgress is custom) |
| Breadcrumb, ScrollArea, Collapsible, Accordion | navigation, kanban columns, settings |
| Sonner (Toast) | optimistic feedback, rollback errors |
| Alert | banners (read-only vertical, routed, delivery failed) |

## 5. Custom components

| Component | Props (key) | Behaviour / a11y |
|---|---|---|
| **StageChip** | `stage`, `size: sm\|md`, `detail?` (e.g. «47 дн.»), `routed?` | Tinted chip + icon + label (§1.2). `routed` → label «Передано далі». Tooltip with full stage name when abbreviated. `aria-label="Етап: Співбесіда з тімлідом"`. |
| **ProbationProgress** | `startDate`, `endDate`, `today` (server), `earlyCloseFrom`, `variant: compact\|full` | Bar + «День 35 з 90 · залишилось 55 дн.»; tick mark at day 30 labelled «30 дн.»; ≤ 14 days left → warning colour; overdue → destructive «Прострочено на 3 дн.». `role="progressbar"` with `aria-valuenow/max`, `aria-valuetext` in Ukrainian. Days computed server-side (Europe/Kyiv). |
| **Timeline** (Stepper + EventFeed) | `steps[]` (state, date, actor, facts), `events` (cursor), `filters` | Stepper: `<ol>` with `aria-current="step"`; steps are buttons that filter feed. Horizontal ≥ lg, vertical on mobile (collapsed to current ±1). Feed: grouped by month, virtualized, field changes «старе → нове», actor avatar, «Система» for automatic events, filter chips (Етапи, Поля, Файли, Коментарі, Перенесення, Бонуси) + author filter. Append-only: no edit/delete affordances on events. |
| **FunnelMini** | `counts` per stage, `onSegmentClick?` | Compact bar (h 6) or sparkline-like stacked segments in stage colours + total; each segment a button with `aria-label="Поліграф: 2"`; non-interactive for Finance. Text fallback list on hover/focus. |
| **BonusBadge** | `status`, `amount`, `currency`, `expectedDate?`, `snapshotInfo?` | Status chip + money (tabular). Tooltip: snapshot date, scheme, rate, multiplier. Expected date moved earlier → old date struck-through. |
| **MeetLinkInput** | `value`, `onChange`, `required` | `inputmode="url"`, paste-normalises whitespace (query handling ⚠ OPEN-F5); live validation against `^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}$`; error «Вставте посилання у форматі https://meet.google.com/abc-defg-hij»; valid → check icon + «Відкрити ↗» button (test link). Shared Zod schema with API. |
| **PriorityBadge** | `kind: tl\|urgency`, `value` | `tl`: neutral outline «П0» with tooltip «Пріоритет тімліда: 0 (найвищий)»; override → «П0*» tooltip «Пріоритет для цієї вакансії». `urgency`: «Термінова» red with `flame` icon; Normal renders nothing. |
| **BotBadge** «З бота» | — | Shown when `source = TELEGRAM_BOT` on vacancy (and candidate if applicable); sky outline + `bot` icon; tooltip «Створено через Telegram-бота». |
| **VacancyStatusChip** | `status`, `editable` | Static chip or dropdown (only allowed transitions). |
| **DisabledReason** | `reason`, children | Wraps a disabled control: tooltip on desktop (trigger on focusable wrapper since disabled buttons don't fire events), visible helper text under control on touch / `pointer: coarse`. `aria-describedby` links reason. |
| **MoveToMenu** | `allowedTransitions` | Keyboard DnD alternative; lists allowed targets + disabled ones with reason; opens required-data dialog. Shortcut `m`. |
| **KanbanBoard / Column / Card** | `columns`, `cards`, `onMove` | dnd-kit with keyboard sensor + Ukrainian screen-reader announcements; virtualized columns; optimistic placement + rollback animation. |
| **RequiredDataDialog** | `transition` | Generic shell mapping transition → form schema (Meet, polygraph, offer…); Dialog on desktop, Drawer on mobile. |
| **SlotPicker** | `min=1`, `max=3` | Reschedule slots: date + time rows, add/remove, validates future & distinct. |
| **FileDropzone** | `accept`, `maxSize` | Direct signed-URL upload with progress; errors «Потрібен PDF-файл до 15 МБ». |
| **MoneyAmount / DateTime / RelativeTime** | — | uk-UA formatting, Europe/Kyiv; `<time datetime>`. |
| **EmptyState / SectionError** | `icon`, `title`, `action?` / `onRetry` | Standard empty and per-section error blocks. |
| **FilterBar + SavedFilters** | URL-synced | Chips for active filters; «Скинути»; saved filters as pills. |

## 6. States & speed patterns
- Skeletons: same box sizes as final content, no shimmer animation (stable screenshots), delay 150 ms.
- Optimistic: card moves instantly, shows subtle «Зберігаємо…» dot until server ack; on failure card animates back + toast.
- Button press feedback: pressed state on `pointerdown` (< 16 ms); spinner only after 150 ms.
- Prefetch on hover/viewport for cards and nav links.

## 7. Accessibility checklist (component DoD)
Labels on every input (no placeholder-only) · errors linked via `aria-describedby` · focus trap + return focus in dialogs · `Esc` closes · visible focus · AA contrast in both themes · keyboard alternative for DnD · `prefers-reduced-motion` · touch targets ≥ 44 · Ukrainian `aria-label`s from `messages/uk.json`.
