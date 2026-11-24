# ADR-005 — File storage & signed URLs

- **Status:** Accepted
- **Date:** 2026-10-30
- **PRD:** CAND-01/04, POLY-03/04, OFFER-02/04, SEC (files), ARCH-04, `CLAUDE.md` §3.8

## Context

- CVs (PDF/DOC/DOCX ≤ 10 MB, versions kept), polygraph PDFs (PDF ≤ 15 MB, restricted), generated offer letters, card attachments.
- Files must never be public; access only after an authz check; big files must not pass through serverless functions.

## Options

| Option                                                                                                             | Pros                              | Cons                                           |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------- |
| **A. Supabase Storage private buckets, signed upload URL + server-side finalize, short-lived signed download URL** | No proxying, managed, same region | Signed upload URL TTL fixed by Supabase (~2 h) |
| B. Proxy uploads/downloads through route handlers                                                                  | Full control                      | Function body limits (4.5 MB), slow, costly    |
| C. S3 + presigned POST                                                                                             | Fine-grained policies             | Extra vendor/keys                              |

## Decision

**A.**

### Buckets (all private, bucket-level `file_size_limit` + `allowed_mime_types` as a second gate)

| Bucket       | Content                                                                    | Limit | MIME                         |
| ------------ | -------------------------------------------------------------------------- | ----- | ---------------------------- |
| `cv`         | Candidate CV versions                                                      | 10 MB | pdf, msword, docx            |
| `polygraph`  | Polygraph result                                                           | 15 MB | pdf                          |
| `offer`      | Generated offer letters (server upload)                                    | 5 MB  | pdf                          |
| `attachment` | Other card attachments ⚠ OPEN (types/limit not in PRD; default = CV rules) | 10 MB | pdf, msword, docx, png, jpeg |

### Storage access policies (DG-03)

- **Zero** `storage.objects` / `storage.buckets` RLS policies for `anon` and `authenticated`: browsers can only use URLs our server signed. All storage calls from the server use the service key.
- Test (CI, local Supabase): with a real user JWT and the anon key, list/read/upload/update/delete on every bucket must fail.

### Object key

`{bucket}/{vertical_id}/{file_object.id}` — no user-controlled path segments, no filenames (filenames are PII). Original filename, size, MIME, sha256 stored on `file_object`.

### Upload flow

1. `POST /api/v1/files/upload-intents` `{ purpose, entityType, entityId, filename, size, mime }` → scoped fetch of parent entity (404) → `can(ctx, '<purpose>.upload', parent)` (403) → validate extension + declared MIME + size → insert `file_object(status='PENDING', uploaded_by = me)` → `createSignedUploadUrl(key, { upsert: false })` (an existing object can never be overwritten, DG-12) → return `{ fileId, uploadUrl }`. Rate-limited (DG-09).
2. Browser uploads directly to Storage.
3. `POST /api/v1/files/{fileId}/complete` → allowed **only** for a `PENDING` row whose `uploaded_by` = caller (else 404; replay of a completed row → 409) → server reads object metadata (real size, etag) and ranged bytes → content checks (DG-12):
   - PDF: starts with `%PDF-`.
   - DOCX: `PK\x03\x04`, then a ranged read of the zip **central directory**: must contain `[Content_Types].xml` and `word/document.xml`; **reject if `vbaProject.bin` is present** (macro document renamed to .docx); reject entry counts/uncompressed sizes beyond sane limits (zip bomb).
   - DOC: `D0 CF 11 E0`.
   - Attachments PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`.
     → OK: `status='READY'`, size + etag + sha256 recorded, link to owner row (`candidate_file` new version / `polygraph.result_file_id`), `entity_event` `*.file_uploaded`; fail: delete object, `status='REJECTED'`, 400 `FILE_CONTENT_MISMATCH`.
4. `scan_status` column (`NOT_SCANNED` in v1) reserved for Phase 7 antivirus.

### Download / preview flow

- `GET /api/v1/files/{fileId}/url?disposition=inline|attachment` → load `file_object` → load parent with read scope (404) → file-class permission (`candidate.file.read`, `polygraph.file.read`, `offer.read`) (404 for polygraph files when not permitted, so existence is not confirmed) → current object size/etag re-checked against the READY record (mismatch → 409, file quarantined) → `createSignedUrl(key, 60 s, { download })` → `{ url, expiresAt }`. Minted on click only; rate-limited (DG-09).
- Audit log entry for every polygraph PDF and CV URL issued (DG-21 volume alerts).
- **Inline preview is PDF only** (DG-12): lazy-loaded pdf.js **≥ 4.2.67** (CVE-2024-4367) with `isEvalSupported: false` and `enableScripting: false`; bytes fetched into memory and rendered to canvas. CSP: storage host only in `connect-src` (and `worker-src 'self' blob:` for the pdf.js worker); **no `frame-src`** for the storage host — files are never iframed.
- DOC/DOCX are always `disposition=attachment` with a "file not virus-scanned" warning until Phase 7 AV. ⚠ OWNER (O-06): accept this, PDF-only until AV, or bring AV forward.

### Server-generated files

- Offer letter: `@react-pdf/renderer` (Cyrillic font embedded, ADR-009) → uploaded with the service key → `file_object` + `offer.letter_file_id`. Each offer version keeps its own file (OFFER-04).

### Lifecycle

- Soft delete of a candidate/vacancy: files untouched; URL issuance follows the archive permissions (`archive.deleted.read`).
- Purge (ARCH-04): storage objects deleted, `file_object` row kept as stub (`status='PURGED'`, filename/sha256 nulled) for referential integrity.
- Abandoned `PENDING` > 24 h removed by `files-cleanup` (ADR-004).
- Service-role key exists only in server env; browser never gets it.

## Hot path & budget

- Upload intent / URL issuance: 1 scoped query + 1 Storage API call (same region) — target < 120 ms. Bytes never touch Vercel.

## Consequences

- (+) Large files bypass functions; no public objects; every URL issuance is authorized and audited.
- (−) Supabase signed upload URL lifetime cannot be shortened below its fixed TTL → mitigated: the URL is bound to one random key, `complete` validates content, unfinished uploads are cleaned up.
- (−) Signed download URLs are bearer links for 60 s → acceptable; never logged.
