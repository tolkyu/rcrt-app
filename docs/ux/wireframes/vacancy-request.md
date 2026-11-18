# Запросити вакансію — STORY-VAC-03-3 [VAC-03, VAC-08]

Sources: `docs/stories/phase-2.md`, PRD D86/D87/D90/D93/D94, `vacancy-form.md`, `design-system.md` §8, built form primitives. Skills: `emil-design-eng`, `animate` (+ button/popover/dialog recipes), `mobile-native`, `typescript-best-practices` for component inspection. Scope: the minimal Team Lead request; Ukrainian copy below goes through `messages/uk.json` (`vacancyRequest.*`; reuse shared field/common messages).

## Entry and result

- Route `/vacancies/request`. «Запросити вакансію» is a link in the vacancy list header and mobile `StickyActionBar`, and the eligible TL's first-ever empty state. Eligibility is an active accepted Team Lead role in at least one active vertical; do not infer it from the broader `vacancy.create` permission. Dual-role users retain their authorised full-create action and can explicitly choose the TL request action (D35).
- Direct access without eligibility uses the existing real 404 page, before loading request data. The position picker contains only active positions in verticals where the user is an eligible TL, including for dual-role users.
- Submit creates an `OPEN` vacancy immediately. Success opens `/vacancies/{id}` and announces «Вакансію створено». No draft, approval, confirmation-before-submit, title editor or assignment step. Do not promise that notifications were delivered (D93).

## Layout and fields

Use `FormPageLayout`, one form, body maximum width 720 px. No readiness rail for four fields. Heading «Запросити вакансію». Subtitle: «Вакансія одразу з’явиться в роботі рекрутерів. Поля з * обов’язкові.» Back link «До списку вакансій» uses the remembered list URL, with `/vacancies` fallback.

```text
‹ До списку вакансій
Запросити вакансію
Вакансія одразу з’явиться в роботі рекрутерів. Поля з * обов’язкові.

[Виправте … поля]                         only after invalid submit
Посада *
[Оберіть посаду                                             ▾]
Немає потрібної посади? Зверніться до адміністратора або керівника рекрутингу вашої вертикалі.
Вертикаль: Гемблінг                        derived from selection
Тімлід: Василь Петренко (ви)               session identity

Кількість місць *                         Терміновість вакансії
[1                     ]                 [Звичайна | Термінова]
Від 1 до 100.

Коментар (необов’язково)                                  0 / {max}
[Наприклад, потрібен досвід з Facebook Ads.                    ]
[                                                            ]
[                                                            ]

                      [Вийти без збереження] [Запросити вакансію]
```

| Field                    | Component and behaviour                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Посада                   | `FormField required` + `Combobox`, empty initial value. Option label = position name; `description` = vertical name, including when duplicate position names exist. Search includes both. The header's vertical filter must not hide other eligible TL verticals. No free-text creation or catalog-management CTA in this flow. |
| Вертикаль / Тімлід       | Plain labelled text, not disabled editable controls; no tab stops. Before selection: «Вертикаль: визначиться після вибору посади». After selection show the position's vertical. TL always current user «{name} (ви)». Neither is submitted as a user-editable choice.                                                          |
| Кількість місць          | Existing `Input`, text + `inputMode="numeric"`, initial `1`, integer 1–100 (`VACANCY_HEADCOUNT_MAX`). Hint «Від 1 до 100.»; invalid «Вкажіть ціле число від 1 до 100.» Do not clamp an invalid value silently.                                                                                                                  |
| Терміновість вакансії    | Existing native-radio `UrgencyControl` in `FormField layout="group"`; «Звичайна» selected, «Термінова» alternative. No TL routing-priority control.                                                                                                                                                                             |
| Коментар (необов’язково) | `Textarea` + `FormField.counter`, three-row minimum, grows to existing max height then scrolls. Plain multiline text; no formatting toolbar. Counter and schema use the same length rule/limit; over-limit paste stays visible and produces «Скоротіть коментар до {max} символів.» rather than truncation. Empty allowed.      |

**Comment contract:** maximum 5,000 characters (design limit confirmed with BA/orchestrator for this slice); optional plain multiline text. Add one shared request-schema limit for validation, counter and message interpolation. Persist as safe rich-text paragraph/text nodes preserving line breaks; never parse the entered text as HTML. At inspection the request schema/backend did not yet exist, so this is a new contract, not reuse of an existing comment limit.

Footer actions use existing `Button`: outline «Вийти без збереження» (D124), primary «Запросити вакансію», primary last. Keep the primary available for validation of an incomplete form; lock it during submission and while navigating after success. All form values remain visible. No secondary save action.

## States, validation and navigation

