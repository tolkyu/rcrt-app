# Wireframe — App shell [UI-04, UI-05, D28, D41]

Reference: every screen mockup + `reference/01-components.webp` §03 Навігація / §06 Мобільні компоненти. Tokens: `design-system.md`.

## Desktop 1440 — Head Recruiter, light

```
┌──────────────────────┬──────────────────────────────────────────────────────────────────────────────────┐
│ [H] Hiring           │ [☰] [Усі мої вертикалі ▾]  [🔍 Пошук кандидатів і вакансій…   Ctrl + K]  🔔• ☀  (ОШ) Олена Шевченко  ▾ │
│                      │                                                                        Керівник рекрутингу · Гемблінг │
│ ▣ Головна            ├──────────────────────────────────────────────────────────────────────────────────┤
│ ▢ Вакансії           │ Головна                                                       [primary action] [⋯] │
│ ▢ Кандидати          │ Уся ключова інформація про найм у вашій команді                                    │
│ ▢ Календар           │                                                                                    │
│ ▢ Статистика         │  (page content on --background #F8FAFC; cards on --surface, radius 16, shadow sm)  │
│ ▢ Архів              │                                                                                    │
│                      │                                                                                    │
│                      │                                                                                    │
│ ⚙ Налаштування       │                                                                                    │
└──────────────────────┴──────────────────────────────────────────────────────────────────────────────────┘
  240 px, --surface, right border                 top bar 64 px, --surface, bottom border
```

- Active nav item: `--primary-subtle` bg, `--link` icon + label, radius 12, h 40. Inactive: `--foreground` label, `--muted-foreground` icon.
- ☰ collapses the sidebar to a 72 px icon rail (tooltips with labels), remembered per user. Below 1024 px the sidebar becomes an off-canvas Sheet.
- Bell: red dot = unread (dot + `aria-label="Сповіщення: 3 непрочитані"`). Theme toggle cycles Світла / Темна / Системна.
- User block: name (`text-sm` 600) + role · vertical (`text-xs` muted); multi-role → «Рекрутер · Гемблінг +1».

## Role variants

| Role                                           | Sidebar                                                                            | Top bar                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| Admin                                          | all + Налаштування                                                                 | full                                            |
| Head Recruiter / Recruiter / Head HR / HR / TL | Головна · Вакансії · Кандидати · Календар · Статистика · Архів (per screens.md §1) | full; vertical selector only with ≥ 2 verticals |
| Finance                                        | Статистика only                                                                    | theme toggle + avatar only                      |

## Mobile 390

```
┌──────────────────────────────┐
│ [H] Hiring        🔍  🔔•  (ОШ)│  56 px
│ Головна                      │  heading-lg
│ Уся ключова інформація       │  text-xs muted
├──────────────────────────────┤
│ …content…                    │
├──────────────────────────────┤
│  ⌂      ▢       👤      📅    ⋯ │
│Головна Вакансії Кандидати Календар Ще│  64 px + safe area; active = --link
└──────────────────────────────┘
```

- «Ще» opens a sheet: Статистика, Архів, Налаштування (Admin), Профіль, Вийти.
- Dark: sidebar/top bar `#111827`, page `#0B1220`, bottom nav `#111827` with top border `#334155`.

## States

- Loading: shell renders immediately (static); only content shows skeletons.
- Offline / error: banner under top bar (Alert), shell stays interactive.
