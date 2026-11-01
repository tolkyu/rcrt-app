# ADR-010 — Supabase credential verification

- Status: Accepted for the T4 credential slice; login/refresh/MFA flows remain separate work.
- Date: 2026-10-31
- References: ADR-002 DG-02/DG-05, SEC, PRD D22/D23/D63.

## Decision

| Concern        | Implementation                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity       | `server/auth/supabase-identity.ts` emits only validated `authUserId`, `sessionId`, `aal`                                                                                             |
| Cryptography   | `jose` ES256/RS256 only; required `kid`, `exp`, UUID `sub`/`session_id`, valid AAL; exact configured issuer and authenticated audience; `nbf` and at most 30 s skew                  |
| Key source     | Only `SUPABASE_URL/auth/v1/.well-known/jwks.json`; protected-header key URLs/inline keys rejected; no HS256 fallback                                                                 |
| Credentials    | Explicit Authorization takes precedence and fails closed; otherwise SDK-compatible Supabase cookie key, official SSR cookie/base64/chunk utilities, strict duplicate/gap/size checks |
| Cache          | One verifier per worker, 10 min JWKS cache, 30 s unknown-key cooldown, 5 s fetch timeout; trusted factory timing overrides support real HTTP tests                                   |
| Context        | API and RSC use the same verifier; verified identity retained internally, DB roles/active state/session ownership checked by the existing context query                              |
| Request limits | Unsafe API methods use a streamed 1,048,576-byte JSON limit; reject oversized declared/chunked/multibyte bodies with 413 `BODY_TOO_LARGE`, cancel input and return no submitted data |
| Configuration  | Startup validates public `SUPABASE_URL`; no publishable/secret key needed for JWT verification; standalone DB tools require only their DB configuration                              |

Owner confirmed recovery through a second TOTP or another Admin's reset. Mixed-role `aal1` users keep nonprivileged role grants. No authorization policy change is needed for these decisions.

## Validation and limits

Real ES256/RS256 signatures and a local HTTP JWKS fixture test validation, rotation/cache, outages/timeouts and cookie handling. PostgreSQL 17 integration tests verify signed identity → DB roles, session deletion and deactivation. The local Supabase public JWKS returned HTTP 200 with an ES256 key; no real session rows were read.

Removed signing keys may remain usable until JWKS cache refresh; database session revocation still applies on each request. Production cooldown/cache durations are library defaults, with shortened rotation timing in tests.

Magic-link/Google sign-in, cookie refresh, invite acceptance, TOTP setup/reset, 12 h idle/7 day absolute limits and auth/API rate limiting are pending. This ADR does not mark full T4 or Phase 1 complete.
