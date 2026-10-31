# Wireframe — Статистика (general) [STAT-01..08, BONUS-13]

Reference: `reference/07-statistics.webp`. Finance variant: `finance-statistics.md`. Adoption: A-07, A-38, A-39, A-47, A-48.

## Desktop 1440 — Admin, tab Огляд, light

```
┌ shell ───────────────────────────────────────────────────────────────────────────────────────────────┐
│ Статистика                                                      ◷ Оновлено о 06:00   [⬇ Експорт ▾]  │
│ Ключові метрики, аналітика найму та ефективність команди                                             │
│ [Огляд] [Воронка] [Час] [Джерела] [Тімліди] [Рекрутери] [Бонуси] [Виплати]     (underline tabs)       │
│ [📅 1 жовтня 2026 — 31 жовтня 2026 ▾] [Усі вертикалі ▾] [Усі посади ▾] [Усі рекрутери ▾] [Усі тімліди ▾]  ↺ Скинути фільтри │
│ ┌[👥] Вийшли на ┐┌[▮] Конверсія┐┌[◷] Середній  ┐┌[▢] Відкриті  ┐┌[🎁] Виплачено ┐                       │
│ │роботу 24      ││12 %         ││час найму     ││вакансії 24   ││бонусів        │                       │
│ │↑ +20 %        ││↑ +3 в.п.    ││18 днів ↓ −25 %││↑ +33 %       ││12 500 $ ↑ +50 %│                      │
│ │проти вересня  ││з усіх канд. ││проти вересня ││на кінець пер.││за жовтень     │                       │
│ └───────────────┘└─────────────┘└──────────────┘└──────────────┘└───────────────┘                       │
│ ┌ Воронка конверсії ⓘ  Конверсія 12 % [За кількістю ▾] ┐┌ Динаміка найму ⓘ        [За кількістю ▾] ┐│
│ │ ████████████████████ Усі кандидати    1 248  100 %   ││  bars by month: Вийшли на роботу (brand) ││
│ │ ███████████████      В роботі           768   62 %   ││  vs Відкрито вакансій (brand 40 %)       ││
│ │ ███████████          У тімліда          512   41 %   ││  Лис … Жов                                ││
│ │ ████████             Співбесіда         432   35 %   ││  legend below                             ││
│ │ ██████               Поліграф           216   17 %   ││                                           ││
│ │ ████                 Офер                96    8 %   ││                                           ││
│ │ ███                  Випробування        40    3 %   ││                                           ││
│ │ ██                   Найнято             24    2 %   ││                                           ││
│ └──────────────────────────────────────────────────────┘└───────────────────────────────────────────┘│
│ ┌ Середній час найму ⓘ [За місяцями ▾]┐┌ Топ рекрутерів ⓘ   Всі рекрутери → ┐┌ Бонуси та виплати ⓘ ┐ │
│ │ line chart (brand), area 10 %       ││ # Рекрутер    Вийшли Конв. Сер.час  ││ [🎁] 12 500 $ ↑ +50 %│ │
│ │ points labelled                      ││ 1 (ОК) Оксана К. 8   16 %  14 днів ││ Виплачено в жовтні   │ │
│ │                                      ││ 2 (ДЛ) Дмитро Л. 6   14 %  18 днів ││ 24      520 $   100 %│ │
│ │                                      ││ …                                  ││ найми   серед.  виплат│ │
│ │                                      ││                                    ││ з бон.  бонус   заверш.││
│ │                                      ││                                    ││ [Переглянути виплати →]│ │
│ └──────────────────────────────────────┘└────────────────────────────────────┘└──────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Funnel (✅ A-07):** our stages only, bars in stage colours, count + % of the first row; each row is a link to the filtered candidate list (not for Finance). It counts applications that reached the stage in the period.
- **KPI labels/definitions** follow ⏳ A-38: «Вийшли на роботу» = probation started (STAT-01 hires); «Середній час найму» = time-to-fill (STAT-03); «Конверсія» = вийшли на роботу ÷ усі кандидати періоду. Delta colour by meaning (time ↓ = green).
- **Widgets by role (A-48):** «Бонуси та виплати» and the «Виплачено бонусів» KPI only for Admin, HRec, Finance, Recruiter (own); «Топ рекрутерів» for Admin, HRec, Finance. A hidden widget's grid cell is taken by its neighbour (no empty slots).
- **Charts** are lazy-loaded; numbers (KPI, funnel table) render first; each chart has a «Таблиця» toggle for screen readers (`aria-describedby` summary).
- **Export (A-39):** one «Експорт ▾» → CSV / XLSX for the current tab + filters.

## Other tabs (layout pattern)
- Воронка: big FunnelChart + conversion table by vertical/position/recruiter/TL (STAT-02).
- Час: KPI per metric (time-to-submit, time-to-interview, time-in-stage, time-to-offer, time-to-fill) + line chart + table (STAT-03).
- Джерела: hires per source, bar chart + table (STAT-04).
- Тімліди: table accept/decline rate, interview → offer, avg response time, reschedules (STAT-05).
- Рекрутери: STAT-01 table + «хто кого привів» table.
- Бонуси / Виплати: per `finance-statistics.md` (with Admin/HRec actions per `screens.md` S-12).

## Mobile 390
- Tabs scroll horizontally; period chip + filter icon (sheet with filters); KPI 2×2 tiles; widgets stacked full width; tables become stacked rows; export in ⋯.

## States
- Loading: tabs + filters real; KPI skeletons; chart boxes fixed height (no CLS).
- No data: «За обраний період даних немає».
- Error per widget; others keep rendering.
