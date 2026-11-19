# User flows (Phase 0)

> Mermaid. Ukrainian strings in nodes are the actual UI copy (see `glossary.md`). Dialog IDs (D-xx) from `screens.md` §4.
> Legend: rounded = screen/state, rectangle = user action, rhombus = system/validation, `⚠` = OPEN.

## F-1 Submit candidate → routing [ROUTE-01..09, CAND-03]

```mermaid
flowchart TD
  A(["Картка кандидата / Резерв"]) --> B["Рекрутер: «Подати на посаду» або «Додати до вакансії»"]
  B --> C{"Ціль?"}
  C -- "Посада" --> D{"Є активна кандидатура в цій групі розподілу?"}
  D -- "Так" --> D1["Блок: «Кандидат уже в роботі у цій групі» + посилання"]
  D -- "Ні" --> E["Сервер: routing() — відкриті вакансії групи, пропуск Призупинених / Заповнених / Скасованих та тімлідів з відмовою < 180 дн."]
  E --> F{"Знайдено вакансію?"}
  F -- "Ні" --> F1["Діалог: «Немає відкритих вакансій для цієї посади». Залишити в резерві"]
  F -- "Так" --> G["Підтвердження: «Буде передано: Василь Петренко · П0 · Медіабаєр — Facebook»"]
  G --> H(["Кандидатура створена · етап «Новий» · подія в Історії"])
  C -- "Конкретна вакансія" --> H2(["Кандидатура створена на обрану вакансію (без розподілу, ROUTE-08)"])

  H --> R1["… скринінг → «Передати тімліду» → «У тімліда»"]
  R1 --> R2{"Тімлід відхилив або співбесіду не пройдено?"}
  R2 -- "Ні" --> OK(["Далі по воронці"])
  R2 -- "Так" --> R3{"Подано через посаду і автоматичний розподіл увімкнено?"}
  R3 -- "Так" --> R4{"Є наступна вакансія в групі?"}
  R4 -- "Так" --> R5["Нова кандидатура на наступну вакансію; стара = «Передано далі». Сповіщення рекрутеру + наступному тімліду. Історія: «Передано від Василя → Тарасу»"]
  R4 -- "Ні" --> R6(["Архів → Відмови з останньою причиною (ROUTE-04)"])
  R3 -- "Ні: пряме подання (ROUTE-08)" --> R7["Задача рекрутеру: «Запропонувати наступному тімліду?» Так / Ні"]
  R3 -- "Ні: розподіл вимкнено (ROUTE-09)" --> R8["Задача рекрутеру: «Оберіть наступного тімліда» — список вакансій групи"]
  R7 -- "Ні" --> R6
  R8 -- "Не обирати" --> R6
```

- Routing preview in G and in reject dialog D-17 is rendered from the same server function (no client logic).
- ⚠ OPEN-F1: stage of the re-routed application (NEW / IN_WORK / SUBMITTED_TO_TL). Flow assumes **SUBMITTED_TO_TL** (screening already done; next TL is notified per ROUTE-03).
- ⚠ OPEN-F2: does routing apply when the candidate is added to a Position at NEW, or only at «Передати тімліду»? Flow assumes at creation (ROUTE-02 wording).

## F-2 TL accept / decline (mobile-first) [PIPE §6.1 st.3, ROUTE-03]

```mermaid
flowchart TD
  N(["Сповіщення / Мої задачі: «Розгляньте кандидата»"]) --> C(["Картка кандидата: підсумок рекрутера, резюме, очікування"])
  C --> A["Прийняти"]
  C --> D["Відхилити"]
  A --> A1["Оптимістично: чип «Прийнято тімлідом». Toast «Рекрутера повідомлено»"]
  A1 --> A2(["Задача рекрутеру: «Тімлід прийняв — призначте співбесіду»"])
  D --> D1["Bottom sheet: причина (за замовч. «Профіль не підійшов тімліду») + коментар; «Інше» → коментар обовʼязковий"]
  D1 --> D2{"Що буде далі (превʼю з сервера)"}
  D2 -- "є наступний тімлід" --> D3["Текст у діалозі: «Кандидата буде передано: Тарас Коваль · П1»"]
  D2 -- "немає" --> D4["Текст: «Кандидата буде перенесено в Архів → Відмови»"]
  D3 --> S["Підтвердити"]
  D4 --> S
  S --> E(["Картка зникає з дошки тімліда · Undo 5 с ⚠ OPEN-F3"])
```

- Mobile: sticky bottom action bar `[Відхилити] [Прийняти]` (equal width, 48 px). Accept is one tap, no dialog.

