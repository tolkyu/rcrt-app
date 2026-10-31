# Wireframe — Головна (Dashboard) [UI-01, UI-02, PROB-07]

## Desktop 1440 — Recruiter (recruiter1.gambling@demo)

```
┌──────────┬───────────────────────────────────────────────────────────────────────────────────────────┐
│ HRIS     │ [Пошук кандидатів і вакансій…  Ctrl K]                         [+ Кандидат] (🔔3) (ОК▾) │
│          ├───────────────────────────────────────────────────────────────────────────────────────────┤
│ ▣ Головна│ Головна                                                                                   │
│ ▢ Вакансії│ Фільтри: [Вертикаль: Гемблінг ▾][Тімлід ▾][Посада ▾][Етап ▾][Пріоритет ▾][Період ▾]       │
│ ▢ Кандидати│         Збережені: (Мої термінові) (Facebook-баєри) [+ Зберегти фільтр]   [Скинути]      │
│ ▢ Календар│ ┌─ Мої задачі (5) ─────────────────┐ ┌─ Вакансії (4) ──────────── [Сітка|Канбан] ───────┐│
│ ▢ Статистика│ │ ● Запит на перенесення співбесіди│ │┌───────────────────────┐┌───────────────────────┐ ││
│ ▢ Архів   │ │   Олег Бондар · Тімлід: Василь П. │ ││Медіабаєр — Facebook   ││Медіабаєр — Facebook   │ ││
│          │ │   2 варіанти часу · 10 хв тому  [›]│ ││[Термінова] (П0)       ││(П1)                    │ ││
│          │ │ ● Тімлід прийняв — призначте      │ ││Василь Петренко        ││Тарас Коваль            │ ││
│          │ │   співбесіду · Ірина Мельник  [›] │ ││▁▃▅▂▁▁▁ 14 канд.       ││▁▂▁▁▁▁▁ 5 канд.         │ ││
│          │ │ ● Додайте посилання Meet          │ ││0 з 2 найнято · 12 дн. ││0 з 1 · 6 дн.           │ ││
│          │ │   Скринінг завтра 11:00       [›] │ │└───────────────────────┘└───────────────────────┘ ││
│          │ │ ○ Випробування закінчується       │ │  … (2 more cards)                                ││
│          │ │   Андрій Шевчук · 7 дн.       [›] │ └───────────────────────────────────────────────────┘│
│          │ │ [Показати всі]                    │                                                       │
│          │ └───────────────────────────────────┘                                                       │
│          │ Кандидати                                                    [Канбан|Список]  [Згорнути]   │
│          │ ┌Новий 3─┐┌В роботі 5┐┌У тімліда 4┐┌Співбесіда 3┐┌Поліграф 2┐┌Офер 1──┐┌Випробування 4┐ │
│          │ │┌──────┐││┌───────┐ ││┌────────┐ ││┌─────────┐ ││┌───────┐ ││┌──────┐││┌────────────┐│ │
│          │ ││Ірина ││││Олег Б.│ │││Марія К.│ │││Ольга Т. │ │││Дмитро │ │││Юлія ││││Андрій Шевч.││ │
│          │ ││Мельник│││Скринінг│ │││(Прийнято││││14.11 15:30│││Поліграф││││Офер ││││Випробування││ │
│          │ ││FB-баєр││││зав.11:00│││тімлідом)│││Очікує    │ │││17.11  │ │││надісл.│││· 55 дн.    ││ │
│          │ ││(ОК) 2д││││(ОК) 1д│ │││(ОК) 3г │ │││перенес.  │ │││(ОК)   │ │││(ОК) │││▓▓▓▓░░░ 35/90││ │
│          │ │└──────┘││└───────┘ ││└────────┘ ││└─────────┘ ││└───────┘ ││└──────┘││└────────────┘│ │
│          │ └────────┘└──────────┘└───────────┘└────────────┘└──────────┘└────────┘└──────────────┘ │
└──────────┴───────────────────────────────────────────────────────────────────────────────────────────┘
```

### Kanban card anatomy (UI-02)
```
┌──────────────────────────────┐
│ Ірина Мельник       [З бота] │  name (2 lines max, ellipsis; full in title attr)
│ Медіабаєр — Facebook · Василь│  vacancy · TL (muted, 1 line)
│ [● Співбесіда] 14.11, 15:30  │  StageChip + stage-specific fact (time / «Очікує перенесення» / days left)
│ (ОК)                  2 год  │  owner avatar · last activity (relative)
└──────────────────────────────┘   width 220–260, min-height 88, gap 8
```
- Stage-specific line: IN_WORK «Скринінг 13.11, 11:00» or warning «Немає посилання Meet»; SUBMITTED «Очікує рішення» / «Прийнято тімлідом»; TL_INTERVIEW time or «Очікує перенесення»; POLYGRAPH «Не призначено» / date / «Очікує висновку»; OFFER «Чернетка» / «Надіслано 14.11» / «Не доставлено»; PROBATION ProbationProgress compact.

