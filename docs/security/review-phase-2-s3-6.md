# Security review: Phase 2 S3.6 (commit ebf00ae)

Scope: D123 author-only cancel reason; shared `FORBIDDEN_CHARS` / `hasVisibleChar` change (closes L1 of `review-phase-2-s3-5.md`). Date 2026-11-17.

**Verdict: PASS.** No Critical, High or Medium findings. No code changed. Two Low and one Info item.

## D123: cancel reason reaches only the author

| Check | Result | Evidence |
| --- | --- | --- |
| Foreign read gate runs first | PASS: `readVacancy` throws 404 before any reason query; a cancelled never-opened draft is visible only to `createdBy` who still authors in that vertical (Admin, Head Recruiter, TL, HR, same-vertical Recruiter get 404) | `server/authz/vacancy-scope.ts` `vacancyReadWhere` (cancelledArm), `server/services/vacancy.ts:146` |
| Reason query keyed on caller, not role | PASS: `actor_id = ctx.auth.userId` + `vacancyEventReadWhere` (draft events have `vertical_id null`, so they require `actor_id = me`) + `to = 'CANCELLED'` | `server/repositories/vacancy.ts` `findCancelReason`, called at `server/services/vacancy.ts:149` |
| Only never-opened cancelled drafts | PASS: `isNeverOpenedCancelled(status, openedAt === null)`; a vacancy cancelled after OPEN gets no reason; DRAFT and published never get one | `server/services/vacancy.ts:147`; test "never attaches a reason" |
| Cancel response | PASS: `cancelVacancyDraft` runs `readDraft` + `authorOf` + `lockDraft` (own draft only) before returning `cancelReason: reason`; value is the caller's own normalised input | `server/services/vacancy-draft.ts:441-461` |
| Lists / search / counts | PASS: list rows use `vacancySummarySchema` (no `cancelReason`); the field exists only on `vacancyDetailSchema`; no list or count path touches `entity_event_pii` | `lib/schemas/vacancy.ts:110` |
| Other routes returning `VacancyDetail` | PASS: PATCH, publish, create never set it (published test asserts `undefined`) | `server/services/vacancy.ts` |
| TanStack cache | PASS: key `['vacancy', id]` is not user-keyed but the client cache is per browser session; logout does `window.location.assign` (full navigation drops the cache); server `QueryClient` is per request | `components/shell/use-logout.ts`, `lib/query-keys.ts` |
| OpenAPI | PASS: optional `cancelReason` string, no example values, no reason text in the spec or Postman | `openapi/openapi.json` |
| Logs | PASS: route log entry holds only requestId, operationId, status, ms, userId; no body or response | `server/http/define-route.ts:87-94`, `server/http/route.ts` |
| HTTP caching | PASS: `Cache-Control: private, no-store` on API responses; routes `force-dynamic` | `server/http/define-route.ts:249` |
| Timing | PASS: foreign callers get the same 404 path as before; the extra query runs only after the read gate and only for the author's own cancelled drafts | `server/services/vacancy.ts:143-155` |
| Output encoding | PASS: rendered as React text (`whitespace-pre-line`), no HTML injection | `components/vacancies/vacancy-overview.tsx:175-188` |
| Purge / audit | PASS: reason stays in the purgeable `entity_event_pii` row; after purge `data->>'reason'` is null and the field disappears; no audit row (D92) | `findCancelReason` doc comment |
| Denied tests | PASS: `findCancelReason` for another user id, and for the author id under another user's read scope, returns null; Head Recruiter, Admin, Team Lead, HR readers get 404 via `getVacancyDetail`. Same-vertical Recruiter is covered by the stranger context. | `tests/integration/vacancies-draft-lifecycle.test.ts` (D123 tests) |

Run: `vacancies-draft-lifecycle.test.ts` 80 passed; unit `vacancy-author`, `position-name`, `reason-text`, `position-schema` all passed.

## Findings

| ID | Sev | Finding | Evidence | Fix |
| --- | --- | --- | --- | --- |
| L1 | Low | Blank-rendering code points that are neither `Cf` nor in the new filler list still pass: U+034F (combining grapheme joiner), U+17B4/U+17B5 (Khmer inherent vowels), U+180B-180D/U+180F and U+FE00-FE0F (variation selectors) when alone, U+FFFC. A title, position name or reason made only of these has length >= min yet looks empty. Cosmetic spoofing inside one organisation; no data exposure. The code comment already records why variation selectors were kept (emoji). | `lib/position-name.ts:6-13` | Optional: add U+034F and U+17B4/17B5 to `FILLERS`; for variation selectors require at least one char that is not `\p{M}`-only (extend `VISIBLE_CHAR` to `[^\s\p{Cf}\p{Mn}FILLERS]` on the "required" check). Not blocking. |
| L2 | Low | The `entity_event` raw-read guard allowlist now exempts the whole file `server/repositories/vacancy.ts`, so a later function there can read `entity_event` without the D92 predicate. Today `findCancelReason` takes `visible: SQL` and a user id, but a caller could pass `sql\`true\``. | `tests/unit/authz/vacancy-author.test.ts:398-399` | Move `findCancelReason` to a small dedicated repository file (allowlist that file only) or keep the file allowlist and require review for any new `entity_event` use in it. |
| I1 | Info | `hasVisibleChar` is used only by the client confirm dialog (`components/ui/confirm-dialog.tsx:77`) as a UX twin. Server enforcement is `hasOnlyVisibleChars` on title/location (`lib/schemas/vacancy.ts:167`), position name (`lib/schemas/position.ts:23`), reason (`lib/schemas/reason.ts` through `hasOnlyReasonChars`), rich-text text nodes and link hrefs (`lib/schemas/rich-text.ts:8,42`). All share the one `FORBIDDEN_CHARS`, so the filler list applies to all server inputs automatically. | see paths | None. |

## Closure of earlier items

- `review-phase-2-s3-5.md` L1 (blank filler characters): closed for U+2800, U+115F, U+1160, U+3164, U+FFA0 on every server schema (tests in `position-schema.test.ts`, `reason-text.test.ts`, `position-name.test.ts`). Residual blank-rendering code points are tracked as L1 above (Low).