## F-3 Schedule interview — Meet link mandatory [PIPE-04, D-01/D-04]

```mermaid
flowchart TD
  S1["Перетягнути на «Співбесіда» / кнопка «Призначити співбесіду» / Перемістити до…"] --> G{"Тімлід прийняв?"}
  G -- "Ні" --> X["Drop заборонено: колонка підсвічена сірим, tooltip «Спершу тімлід має прийняти кандидата»"]
  G -- "Так" --> D["Діалог: Посилання Google Meet · Дата · Час (Київ) · Тривалість · Тімлід (заповнено)"]
  D --> V{"MeetLinkInput: відповідає https://meet.google.com/xxx-xxxx-xxx ?"}
  V -- "Ні" --> V1["Помилка під полем: «Вставте посилання у форматі https://meet.google.com/abc-defg-hij»; кнопка «Призначити» неактивна"]
  V1 --> D
  V -- "Так" --> T{"Дата в майбутньому?"}
  T -- "Ні" --> T1["«Оберіть час у майбутньому»"]
  T1 --> D
  T -- "Так" --> OK["Призначити → оптимістичний перехід картки, toast «Співбесіду призначено. Запрошення надіслано»"]
  OK --> R(["Календар + нагадування за 24 год і 1 год рекрутеру, тімліду, кандидату (D7)"])
  D --> C["Скасувати / Esc → картка повертається в попередню колонку"]
```

- Same MeetLinkInput for the screening call (D-01, NEW → IN_WORK).
- ⚠ OPEN-F4: interview duration field — not in PRD; proposal: default 45 хв, optional.
- ⚠ OPEN-F5: paste of a link with query (`?authuser=0`) — strip automatically or reject? Proposal: strip and show normalized value.

## F-4 TL reschedule → recruiter confirm [RESCH-01..04]

```mermaid
sequenceDiagram
  autonumber
  actor TL as Тімлід (телефон)
  participant App as HRIS
  actor R as Рекрутер
  TL->>App: Картка / Календар → «Перенести»
  App-->>TL: Sheet: 1–3 варіанти часу (мін. 1) + коментар
  TL->>App: Надіслати запит
  App-->>TL: Співбесіда «Очікує перенесення»
  App->>R: Задача «Запит на перенесення співбесіди» + сповіщення
  R->>App: Відкрити D-07
  alt Підходить один із варіантів
    R->>App: Обрати варіант (+ за потреби нове посилання Meet)
    App-->>TL: «Час підтверджено: 14.11.2026, 15:30»
    App-->>R: Статус «Призначено», нагадування перераховано
  else Жоден не підходить
    R->>App: «Запропонувати інший час» (1–3 варіанти)
    App->>TL: Задача «Відповідь на перенесення»
    TL->>App: Обрати варіант або знову запропонувати
  end
  opt Тімлід вдруге відмовляє по цьому кандидату (RESCH-03)
    App->>App: Сповістити керівника рекрутингу ⚠ OPEN-F6
  end
```

- Old slot stays visible struck-through until confirmation; Meet link stays valid unless replaced.
- ⚠ OPEN-F6: RESCH-03 "declining the interview request a second time" — means 2nd reschedule request or 2nd decline of the candidate? Copy and trigger depend on it.
- ⚠ OPEN-F7: can the recruiter initiate a reschedule (candidate asked)? Not in PRD; flow covers TL-initiated only.

## F-5 Polygraph schedule + PDF upload [POLY-01..05, PIPE-03]

```mermaid
flowchart TD
  P0(["Співбесіда «Пройдено» → система: етап «Поліграф»"]) --> P1{"HR-менеджера призначено?"}
  P1 -- "Ні" --> P2["Задача Кер. HR: «Призначте HR-менеджера на поліграф» або HR: «Взяти собі»"]
  P2 --> P3
  P1 -- "Так" --> P3["HR: «Призначити поліграф» → Місце (список або адреса) + Дата/час — обидва обовʼязкові"]
  P3 --> P4(["Кандидату — лист з деталями; рекрутеру — сповіщення. Задача HR «Завантажте висновок поліграфа» після часу сесії"])
  P4 --> P5["HR: «Внести результат»"]
  P5 --> P6["Dropzone: лише PDF ≤ 15 МБ"]
  P6 --> V{"Файл валідний?"}
  V -- "Ні" --> V1["«Потрібен PDF-файл до 15 МБ»"]
  V1 --> P6
  V -- "Так" --> P7["Прогрес завантаження → «Висновок завантажено»; радіо Пройдено / Не пройдено стає активним"]
  P7 --> O{"Результат"}
  O -- "Пройдено" --> O1(["Етап «Офер». Задача Кер. HR «Створіть офер»"])
  O -- "Не пройдено" --> O2(["Відмова «Поліграф не пройдено» → Архів → Відмови (без розподілу, ROUTE-05)"])
```

