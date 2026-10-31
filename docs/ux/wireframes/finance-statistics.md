# Wireframe — Статистика для фінансиста (finance@demo) [STAT-01..08, BONUS-13, D12]

Finance sees **only** Статистика: single nav item, no search, no bell ⚠ OPEN-S2, no dashboard. Every number is plain text (no drill-down links into candidates/vacancies). All other routes → redirect `/statistics`; object URLs → 404.

## Desktop 1440 — Огляд

```
┌──────────────┬────────────────────────────────────────────────────────────────────────────────────┐
│ HRIS         │ Статистика  [Лише перегляд]                                           (ФН ▾)      │
│ ▣ Статистика │ [Огляд] [Воронка] [Час] [Джерела] [Тімліди] [Рекрутери] [Бонуси] [Виплати]         │
│              │ Період [Жовтень 2026 ▾]  Вертикаль [Усі ▾]  Посада [▾]  Рекрутер [▾]  Тімлід [▾]    │
│              │                                              Оновлено сьогодні о 06:00 · [Експорт ▾] │
│              │ ┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐          │
│              │ │Додано    ││Передано  ││Співбесіди││Офери     ││Найнято   ││Пройшли ВТ│          │
│              │ │   312    ││   148    ││    96    ││    21    ││    17    ││    9     │          │
│              │ │ +12 % ↑  ││ −4 % ↓   ││          ││          ││          ││          │          │
│              │ └──────────┘└──────────┘└──────────┘└──────────┘└──────────┘└──────────┘          │
│              │ Воронка (chart, lazy)                    │ Причини відмов                          │
│              │ ████████████████ 312                     │ Профіль не підійшов тімліду   41 %     │
│              │ ████████ 148                             │ Співбесіду не пройдено        22 %     │
│              │ ...                                      │ ...                                     │
└──────────────┴────────────────────────────────────────────────────────────────────────────────────┘
```
- KPI deltas: text + arrow + colour (never colour alone).

## Бонуси tab (STAT-06)

```
│ [Бонуси]  Період [Q4 2026 ▾]  Вертикаль [Усі ▾]  Рекрутер [Усі ▾]          [Експорт CSV] [XLSX]  │
│ ┌───────────────────┬──────────┬──────────┬────────────┬───────────┬─────────────┐               │
│ │ Рекрутер          │Заплановано│Нараховано│Затверджено │ Виплачено │ Повернено   │               │
│ │ Оксана Кравець    │  2 100 $  │   375 $  │    0 $     │  1 250 $  │     0 $     │               │
│ │ Дмитро Лисенко    │    875 $  │     0 $  │  375 $     │    500 $  │  −150 $     │               │
│ │ Разом             │  2 975 $  │   375 $  │  375 $     │  1 750 $  │  −150 $     │               │
│ └───────────────────┴──────────┴──────────┴────────────┴───────────┴─────────────┘               │
│ Найближчі виплати                                                                                 │
│ Лист. 2026 ▓▓▓ 1 625 $ │ Груд. 2026 ▓▓ 875 $ │ Січ. 2027 ▓ 375 $   (expected-date calendar strip)  │
```
- Mixed currencies: one column group per currency, never auto-summed across currencies ⚠ OPEN-FN2 (reporting currency for totals?).

## Виплати tab (BONUS-13) — payout report

```
│ [Виплати]  Період виплати [Листопад 2026 ▾]  Групувати [Рекрутер ▾ | Вертикаль]  [Експорт CSV][XLSX]│
│ ┌──────────────────┬──────────┬─────────────────────────┬───────┬────────┬───────────┬───────────┐ │
│ │ Рекрутер         │ Вертикаль│ Кандидат                │ Транш │ Сума   │ Статус    │ Підстава  │ │
│ │ Оксана Кравець   │ Гемблінг │ Андрій Шевчук ⚠ OPEN-FN1│ 1·30% │  375 $ │Затверджено│ Старт ВТ  │ │
│ │ Дмитро Лисенко   │ Гемблінг │ Ольга Ткач              │ 2·70% │  875 $ │ Виплачено │ ВТ пройд. │ │
│ │ Дмитро Лисенко   │ Гемблінг │ Коригування             │   —   │ −150 $ │ Повернення│ Пішов на  │ │
│ │                  │          │                         │       │        │           │ 20-й день │ │
│ ├──────────────────┴──────────┴─────────────────────────┴───────┼────────┤           │           │ │
│ │ Разом до виплати                                               │ 1 100 $│           │           │ │
│ └────────────────────────────────────────────────────────────────┴────────┴───────────┴───────────┘ │
```
- No checkboxes, no «Позначити виплаченими» (Admin-only action is hidden, not disabled).
- Candidate cell is plain text (no link). Purged candidates show «Кандидат #1234 (видалено)».
- Export filename: `vyplaty-2026-11.xlsx`; export respects current filters; columns = table columns + currency + payout period.

## Mobile 390
- Tabs scroll horizontally; KPI tiles 2 per row; tables become stacked rows (recruiter + amount + status), horizontal scroll fallback for payout report; export in `[⋯]`.

## States
- Loading: tab bar real, KPI tiles skeleton, table 8 rows skeleton.
- No data: «За обраний період даних немає».
- Export in progress: button spinner → toast «Файл готовий» (download starts); error «Не вдалося сформувати файл» [Спробувати ще раз].
- Error per widget, others keep rendering.

## ⚠ OPEN
FN1 does Finance see candidate full names in payout report / "who brought whom" (PII minimisation) or only IDs? · FN2 totals across currencies (convert to reporting currency or per-currency subtotals).
