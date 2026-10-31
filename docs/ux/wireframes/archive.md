# Wireframe — Архів [ARCH-01..05, UI-04, VAC-05, §2.3]

One nav item «Архів», route `/archive/{rejected,deleted,closed}`, three tabs: **Відмови · Видалені · Закриті вакансії**. Tab state, filters and sort live in the URL. Terms per `glossary.md` (Reactivate = «Повернути в роботу»).

## Role × tab visibility

| Tab | Admin | Head Recruiter | Recruiter | Head HR | HR | Team Lead | Finance |
|---|---|---|---|---|---|---|---|
| Відмови | ✓ all | ✓ in vertical | ⚠ OPEN-S1 | ⚠ OPEN-S1 | ⚠ OPEN-S1 | ⚠ OPEN-S1 | — |
| Видалені | ✓ all · Відновити · Видалити назавжди | ✓ in vertical · Відновити | ⚠ OPEN-S1 | ⚠ OPEN-S1 | ⚠ OPEN-S1 | ⚠ OPEN-S1 | — |
| Закриті вакансії | ✓ all · Клонувати | ✓ in vertical · Клонувати | ⚠ OPEN-S1 | ⚠ OPEN-S1 | ⚠ OPEN-S1 | ⚠ OPEN-S1 | — |
| «Повернути в роботу» | ⚠ OPEN-S14 | ⚠ OPEN-S14 | ⚠ OPEN-S14 | — | — | — | — |

- A tab the user can't see is not rendered. If the user can see no tabs, the «Архів» nav item is hidden. Finance never sees it.
- Rows always obey the role × vertical scope (VIS-02). Tab counts are scoped counts, never global.

## Shared list mechanics
- TanStack Table + **TanStack Virtual**, row height 40 (desktop) / card 88 (mobile). **Cursor pagination**: infinite query, 50 rows per page, next page fetched when the user is 10 rows from the end. Default sort is «Коли» (desc); the sortable columns are only those backed by an index.
- Filters (FilterBar, URL-synced): chips + «Скинути»; saved filters are supported. The counter shows «50+» until the last page is reached; there is no full count query.
- Row click opens the card (read-only banner for deleted objects). Actions live in the row `⋯` menu and in a sticky bulk bar where bulk is allowed.

---

## Tab 1 — Відмови

