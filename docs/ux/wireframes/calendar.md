# Wireframe — Календар [PIPE-04, PIPE-05, POLY-02, RESCH-01..04]

Reference: `reference/06-calendar.webp`. Adoption: A-09, A-16, A-24, A-25, A-26, A-42, A-44.

## Desktop 1440 — Team Lead, week view, light

```
┌ shell ───────────────────────────────────────────────────────────────────────────────────────────────┐
│ Календар                                                                                             │
│ Усі події: скринінги, співбесіди та поліграфи                                                        │
│ [Сьогодні] [‹] [›]  3 – 9 листопада 2026                [Тиждень|День|Список]   [◻ Показати вихідні] │
│ Тип події [Усі типи ▾]   Вертикаль [Усі мої вертикалі ▾]   Учасник [Усі учасники ▾]                    │
│ ┌ week grid (8/12) ───────────────────────────────────────────────┐ ┌ Деталі події (360) ──── [×] ┐│
│ │        Пн 3 лист  Вт 4 лист  Ср 5 лист  Чт 6 лист  Пт 7 лист   │ │ (● Очікує перенесення)   [⋯] ││
│ │ 09:00 ┌Скринінг┐            ┌Поліграф┐            ┌Скринінг┐    │ │ [🎥] Співбесіда з тімлідом   ││
│ │       │09:00–09:45│         │09:00–10:00│         │…        │    │ │      11:00 – 12:00           ││
│ │       │Андрій М.│           │Тарас Ш. │           └─────────┘    │ │      Середа, 5 листопада 2026││
│ │ 10:00 └─────────┘           └─────────┘                         │ │ 📍 Google Meet               ││
│ │ 11:00 ┌Співбесіда─┐┌Скринінг┐                                    │ │    meet.google.com/abc-defg-hij [⧉]││
│ │       │11:00–12:00││…        │   (selected = 2 px --brand border)│ │    [Приєднатися ↗]           ││
│ │       │Олександр Б.│                                             │ │ Кандидат                      ││
│ │ 12:00 └───────────┘                                             │ │ (ДЛ) Дмитро Литвин  [Відкрити →]││
│ │ 13:00                                                           │ │ Вакансія                      ││
│ │ 14:20 ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │ [▣] Медіабаєр — Facebook      ││
│ │ 15:00 ┌Співбесіда┐ ┌Поліграф┐            ┌Скринінг┐             │ │     Гемблінг · Віддалено      ││
│ │ 16:00 …                                                        │ │ Учасники                      ││
│ │ 17:00                                                          │ │ (ОК) Оксана Кравець (Організатор)││
│ │ 18:00                                                          │ │ (ВП) Василь Петренко · Тімлід ││
│ └────────────────────────────────────────────────────────────────┘ │ Підсумок для тімліда          ││
│                                                                    │ «4 роки FB, ROI 140 %…»       ││
│                                                                    │ [Перенести] [Внести результат]││
│                                                                    └──────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Grid:** hours 08:00–20:00 (scrolls to 08:00), slot 60 px/h, Пн–Пт by default; «Показати вихідні» adds Сб–Нд and turns on automatically when the week has a weekend event (A-42). Today column header = `--primary-subtle` + `--link`. Now-line: 2 px `--now-line` + time pill.
- **Event block:** stage colour (Скринінг = В роботі blue, Співбесіда = indigo, Поліграф = amber; A-24), 3 px left accent, time (`text-xs`), type (`text-sm` 600), candidate, vacancy/role. Overlaps split the column width. «Очікує перенесення» = red-soft dot on the block.
- **Only pipeline events** (A-16): Скринінг, Співбесіда з тімлідом, Поліграф. No manual events, no «Підключити календар» in v1 (✅ A-09: post-launch).
- **Details panel footer by role:** TL — «Перенести» (D-06) · «Внести результат» (D-05, enabled after start time); Recruiter — «Підтвердити час» (D-07, when pending) · «Неявка» (D-08); HR — «Внести результат» (D-10) for polygraph; Admin/HRec — view + open card. Polygraph: place instead of Meet. TL never sees candidate phone/email.
- **Notes:** the panel shows existing data only (recruiter summary for TL, A-26).

## Day / List views
- День: same grid, one column, wider blocks with vacancy + participants.
- Список: grouped by day, rows = time · type chip · candidate · vacancy · status; default on mobile.

## Mobile 390 — Team Lead
```
┌──────────────────────────────┐
│ [H] Hiring        🔍  🔔•  (ВП)│
│ Календар                     │
│ [‹] 3 – 9 листопада      [⇄] │  ⇄ = switch to Список/Тиждень
│ Пн  Вт  [Ср]  Чт  Пт         │  week strip, selected day = filled --primary
│ 3   4   5     6   7          │
│ Середа, 5 листопада 2026     │
│ ┌[📋] 09:00–10:00          ⋮┐│
│ │ Поліграф · Тарас Шевченко ││
│ └───────────────────────────┘│
│ ┌[🎥] 11:30–12:30          ⋮┐│
│ │ Співбесіда · Дмитро Литвин││
│ └───────────────────────────┘│
├──────────────────────────────┤
│ bottom nav (Календар active) │
└──────────────────────────────┘
```
- Tap an event → bottom sheet with the details panel content; actions 48 px. No FAB (A-25).

## States
- Loading: toolbar real; grid lines real; 6 skeleton blocks; panel skeleton.
- Empty week: «На цей тиждень подій немає» centred in the grid.
- No event selected: panel shows «Оберіть подію, щоб побачити деталі».
- Error: SectionError over the grid; toolbar stays usable.