| State                                       | Behaviour / copy                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial loading                             | `FormSkeleton` with real heading and field geometry, delayed 150 ms, no shimmer; no editable form before route eligibility is established.                                                                                                                                                                    |
| Position loading                            | Existing async `Combobox` loading state; preserve input/focus and other form fields. Use scoped prefetched/cached options where available; do not fetch every readable vertical.                                                                                                                              |
| No catalog positions                        | Picker «Немає доступних посад» plus the persistent missing-position guidance above. Request remains invalid until a real active position is selected.                                                                                                                                                         |
| Search has no match                         | «Нічого не знайдено» plus the same guidance. Search text is not a selected position.                                                                                                                                                                                                                          |
| Picker fetch failed                         | Existing Combobox error + «Повторити», retry only options; retain form values.                                                                                                                                                                                                                                |
| Invalid submit                              | Validate with shared request schema. Existing `FormError` summary with links; focus first invalid control in DOM order, scroll with footer clearance. Field errors on blur; summary speaks once after submit (`announce=false` for duplicate field announcements). Required position: «Оберіть посаду.»       |
| Position deactivated or no longer available | Field error «Посада більше недоступна. Оберіть іншу.» Keep the shown previous value until user replaces it; refresh options, prevent resubmitting the invalid selection. Do not reveal whether it belongs to another vertical. Preserve comment/headcount/urgency.                                            |
| Sending                                     | Immediately lock mutation inputs while retaining focus (`readOnly` where supported), primary busy state «Створення…» with existing pending-button feedback; guard duplicate clicks and shortcut submits. Keep locked through successful navigation.                                                           |
| Network / 5xx                               | Error «Не вдалося створити вакансію. Спробуйте ще раз.» and «Повторити»; preserve all input. Retry the same submission with the same idempotency key; an edited payload is a new attempt. Reuse existing lazy feedback/toast infrastructure and stable toast id.                                              |
| 429 / access revoked                        | Existing translated rate-limit/access error; preserve input and show an actionable return link. Follow server retry timing; do not automatically submit again after access denial. Initial forbidden route remains 404.                                                                                       |
| Success                                     | Invalidate relevant vacancy list/detail caches, release leave guard with `guardRef.release()`, then `router.replace('/vacancies/{id}')`. Never programmatic push with the dirty guard still active.                                                                                                           |
| Leaving dirty form                          | Existing `FormPageLayout` handles links, browser Back and tab close. Reuse «Вийти без збереження?» / «Зміни у формі ще не збережено. Якщо вийти зараз, їх буде втрачено.»; safe action «Залишитися», destructive «Вийти без збереження». Clean initial values do not ask. Keep the guard after failed submit. |

## Keyboard, mobile and motion

- No field autofocus on entry (avoid opening phone keyboard). Natural Tab order: back → position → headcount → checked urgency radio → comment → footer. Keep shared combobox Arrow/Enter/Escape behaviour and focus in its input while selecting; radio arrows select urgency. Escape closes the picker, never leaves the page.
- Plain Enter in an input does not submit; Enter selects a picker option or activates a focused button. Enter in comment inserts a newline. Ctrl/⌘+Enter submits once, respecting IME composition and pending state, matching the full create form.
- At `< md`, every field is full width in source order, headcount then urgency. Footer cancel is full width above full-width primary using the existing action wrapping pattern; footer stays above BottomNav, safe-area padded, and publishes its measured height for toast offset. Do not mount the list's `StickyActionBar` on this form.
- Reuse 44 px touch targets, 16 px input/textarea text on phones, visible focus ring and field/error `aria-describedby`. Long position/vertical/TL names wrap without widening the page; no page horizontal scroll at 320 px / 200% zoom. Popup remains scrollable above the on-screen keyboard.
- No new motion: typing, validation, position-derived text and navigation update instantly. Shared pointer-opened combobox: 160/120 ms opacity/scale; leave dialog: 200/150 ms (mobile sheet 240/180 ms), existing `ease-out`/`ease-drawer`; keyboard-opened surfaces instant, reduced motion opacity-only. Shared press feedback 120 ms. Existing design-system tokens prevail.
- Real-device keyboard/safe-area/scroll check remains a hardware verification item; emulator screenshots cannot establish it.

## Implementation and review handoff

Reuse `FormPageLayout` / `FormSkeleton`, `FormField` / `FormError`, `Input`, `Textarea`, `Combobox` (`description`, `selectedOption`, async retry), `UrgencyControl`, `Button`, existing lazy feedback and leave dialog. Full-create `VacancyBasicsGroup`/`useVacancyPickers` are vertical-first and include unrelated fields: reuse their patterns, not the whole group or author eligibility logic.

D125/D126: screenshots once at the V-block boundary; new request form desktop light/dark + mobile light, changed TL list entry, and genuinely new visible error/empty states. Do not recapture unchanged leave dialog/shared picker. Worst-case text/320 px/200% zoom and retry/idempotency belong in assertions. One review round; only bugs, security/authz/PII or PRD mismatches block.