```
┌──────────┬─────────────────────────────────────────────────────────────────────────────────────────┐
│ ▢ Головна│ Архів                                                                                   │
│ ▢ Вакансії│ [Відмови 50+] [Видалені 12] [Закриті вакансії 31]                                       │
│ ▢ Кандидати│ Вертикаль [Гемблінг ▾] Причина [▾] Етап [▾] Рекрутер [▾] Тімлід [▾] Період [Останні 90 дн.▾]│
│ ▢ Календар│ [ ] Показати проміжні «Передано далі»                                    [Скинути]       │
│ ▢ Статистика│ ⓘ 14 кандидатів пропонується видалити назавжди (24 міс. без оновлення згоди). [Переглянути]│ ← Admin only (ARCH-04)
│ ▣ Архів   │ ┌──────────────────┬───────────────────────┬──────────────┬─────────────────────────┬──────────────┬─────────┬───┐│
│          │ │ Кандидат         │ Вакансія / посада      │ Етап         │ Причина                 │ Хто          │ Коли    │   ││
│          │ ├──────────────────┼───────────────────────┼──────────────┼─────────────────────────┼──────────────┼─────────┼───┤│
│          │ │ Марія Кравчук    │ Медіабаєр — Facebook   │[● У тімліда] │ Профіль не підійшов     │ Тарас Коваль │ 13.11   │ ⋯ ││
│          │ │ ⇢ Василь → Тарас │ Тарас Коваль           │              │ тімліду · «Мало досвіду │ (ТЛ)         │         │   ││
│          │ │                  │                        │              │ з TikTok»               │              │         │   ││
│          │ │ Дмитро Савчук    │ Медіабаєр — Facebook   │[● Поліграф]  │ Поліграф не пройдено    │ Олена Гриценко│ 10.11  │ ⋯ ││
│          │ │ Ірина Бойко      │ Арбітражник — Google   │[● Офер]      │ Кандидат відхилив офер  │ Наталія Іван.│ 02.11   │ ⋯ ││
│          │ │ Олег Мороз       │ Медіабаєр — Facebook   │[Самовідвід]  │ «Прийняв інший офер»    │ Оксана Крав. │ 28.10   │ ⋯ ││
│          │ │ Андрій Лукʼянов  │ Медіабаєр — Facebook   │[Не пройшов ВТ]│ Інше · «Порушення…»    │ Василь Петр. │ 21.10   │ ⋯ ││
│          │ └──────────────────┴───────────────────────┴──────────────┴─────────────────────────┴──────────────┴─────────┴───┘│
└──────────┴─────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Rows** are terminal applications (`REJECTED`, `WITHDRAWN`, `PROBATION_FAILED`). «Етап» = the stage at which the application ended, as a StageChip. For WITHDRAWN and PROBATION_FAILED the chip shows the terminal status.
- **Routed-chain indicator** «⇢ Василь → Тарас» sits under the name; its tooltip lists each hop with date and reason. Intermediate `REJECTED (routed)` applications, where the candidate is still active elsewhere, are hidden by default. The checkbox «Показати проміжні «Передано далі»» reveals them, greyed, with the chip «Передано далі». This only changes what is displayed; the data is unchanged.
- The reason comment is shown in full with a 2-line clamp; full text in the tooltip and on the card. Reason `OTHER` always has a comment.
- **Row menu:** «Відкрити картку» · «Повернути в роботу».
- «Повернути в роботу» is disabled with a reason when the candidate already has an active application in that routing group: «Кандидат уже має активну кандидатуру на цю посаду» (ROUTE-06).

### Dialog — Повернути в роботу
```
┌ Повернути в роботу: Марія Кравчук ────────────────────────────────┐
│ Буде створено нову кандидатуру; попередня історія збережеться.     │
│                                                                    │
│ Куди подати *                                                      │
│ (•) На посаду  [Медіабаєр — Facebook ▾]                            │
│     → Буде передано: Марина Савчук · П2                            │  server routing preview
│     ⓘ Пропущено: Василь Петренко, Тарас Коваль — відмовили          │  ROUTE-07 (180 дн.)
│       протягом останніх 180 дн.                                    │
│ ( ) На вакансію [Оберіть вакансію ▾]  (лише відкриті, у вашому доступі)│
│ ( ) У кадровий резерв (без вакансії)                               │
│ Коментар  [……………………………………]                                       │
│                                       [Скасувати] [Повернути в роботу]│
└────────────────────────────────────────────────────────────────────┘
```
- If no vacancy is available: «Немає відкритих вакансій для цієї посади» and the submit button is disabled; the «У кадровий резерв» option stays available.
- Choosing a vacancy whose TL rejected the candidate within 180 days → warning «Тімлід відмовив цьому кандидату 13.11.2026» (allowed when submitting directly to a vacancy, ROUTE-08).
- Start stage of the new application: ⚠ OPEN-A4.
- Success toast: «Кандидатуру створено» [Відкрити]. The row stays in the archive, because the old application is history.

### States — Відмови
- **Loading:** filter bar is real; 10 skeleton rows at real column widths; tab counts as grey pills.
- **Empty (no data):** «Архів відмов порожній. Сюди потрапляють кандидатури зі статусом «Відмова», «Самовідвід» або «Не пройшов ВТ».»
- **Empty (filters):** «Нічого не знайдено за фільтрами» [Скинути фільтри].
- **Error:** inline «Не вдалося завантажити архів.» [Спробувати ще раз]; tabs stay usable. If a next page fails, the error appears as the list footer with retry and the loaded rows are kept.

---

## Tab 2 — Видалені

**Decision: one list with a type switch `[Усі · Кандидати · Вакансії]` (default «Усі»), not two sub-lists.** Why:
- The columns and actions are identical.
- Head Recruiter and Admin review deletions as one chronological stream, which suits audits.
- One cursor-paginated query with a `type` filter needs one index.
- The «Тип» column plus an icon keeps the rows distinguishable.

```
┌──────────┬─────────────────────────────────────────────────────────────────────────────────────────┐
│ ▣ Архів   │ [Відмови 50+] [Видалені 12] [Закриті вакансії 31]                                       │
│          │ [Усі 12 | Кандидати 9 | Вакансії 3]   Вертикаль [▾] Хто видалив [▾] Період [▾]           │
│          │ [ ] Показати знищені (анонімні записи)  ← Admin only, ⚠ OPEN-A6                          │
│          │ ┌───┬──────────────────────┬──────────┬──────────┬────────────────┬─────────┬───────────────────────┬───┐│
│          │ │[ ]│ Назва                │ Тип      │ Вертикаль│ Хто видалив    │ Коли    │ Причина видалення     │   ││
│          │ ├───┼──────────────────────┼──────────┼──────────┼────────────────┼─────────┼───────────────────────┼───┤│
│          │ │[ ]│ (👤) Сергій Ткаченко │ Кандидат │ Гемблінг │ Оксана Кравець │ 21.11   │ Створено помилково —  │ ⋯ ││
│          │ │   │                      │          │          │                │         │ дубль з LinkedIn      │   ││
│          │ │[ ]│ (▤) Арбітражник —    │ Вакансія │ Гемблінг │ Ірина Головко  │ 18.11   │ Запит скасовано       │ ⋯ ││
│          │ │   │ Google (#198)        │          │          │ (Кер. рекр.)   │         │ тімлідом              │   ││
│          │ │[ ]│ (👤) Кандидат #1187  │ Кандидат │ Крипто   │ Адміністратор  │ 02.09   │ Запит на видалення    │   ││
│          │ │   │ (видалено) [Знищено] │          │          │                │         │ даних (GDPR)          │   ││
│          │ └───┴──────────────────────┴──────────┴──────────┴────────────────┴─────────┴───────────────────────┴───┘│
│          │ Вибрано 2   [Відновити (2)]  [Видалити назавжди (2)] ← Admin                              │
└──────────┴─────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Row menu:** «Відкрити (лише перегляд)» · «Відновити» (Admin, Head Recruiter in vertical) · separator · «Видалити назавжди» (Admin, red). Actions the role can never do are hidden.
- Bulk checkboxes appear only for roles that have at least one bulk action.
- Purge of a **vacancy** (it holds no personal data): ⚠ OPEN-A1. Until that is answered, «Видалити назавжди» is shown for candidates only.

### Dialog — Відновити (AlertDialog, non-destructive primary)
```
┌ Відновити кандидата «Сергій Ткаченко»? ───────────────────────────┐
│ Картка повернеться в списки з усією історією, резюме та файлами.   │
│ Відповідальний рекрутер: Оксана Кравець.                           │
│ ⚠ Знайдено можливий дублікат: Сергій Ткаченко (активний) [Відкрити]│ ← dedupe check, ⚠ OPEN-A3
│                                         [Скасувати] [Відновити]    │
└────────────────────────────────────────────────────────────────────┘
```
- **Vacancy variant:** «Вакансія повернеться в списки з усією історією. Кандидати, яких під час видалення перенесли в резерв, на іншу вакансію або відмовили, автоматично не повертаються.» The status after restore is ⚠ OPEN-A2.
- **Candidate variant:** what happens to the applications that were active at deletion is ⚠ OPEN-F11. The dialog shows that line once the answer is in.
- Success: toast «Відновлено» [Відкрити], row removed from the list (optimistic, rollback on error).

### Dialog — Видалити назавжди (Admin, AlertDialog, destructive)
```
┌ Видалити назавжди «Сергій Ткаченко»? ─────────────────────────────┐
│ Персональні дані та файли буде знищено безповоротно: ПІБ, контакти,│
│ резюме, вкладення, коментарі з персональними даними.               │
│ Для статистики та бонусів залишиться анонімний запис               │
│ «Кандидат #1234 (видалено)». Нараховані бонуси не зміняться.       │
│ Цю дію неможливо скасувати.                                        │
│                                                                    │
│ Щоб підтвердити, введіть ВИДАЛИТИ                                  │
│ [                    ]                                             │
│                              [Скасувати] [Видалити назавжди ▒]     │  enabled only on exact match
└────────────────────────────────────────────────────────────────────┘
```
- Focus starts on «Скасувати». The match is case-sensitive and trimmed. Bulk purge uses the same dialog with «Видалити назавжди 3 кандидатів?» and the list of names.
- Whether purged comments are removed entirely or only redacted: ⚠ OPEN-C2.

### Purged stub state (card opened from Статистика / Бонуси / «Показати знищені»)
```
┌───────────────────────────────────────────────────────────────────────────┐
│ (#) Кандидат #1234 (видалено)                         [Знищено 02.09.2026] │
│ Персональні дані видалено на запит (GDPR). Картка лише для статистики.     │
│ Вертикаль: Крипто                                                          │
│ ✓ Створено ─ ✓ В роботі ─ ✓ Співбесіда ─ ✖ Поліграф                        │  stages + dates only
│ 02.06       03.06        10.06          15.06 · Поліграф не пройдено       │
│ Бонуси: Транш 1 · Скасовано                                                │  (bonus-visible roles)
└───────────────────────────────────────────────────────────────────────────┘
```
- No contacts, no CV pane, no comments tab, no actions. Actor names stay visible (staff, not the candidate's personal data); exact content ⚠ OPEN-C2.
- In reports and tables the name cell reads «Кандидат #1234 (видалено)» in muted italics, with no link.

### States — Видалені
- **Loading:** type switch and filters are real; 8 skeleton rows.
- **Empty:** «Видалених карток немає.»; on the Вакансії switch: «Видалених вакансій немає.»
- **Empty (filters):** «Нічого не знайдено за фільтрами» [Скинути фільтри].
- **Error:** inline retry. If restore or purge fails: toast «Не вдалося відновити — спробуйте ще раз», and the row returns.
- **409** (already restored or purged by someone else): «Картку вже змінив інший користувач. Список оновлено.»

---

## Tab 3 — Закриті вакансії

```
┌──────────┬─────────────────────────────────────────────────────────────────────────────────────────┐
│ ▣ Архів   │ [Відмови 50+] [Видалені 12] [Закриті вакансії 31]                                       │
│          │ Статус [Усі | Заповнена | Скасована]  Вертикаль [▾] Посада [▾] Тімлід [▾] Період закриття [▾]│
│          │ ┌──────────────────────────┬───────────┬──────────┬──────────┬──────────────┬──────────┬──────────┬───┐│
│          │ │ Вакансія                 │ Тімлід    │ Статус   │ Найнято  │ Воронка      │ Відкрита │ Закрита  │   ││
│          │ ├──────────────────────────┼───────────┼──────────┼──────────┼──────────────┼──────────┼──────────┼───┤│
│          │ │ Медіабаєр — Facebook #187│ Василь П. │[Заповнена]│ 2 з 2   │ ▅▃▂▂▁▁▁ 23   │ 41 дн.   │ 20.10    │ ⋯ ││
│          │ │ Медіабаєр — TikTok #176  │ Тарас К.  │[Скасована]│ 0 з 1   │ ▃▂▁ 7        │ 18 дн.   │ 05.10    │ ⋯ ││
│          │ └──────────────────────────┴───────────┴──────────┴──────────┴──────────────┴──────────┴──────────┴───┘│
└──────────┴─────────────────────────────────────────────────────────────────────────────────────────┘
```
- «Воронка» = final FunnelMini: counts per stage the applications reached, plus total. «Відкрита» = days from open to close.
- Row click opens the vacancy card in read-only mode (full pipeline, history) with the banner «Вакансію закрито 20.10.2026 — Заповнена» [Клонувати].
- **Row menu:** «Відкрити» · «Клонувати» · «Відкрити знову» (Head Recruiter, FILLED only; VAC-02).

### Dialog — Клонувати вакансію (VAC-05)
```
┌ Клонувати «Медіабаєр — Facebook #187» ────────────────────────────┐
│ Буде створено нову вакансію з тими самими полями. Її можна         │
│ відредагувати перед публікацією.                                   │
│ Тімлід     [Василь Петренко ▾]   Кількість місць [ 1 ]             │
│ [✓] Імпортувати кандидатів-пропозиції                              │
│     Кандидати з відмовою на цій вакансії зʼявляться в новій         │
│     вакансії як пропозиції — без створення кандидатур.              │
│     [✓] Марія Кравчук · Профіль не підійшов тімліду                │
│     [ ] Олег Мороз · Самовідвід                                    │
│     [—] Дмитро Савчук · Поліграф не пройдено (недоступно)  ⚠ OPEN-A7│
│                                   [Скасувати] [Клонувати і відкрити]│
└────────────────────────────────────────────────────────────────────┘
```
- The list is collapsed until the checkbox is ticked; nothing is preselected (⚠ OPEN-A7). Purged and deleted candidates are excluded.
- On submit the user goes to the new vacancy's edit form, which shows the block «Пропозиції (N)».

### States — Закриті вакансії
- **Loading:** 8 skeleton rows; FunnelMini placeholders at final width.
- **Empty:** «Закритих вакансій ще немає.»
- **Empty (filters):** «Нічого не знайдено за фільтрами» [Скинути фільтри].
- **Error:** inline retry.

---

## ARCH-03 — deleting a vacancy with active applications
Drawn in `vacancy-card.md` → «Delete dialog (ARCH-03)» (options: move to talent pool / another vacancy / reject with reason, plus mandatory delete reason). The result lands in this tab: «Видалені» with type «Вакансія».

## Mobile 390
```
┌──────────────────────────────┐
│ Архів                        │
│ [Відмови][Видалені][Закриті] │  segmented, scrollable
│ [Фільтри (2)]  [Сортування ▾]│  filters open bottom sheet
├──────────────────────────────┤
│ Марія Кравчук            [⋯] │
│ Медіабаєр — Facebook         │
│ [● У тімліда] · 13.11        │
│ Профіль не підійшов тімліду  │
│ ⇢ Василь → Тарас             │
├──────────────────────────────┤
│ …                            │
└──────────────────────────────┘
```
- Rows become cards (88 px, virtualized); actions go in `⋯` → bottom sheet. The type-to-confirm purge dialog becomes a full-height sheet with the keyboard open.
- No bulk selection on mobile; Admin does bulk work on desktop.

## ⚠ OPEN (new)
- **A1** Does purge apply to deleted vacancies (no personal data), or is it candidates only?
- **A2** What status does a restored vacancy get (previous status / ON_HOLD / OPEN)?
- **A3** Dedupe check on candidate restore: warn only, or block?
- **A4** Start stage of an application created by «Повернути в роботу» (NEW?).
- **A6** Are purged stubs listed in «Видалені» (Admin-only filter), or reachable only from statistics/bonus reports?
- **A7** VAC-05 "rejected-but-good" criteria: which reasons are importable (e.g. exclude «Поліграф не пройдено»)?

Existing items referenced here: S1 (tab visibility for Rec/HHR/HR/TL), S14 (who reactivates), F11 (candidate delete with active applications), C2 (purged-stub content).
