# Wireframe — Головна (Dashboard) [UI-01, UI-02, PROB-07]

Reference: `reference/02-dashboard.webp`. Shell: `app-shell.md`. Adoption items: `design-adoption.md` (A-02, A-06, A-23, A-25, A-28, A-29, A-38).

## Desktop 1440 — Recruiter (recruiter1.gambling@demo), light

```
┌ shell ───────────────────────────────────────────────────────────────────────────────────────────────┐
│ Головна                                              Збережені фільтри: (Мої вакансії)(Гемблінг)(Термінові) [🔖 Зберегти] │
│ Уся ключова інформація про найм у вашій команді                                                      │
│ ┌Вертикаль──────┐┌Рекрутер─────┐┌Тімлід──────┐┌Посада──────┐┌Етап───────┐┌Пріоритет┐┌Період──────────────┐│
│ │Гемблінг ▾     ││Усі рекрутери▾││Усі тімліди▾││Усі посади ▾││Усі етапи ▾││Усі ▾    ││📅 3 – 9 листопада 2026││
│ └───────────────┘└─────────────┘└────────────┘└────────────┘└───────────┘└─────────┘└────────────────────┘│
│ ┌KPI──────────┐┌─────────────┐┌─────────────┐┌─────────────┐┌─────────────┐   ← Phase 4 (A-06)          │
│ │Кандидати [▮]││Відкриті  [▢]││На співбесі-[👥]││Вийшли на [✓]││Середній час [◷]│                        │
│ │124          ││вакансії 8   ││дах 24       ││роботу 4     ││найму 18 днів │                        │
│ │↑ +20 %      ││↑ +2         ││↑ +33 %      ││↑ +100 %     ││↓ −25 % (green)│                       │
│ │за 30 днів   ││з 12 місць   ││на всіх етапах││за листопад  ││проти жовтня  │                        │
│ └─────────────┘└─────────────┘└─────────────┘└─────────────┘└─────────────┘                          │
│ ┌ 📋 Мої задачі (5) ──────────────── [⋯] ┐ ┌ 📋 Вакансії (4)        [Картки|Канбан] [+ Створити вакансію] [⋯]┐│
│ │ ◉ Запит на перенесення співбесіди    │ │ ┌──────────────────────────┐┌──────────────────────────┐ ││
│ │   Олег Бондар · Медіабаєр · Гемблінг │ │ │[▣] Медіабаєр — Facebook ⋯││[▣] Медіабаєр — Facebook ⋯│ ││
│ │                 ◷ Сьогодні, 14:30 (ОК)│ │ │(Гемблінг) Віддалено [Термінова]││(Гемблінг) Офіс П1    │ ││
│ │ ◉ Тімлід прийняв — призначте співбесіду│ │ │👤 14 кандидатів 🎥 3 на співбесіді││👤 5 кандидатів 🎥 1   │ ││
│ │   Ірина Мельник · Медіабаєр          │ │ │(● Відкрита)     📅 12 дн.││(● Відкрита)     📅 6 дн. │ ││
│ │                 ◷ Сьогодні, 16:00 red │ │ └──────────────────────────┘└──────────────────────────┘ ││
│ │ ◉ Додайте посилання Meet             │ │ ┌──────────────────────────┐┌──────────────────────────┐ ││
│ │   Скринінг · Завтра, 11:00           │ │ │ … 2 more cards           ││                          │ ││
│ │ ◉ Випробування закінчується · 7 дн.  │ │ └──────────────────────────┘└──────────────────────────┘ ││
│ └──────────────────────────────────────┘ └──────────────────────────────────────────────────────────┘│
│ ┌ 👥 Кандидати (24)  Кандидати на всіх етапах найму                                  [Переглянути всіх] ┐│
│ │┌● Новий 3──┐┌▶ В роботі 5┐┌👥 У тімліда 4┐┌🎥 Співбесіда 3┐┌📋 Поліграф 2┐┌📄 Офер 1┐┌📊 Випробування 4┐ ││
│ ││ card      ││ card       ││ card         ││ card          ││ card        ││ card    ││ card            │ ││
│ ││ card      ││ card       ││ card         ││               ││             ││         ││                 │ ││
│ ││+ Додати   ││            ││              ││               ││             ││         ││                 │ ││
│ ││ кандидата ││            ││              ││               ││             ││         ││                 │ ││
│ │└───────────┘└────────────┘└──────────────┘└───────────────┘└─────────────┘└─────────┘└─────────────────┘ ││
│ └───────────────────────────────────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Grid:** filters full width; KPI row 5 equal cards; Мої задачі = 5 cols, Вакансії = 7 cols; Кандидати = 12 cols. Gap 24.
- **Мої задачі (Phases 2–4):** system tasks only. The left icon is a stage-coloured status icon (◉), not a checkbox; the task disappears when the action is done. Row: title (`text-sm` 500), candidate · vacancy · vertical (`text-xs` muted), due time right (overdue = `--error-text` + clock icon), assignee/candidate avatar. Click opens the target dialog or card.
- **Мої задачі (Phase 5, ✅ A-02):** «+ Додати задачу» button + tabs `Усі (5) · Сьогодні (2) · Прострочені (1) · Без дати (2)`. Manual tasks show a checkbox (ring colour: red = overdue, amber = today).
- **KPI row (✅ A-06, Phase 4):** scoped to the viewer; labels per ⏳ A-38; each card is a link to the filtered list (not Finance). Absent before Phase 4 (no empty placeholders).
- **Kanban columns:** header = stage bg, icon + label + count pill; body = stage bg; «+ Додати кандидата» only in «Новий» and only for roles that can create (A-25).

### Kanban card anatomy (UI-02, A-23)
```
┌──────────────────────────────────┐
│ (photo) Ірина Мельник        [⋯] │  CandidateAvatar 32 (photo or initials) · name 2 lines max
│         Медіабаєр, Parimatch     │  current role/company (muted)
│ Медіабаєр — Facebook · Василь П. │  vacancy · TL (text-xs, 1 line)
│ in LinkedIn          [З бота]    │  source label · bot badge if any
│ 🎥 14.11, 15:30  (ОК)   2 год тому│  stage detail · owner avatar · last activity
└──────────────────────────────────┘   w 248, min-h 112, radius 12, shadow sm, gap 8
```
- Stage detail line: IN_WORK «Скринінг 13.11, 11:00» or warning «Немає посилання Meet»; SUBMITTED «Очікує рішення» / «Прийнято тімлідом»; TL_INTERVIEW time or «Очікує перенесення» (red-soft pill); POLYGRAPH «Не призначено» / date / «Очікує висновку»; OFFER «Чернетка» / «Надіслано 14.11» / «Не доставлено»; PROBATION ProbationProgress compact «День 35 з 90».

### Drag & drop rules (unchanged)
- On drag start, columns compute allowed targets from the card's `allowedTransitions`. Allowed: 2 px dashed `--brand` outline. Forbidden: 50 % opacity + `not-allowed` cursor; hovering shows the reason chip («Спершу тімлід має прийняти кандидата»).
- Drop on an allowed column that needs data → dialog (D-01/D-02/D-04…); the card renders as a ghost in the target until submit; cancel → animates back.
- Drop with no required data → optimistic move immediately.
- Reject/withdraw drop zone appears at the bottom while dragging: `[Відмовити] [Самовідвід]` (only if allowed).
- Keyboard: `Space` pick up, arrows, `Space` drop, `Esc` cancel (Ukrainian announcements); or `m` → «Перемістити до…».
- Column header: name + count; collapsible to 44 px; long columns virtualized with «+ 120 ще».

## Role differences

| Role | My tasks | Vacancies block | Candidate board |
|---|---|---|---|
| Admin | bonuses to pay, retention purge proposals | all, filter by vertical | all 7 active columns, force move in menu |
| Head Recruiter | approve bonuses, reassign, RESCH-03 alerts, probation endings | vertical | all 7 columns; «Повернути на попередній етап» in menu |
| Recruiter | see `screens.md` S-03 | assigned + unassigned («Без рекрутера» badge) | own; DnD up to Поліграф |
| Head HR | assign HR, create/send offers, offer outcomes, probation endings | read-only | Поліграф · Офер · Випробування |
| HR | polygraphs to schedule, PDFs to upload, first day, offer outcomes | read-only | Поліграф · Офер · Випробування |
| Team Lead | accept/decline, interview results, reschedule answers, probation endings | own vacancies; «Запросити вакансію» | У тімліда · Співбесіда · Поліграф · Офер · Випробування; buttons on cards |
| Finance | — (no dashboard; lands on Статистика) | — | — |

KPI row content follows the same scope (TL: own vacancies; HR/HHR: from Polygraph; Recruiter: own).

## Mobile 390 — Team Lead (vasyl.tl@demo)

```
┌──────────────────────────────┐
│ [H] Hiring        🔍  🔔•  (ВП)│
│ Головна                      │
│ ┌124──┐┌8───┐┌24──┐┌4───┐ →   │  KPI tiles scroll (Phase 4)
│ └─────┘└────┘└────┘└────┘     │
│ Мої задачі (3)          [+]  │  [+] and tabs from Phase 5
│ (Усі)(Сьогодні)(Прострочені) │
│ ┌──────────────────────────┐ │
│ │ Розгляньте кандидата     │ │
│ │ Ірина Мельник · Медіабаєр│ │
│ │ «4 роки FB, ROI 140%…»   │ │  recruiter summary, 2 lines
│ │ [ Відхилити ] [ Прийняти ]│ │  48 px, equal width
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Внесіть результат        │ │
│ │ Ольга Ткач · сьогодні 15:30│
│ │ [Приєднатися ↗]          │ │
│ │ [Перенести] [Результат]  │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Завершіть випробувальний │ │
│ │ Андрій Шевчук ▓▓▓▓░ 35/90│ │
│ │ [Не пройдено] [Завершити]│ │
│ └──────────────────────────┘ │
│ Вакансії · Кандидати (below) │
├──────────────────────────────┤
│ Головна Вакансії Кандидати Календар Ще│
└──────────────────────────────┘
```

## States
- **Loading:** skeleton = KPI row (Phase 4+), 4 task rows (circle + 2 lines), 4 vacancy cards, 7 columns × 3 cards; same boxes as final (CLS < 0.05).
- **Empty tasks:** «Усе зроблено. Нових задач немає.» (check icon in green-soft circle).
- **Empty board:** Rec «Додайте першого кандидата» [+ Додати кандидата]; TL «Поки що немає кандидатів на ваші вакансії»; HR «Немає кандидатів на етапі поліграфа».
- **Filtered empty:** «Нічого не знайдено за фільтрами» [Скинути фільтри].
- **Error (per block):** «Не вдалося завантажити задачі.» [Спробувати ще раз]; other blocks keep working.