- Before upload, «Зберегти результат» disabled with tooltip «Спершу завантажте висновок (PDF)» [POLY-03].
- Recruiter/TL see only «Поліграф · Пройдено/Не пройдено»; PDF row hidden (not disabled) [POLY-04].
- If POLY-05 enabled: after HR result → «Очікує перевірки керівником HR» before the stage changes.

## F-6 Head HR offer create / send [OFFER-01..04, BONUS-02]

```mermaid
flowchart TD
  A(["Етап «Офер»"]) --> B{"Роль"}
  B -- "HR" --> C["«Створити чернетку оферу»: сума, валюта, брутто/нетто, період, дата виходу, ВТ (заповнено, ≤ 90), умови"]
  C --> C1(["Чернетка збережена. «Надіслати» неактивна: tooltip «Надіслати офер може лише керівник HR». Задача Кер. HR «Надішліть офер»"])
  B -- "Кер. HR" --> D["Створити / відкрити чернетку"]
  C1 --> D
  D --> E["«Переглянути лист» → PDF з шаблону (lazy), редагування тексту"]
  E --> F["«Надіслати офер» → підтвердження: «Лист отримає: o.kovalenko@gmail.com. Дійсний до 19.11.2026»"]
  F --> G(["Надіслано · статус доставки: Надіслано → Доставлено / Не доставлено"])
  G --> H{"Відповідь кандидата (вносить Кер. HR / HR)"}
  H -- "Прийнято + дата виходу" --> I(["Бонус зафіксовано (snapshot). Задача HR «Підтвердіть перший робочий день»"])
  H -- "Відхилено + причина" --> J["Кер. HR: «Переглянути умови» → нова версія оферу (PIPE-06/OFFER-04) або «Відмовити» → Архів"]
  H -- "Термін минув (5 дн.)" --> J
  G -- "Не доставлено" --> K["Банер «Лист не доставлено» + «Надіслати повторно» / виправити email"]
```

- Version list «Версія 1 · надіслано 14.11», «Версія 2 · чернетка»; older versions read-only.
- ⚠ OPEN-F8: is a "Expired" offer auto-set by job at validity end, or recorded manually?

## F-7 Probation early close (locked before day 30) [PROB-01..05, BONUS-06]

```mermaid
flowchart TD
  A(["Картка: «Випробування · День 18 з 90 · залишилось 72 дн.»"]) --> R{"Роль"}
  R -- "Тімлід" --> T{"Минуло ≥ 30 днів?"}
  T -- "Ні" --> T1["Кнопка «Завершити достроково» неактивна. Tooltip / підпис на телефоні: «Дострокове завершення доступне з 30-го дня — з 14.11.2026»"]
  T -- "Так" --> T2["Sheet: «Підтвердити проходження випробувального терміну?» + коментар (необов.)"]
  R -- "Кер. HR / Адмін" --> H{"Минуло ≥ 30 днів?"}
  H -- "Так" --> T2
  H -- "Ні" --> H1["«Завершити з винятком» → коментар обовʼязковий, попередження «Ви завершуєте раніше 30-го дня»"]
  T2 --> D(["Етап «Найнято». Транш 2 → «Нараховано» сьогодні (BONUS-06)"])
  H1 --> D
  R -- "Тімлід / Кер. HR" --> F["«Не пройдено» (доступно з 1-го дня) → причина обовʼязкова"]
  F --> F1(["«ВТ не пройдено» → Архів → Відмови. Транш 2 → «Скасовано»; транш 1 → за правилом повернення"])
```

- No UI anywhere allows a later end date: date pickers for end date have `max = current end` [PROB-05, D10].
- On a phone the disabled reason is shown as visible helper text under the button (tooltips do not work on touch).
- ⚠ OPEN-F9: day counting — is the start date day 1 or day 0? Defines when "≥ 30 days elapsed" unlocks. Copy always shows the exact unlock date computed server-side.
- ⚠ OPEN-F10: can HR (not Head HR) close probation as passed/failed? §2.3 lets HR move Probation; §6.1 lists TL / Head HR only. Flow assumes HR only confirms first day.

## F-8 Bonus lifecycle view [BONUS §9.3, BONUS-04..14]

