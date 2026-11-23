# Review — content read and F10-A foundations

Task: REVIEW-CONTENT-READ-F10A. Assigned specialist: code-reviewer, critical High. Baseline: `b0e7c3e` (CI `44474819422` green); scoped working-tree review. Contract: ADR-019 and the F10 row of `docs/ux/ui-foundation.md`. Source changes remain owned by the implementation engineers.

Status: **DONE**. Verdict: **APPROVED**.

## Blocking

None.

## Should fix

None.

## Nit

None raised; no unrelated style/refactor work requested under D126.

## Checks

- `server/repositories/vacancy.ts:162` uses one live, scoped PK SELECT. Documents, status, revision and correlated assignment IDs share its PostgreSQL statement snapshot. The typed boundary validates stored documents and identity facts; internal authorization facts do not enter the public DTO.
- `server/services/vacancy-content.ts:26` preserves `vacancyReadWhere` visibility, including private/cancelled drafts and readable closed rows. Capability requires OPEN/ON_HOLD plus the central permission union on those same row facts. Read-only callers receive documents with false; withheld GLOBAL grants are not borrowed. GET adds no vacancy transaction, lock, limiter, audit, event or change feed write.
- GET/PATCH schemas remain distinct; PATCH response/write authorization and existing detail/list DTOs are unchanged. Route/session/MFA/no-store behavior is inherited. The 25 read integration tests cover positive/negative roles, author/private/closed rows, mixed-role aal1, no business writes/bucket use, one SELECT, coherent concurrent revisions, next-read revocation and HTTP denials.
- `lib/queries/vacancy-content.ts:6` uses the canonical content subkey, zero stale/GC times, mount/focus/reconnect refetch, bounded server/network retries, AbortSignal and background same-origin fetch. No previous/placeholder data is supplied. Existing vacancy prefix invalidation reaches it. The RSC loader lowercases before request caching, calls the same service with `requireSession`, and maps only NotFound to null.
- `components/rich-text/rich-text-view.tsx:9` renders validated JSON through React text/semantic elements, retains whitespace/list starts, and emits no injected HTML. Duplicate links produce one anchor using the last validated href. Viewer imports no Tiptap runtime; its document import is type-only.
- `lib/rich-text-editor-document.ts:19` removes known editor-only attributes, splits long text at Unicode boundaries with marks/text retained, then uses the unchanged server schema. Invalid results preserve the original input reference and issues. NULL initialization remains an editor concern, distinct from a saved empty document. The adapter's Tiptap import is type-only.
- All fourteen direct Tiptap dependencies and lockfile entries are pinned to 3.34.0. No StarterKit/editor runtime was imported into an existing route. The actual pinned Editor round-trip test covers the supported formatting/list configuration; separate tests cover limits, rejected nodes/marks/links, invalid-state preservation and Unicode text.
- Generated OpenAPI documents the separate GET DTO/transport while retaining PATCH. File inspection confirmed exactly 12 source and 12 generated content GET cases with matching names, GET methods and no bodies. Four bounded read scripts assert revision/documents, readonly/closed capability and NULL; source/generated metadata remains coherent.

## Blast radius

**Safety facts:** content GET reads one coherent scoped snapshot without widening metadata DTOs or changing write behavior; F10-A adds no editor runtime to an existing route and does not change the stored rich-text schema.

**Proof:** the engineer's executed integration tests exercise the real repository/service, count one SQL SELECT, verify unchanged business/history/rate-limit rows after 31 reads, and check coherent revision/assignment outcomes plus revocation. Reviewer inspected those tests and source. Reviewer also ran a read-only Node probe against the installed Tiptap 3.34.0 schema: JSON round trip preserved the text and both duplicate link hrefs in order (**PASS**). The existing view test independently asserts one rendered anchor with the last href. This is a library-schema probe; it does not claim a browser/editor UI test.

**Cleared:** central authz/read scopes, private draft rules, PATCH/detail/list contracts, query invalidation ancestry, shared rich-text schema and runtime import separation. No migrations, notifications, new read policy or list-preview document prefetch.

**Boundaries:** these are preparatory foundations with no page/route UI integration. Future consumers must implement denial eviction, user-transition cleanup, successful-read initialization, dirty-state handling and lazy editor loading from ADR-019/F10. No screenshot, bundle-size, mounted-query revocation UX, paste toolbar or Newman runtime pass is claimed here. Separate security/QA reviews and current-head CI remain orchestrator gates.

## Validation evidence

- Engineer-reported GET checks, inspected against the actual tests: 8 unit files / **145 passed**; read plus existing write/race integration, 3 files / **58 passed** (25 read + 33 write/race); lint, formatting and generated artifacts passed.
- Engineer-reported F10-A checks: **17 unit tests passed**; ESLint/formatting and final global typecheck passed with both tasks present.
- Reviewer: source/contract/import and generated GET-case inspection; pinned-library duplicate-link probe passed. No integration, build, Playwright, typecheck or passing suite was duplicated. An initial optional `tsx` probe could not start in the sandbox (`uv_os_get_passwd`); the successful Node probe above used no temporary files.

## Self-check line

No new production mistake class found; no engineering self-check addition requested.