### Drag & drop rules
- On drag start, columns compute allowed targets from the card's `allowedTransitions` (already in the card payload). Allowed: dashed primary outline. Forbidden: 50% opacity + `not-allowed` cursor; hovering shows reason chip (e.g. «Спершу тімлід має прийняти кандидата»).
- Drop on allowed column that needs data → dialog (D-01/D-02/D-04…); card renders as ghost in target until submit; cancel → animates back.
- Drop with no required data → optimistic move immediately.
- Reject/withdraw drop zone appears at bottom while dragging: `[Відмовити] [Самовідвід]` (only if allowed).
- Keyboard: focus card → `Space` pick up, arrows move between columns, `Space` drop, `Esc` cancel (dnd-kit announcements in Ukrainian); or `m` → «Перемістити до…» menu listing allowed targets only, forbidden targets listed disabled with reason.
- Column header: name + count; collapsed columns (width 44, vertical label) remembered per user.
- Long columns: virtualized; header shows «+ 120 ще» link to filtered list.

## Role differences

| Role | My tasks | Vacancies block | Candidate board |
|---|---|---|---|
| Admin | bonuses to pay, retention purge proposals | all, filter by vertical | all 7 columns, force move in menu |
| Head Recruiter | approve bonuses, reassign, RESCH-03 alerts, probation endings | vertical | all 7 columns, DnD all allowed; «Повернути на попередній етап» in menu |
| Recruiter | see table in `screens.md` S-03 | assigned + unassigned («Без рекрутера» badge) | own; DnD up to Поліграф |
| Head HR | assign HR, create/send offers, offer outcomes, probation endings | read-only | Поліграф · Офер · Випробування |
| HR | polygraphs to schedule, PDFs to upload, first day, offer outcomes | read-only | Поліграф · Офер · Випробування |
| Team Lead | accept/decline, interview results, reschedule answers, probation endings | own vacancies; «Запросити вакансію» | У тімліда · Співбесіда · Поліграф · Офер · Випробування; buttons on cards, no free DnD (⚠ OPEN-S6) |
| Finance | — (no dashboard; lands on Статистика) | — | — |

## Mobile 390 — Team Lead (vasyl.tl@demo)

```
┌──────────────────────────────┐
│ HRIS            (🔔2) (ВП)   │
│ [Задачі 3][Вакансії][Кандидати]│  segmented tabs, sticky
├──────────────────────────────┤
│ Розгляньте кандидата         │
│ ┌──────────────────────────┐ │
│ │ Ірина Мельник            │ │
│ │ Медіабаєр — Facebook     │ │
│ │ «4 роки FB, ROI 140%…»   │ │  recruiter summary, 2 lines
│ │ Рекрутер: Оксана К. · 1 год│
│ │ [ Відхилити ] [ Прийняти ]│ │  48 px, equal width
│ └──────────────────────────┘ │
│ Внесіть результат співбесіди │
│ ┌──────────────────────────┐ │
│ │ Ольга Ткач · сьогодні 15:30│
│ │ [Відкрити Meet ↗]         │ │
│ │ [Перенести] [Результат]   │ │
│ └──────────────────────────┘ │
│ Завершіть випробувальний     │
│ ┌──────────────────────────┐ │
│ │ Андрій Шевчук            │ │
│ │ ▓▓▓▓▓░░░░ День 35 з 90   │ │
│ │ [Не пройдено] [Завершити]│ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ Головна Кандидати Календар Ще│  bottom bar, 56 px + safe area
└──────────────────────────────┘
```
- Mobile «Кандидати» tab: horizontal stage chips (scrollable) select one stage → vertical list of cards; «Перемістити до…» via card menu (no DnD on touch).

## States
- **Loading:** skeleton — 3 task rows (avatar circle + 2 lines), 4 vacancy cards, 7 columns × 3 card blocks; same dimensions as final (CLS < 0.05).
- **Empty tasks:** «Усе зроблено. Нових задач немає.» (check icon, muted).
- **Empty board:** Rec «Додайте першого кандидата» [+ Кандидат]; TL «Поки що немає кандидатів на ваші вакансії»; HR «Немає кандидатів на етапі поліграфа».
- **Filtered empty:** «Нічого не знайдено за фільтрами» [Скинути фільтри].
- **Error (per block):** «Не вдалося завантажити задачі.» [Спробувати ще раз]; other blocks keep working.