```mermaid
stateDiagram-v2
  direction LR
  [*] --> PLANNED: Офер прийнято (snapshot)
  PLANNED --> ELIGIBLE: Тригер настав (старт ВТ / проходження / N дн.)
  PLANNED --> CANCELLED: ВТ не пройдено / пішов до min днів
  ELIGIBLE --> APPROVED: Кер. рекрутингу / Адмін «Затвердити»
  ELIGIBLE --> ON_HOLD: «Призупинити» (спір)
  ON_HOLD --> ELIGIBLE: «Зняти з паузи»
  APPROVED --> PAID: Адмін «Позначити виплаченим» + період
  PAID --> CLAWBACK_PENDING: Пішов у межах правила повернення
  CLAWBACK_PENDING --> CLAWED_BACK: Утримано в наступному звіті
```

UI labels: Заплановано → Нараховано → Затверджено → Виплачено; side: Скасовано, Призупинено, Очікує повернення, Повернено.

```mermaid
flowchart LR
  subgraph SR["Рекрутер"]
    R1(["Статистика → Бонуси (Мої бонуси)"]) --> R2["Рядок траншу: сума, статус, очікувана дата"] --> R3["«Чому?» → картка кандидата, вкладка «Бонус»: схема, база, курс, множник, розподіл"]
  end
  subgraph SH["Керівник рекрутингу"]
    H1(["Бонуси · фільтр «Нараховано»"]) --> H2["Вибрати рядки → «Затвердити (N)»"] --> H3["Підтвердження: сума разом, кількість"]
  end
  subgraph SA["Адмін"]
    A1(["Виплати · період"]) --> A2["«Позначити виплаченими (N)» → період «Листопад 2026»"] --> A3["Коригування +/− з причиною — окремий рядок"]
  end
  subgraph SF["Фінансист"]
    F1(["Статистика → Виплати"]) --> F2["Лише перегляд + Експорт CSV/XLSX"]
  end
```

- Amount tooltip: «Зафіксовано 19.11.2026 за схемою «Стандартна 30/70»; курс 1 $ = 41,20 ₴».
- Expected date only moves earlier; if it moved, show «Раніше: 17.02.2027» struck-through.

## F-9 Delete vs reject → archives [ARCH-01..05, PIPE §6.1, D13]

```mermaid
flowchart TD
  M["Меню «⋯» на картці"] --> Q{"Дія"}
  Q -- "Відмовити (кандидатура)" --> RJ["D-17: причина + коментар. Тіло: «Кандидатуру буде завершено зі статусом «Відмова» і перенесено в Архів → Відмови. Звідти її можна повернути в роботу.» + превʼю розподілу"]
  RJ --> RA(["Архів → Відмови · «Повернути в роботу» створює нову кандидатуру"])
  Q -- "Видалити (кандидат / вакансія)" --> P{"Дозволено?"}
  P -- "Рекрутер, етап ≥ Співбесіда" --> PX["Пункт неактивний: «Рекрутер може видалити кандидата лише до співбесіди з тімлідом. Зверніться до керівника рекрутингу.»"]
  P -- "Так" --> V{"Вакансія з активними кандидатурами?"}
  V -- "Так" --> V1["D-18: для кожної групи — «У кадровий резерв» / «На іншу вакансію» / «Відмовити з причиною» (ARCH-03)"]
  V -- "Ні" --> DL["D-18: причина видалення (обовʼязкова). Тіло: «Картку буде приховано з усіх списків і перенесено в Архів → Видалені. Відновити її може адміністратор або керівник рекрутингу.» Кнопка червона «Видалити»"]
  V1 --> DL
  DL --> DA(["Архів → Видалені"])
  DA --> RS["«Відновити» (Адмін, Кер. рекрутингу)"]
  DA --> PG["«Видалити назавжди» (Адмін) → ввести «ВИДАЛИТИ». «Персональні дані та файли буде знищено безповоротно…»"]
  PG --> ST(["Анонімний запис «Кандидат #1234 (видалено)»"])
```

- Destructive buttons: red, never default-focused; focus lands on «Скасувати».
- Archive screens and dialogs (Відновити, Видалити назавжди, Повернути в роботу, purged stub): `wireframes/archive.md`.
- ⚠ OPEN-F11: deleting a candidate who has active applications — are applications closed (how, which status) or hidden with the candidate?

## ⚠ OPEN (flows)

F1 re-routed application start stage · F2 routing moment (NEW vs submit) · F3 undo window for TL decline (UX proposal, needs ok since decline triggers routing + notifications) · F4 interview duration · F5 Meet link normalisation · F6 RESCH-03 meaning · F7 recruiter-initiated reschedule · F8 offer expiry auto vs manual · F9 probation day counting · F10 HR probation close rights · F11 deleting candidate with active applications.
