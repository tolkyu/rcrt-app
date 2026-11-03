# Phase 1 — Foundation · User stories

> Scope (PRD §15): repo, CI, envs, auth, users, invites, verticals, role assignments, authorization module + tests, audit log, design system shell, seed data, screenshots.
> UI labels follow `docs/ux/glossary.md`; screens follow `docs/ux/screens.md` (S-01, S-02, S-14, S-16, S-18).
> `(Dxx)` = owner-confirmed decision in PRD §14. Phase 1 product questions were answered by the owner on 2026-10-31. Infrastructure discrepancy Q-142 (Supabase PostgreSQL version) was subsequently found during implementation; see `docs/OPEN_QUESTIONS.md`.
> Enabler stories (no PRD ID) use the prefix `FND`. Updated with owner decisions of 2026-10-31.

## Conventions used in all stories

| Item | Rule |
|---|---|
| Out-of-scope / forbidden object | API returns 404 (not 403); UI shows «Сторінку не знайдено або доступ обмежено.» (VIS-01/02) |
| Admin-only endpoints | Any non-Admin caller → 404; never reveals existence |
| Concurrency | Every editable record carries a version; stale write → 409, UI toast «Дані вже змінено іншим користувачем. Оновили сторінку.» (copy to be added to glossary) |
| Time | Stored UTC, shown Europe/Kyiv for everyone, `dd.MM.yyyy, HH:mm` (D26) |
| Email normalisation | Trim + lowercase; uniqueness on normalised value |
| Audit | Every write → audit record (AUD) + business event (`entity_event`) where an entity timeline exists |
| Verticals | Never deactivated or deleted (D34) — no read-only-vertical states exist |
| Paid services | None during development; Supabase Pro / Vercel Pro only before launch, Phase 7 (D17) |
| Statistics | No Phase 1 story affects statistics |

---

## 1. Enablers

### STORY-FND-1: Repository and one-command local setup
As a **developer**, I want to clone the repo and run one command to get a working app with a seeded database, so that every agent works on an identical environment.

**Acceptance criteria**
- Given a clean machine with the documented prerequisites, When I run `pnpm setup` then `pnpm dev`, Then the app opens locally with migrations applied and Phase 1 seed loaded.
- Given `.env.example`, When a required variable is missing, Then startup fails with a message naming the variable (no secret values printed).
- (negative) Given a production build, When any seed or dev-only script is invoked against a non-local database, Then it refuses to run.

**Data / validation:** `.env.example` lists every variable with purpose; no secrets committed.
**Events / notifications:** none.
**Edge cases:** Windows and macOS paths; re-running setup is idempotent (no duplicate seed rows).

### STORY-FND-2: CI pipeline with quality gates
As the **Tech Lead**, I want every pull request checked automatically, so that broken code never reaches main.

**Acceptance criteria**
- Given a PR, When CI runs, Then lint, typecheck, unit/integration tests, E2E, API (Newman), secret scan (gitleaks, free) and perf checks (bundle size, Lighthouse on Phase 1 screens) all run; any failure blocks merge.
- Given screenshots changed, When CI runs, Then the screenshot gallery is produced as a build artefact.
- (negative) Given a commit containing a secret pattern or a `.env` file, When CI runs, Then it fails.

**Edge cases:** flaky E2E → retried once, then fails (no silent pass).
**Budgets (PERF-03, D14):** desktop LCP < 1.2 s, INP < 100 ms, CLS < 0.05; mobile 4G-throttled LCP < 2.5 s, INP < 200 ms, CLS < 0.1.

### STORY-FND-3: Environments, region and observability
As the **Tech Lead**, I want local, preview and production environments in Frankfurt with error tracking that never captures PII, so that the app is fast for Ukraine and safe.

**Acceptance criteria**
- Given production, When deployed, Then app functions run in fra1 and the database in eu-central-1 (PERF-06).
- Given an error containing an email, phone or salary, When sent to error tracking or logs, Then those values are scrubbed (SEC).
- Given scheduled jobs on the free hosting tier, Then they are triggered by a free external scheduler until Vercel Pro is bought (D17).
- (negative) Given a preview environment, When someone tries to log in with the dev-login route, Then it does not exist (see STORY-DEV-1).

**Owner decisions:** no paid services; perf runs on local PostgreSQL 17 in Docker (D62) with the PERF-01 seed (D15, D17). Nightly encrypted backups (30 days) are set up by Phase 7 (D17).

### STORY-FND-4: API contract and Postman collection
As a **QA engineer**, I want every `/api/v1` endpoint described in OpenAPI and exercised by a generated Postman collection, so that the API is testable outside the UI (API-xx).

**Acceptance criteria**
- Given Phase 1 endpoints (auth session, me, users, invites, verticals, role assignments, TL priorities, audit, login history), When `pnpm api:openapi` and `pnpm api:postman` run, Then the spec and collection include all of them with request/response schemas.
- Given the collection, When Newman runs in CI as Admin and as a non-Admin, Then allowed calls succeed and Admin-only calls return 404 for non-Admins.
- (negative) Given an invalid payload, When sent, Then 400 with field-level errors; no partial writes.

### STORY-FND-5: Security baseline
As the **security engineer**, I want rate limits, CSRF protection, strict CSP and input validation on every endpoint, so that the foundation is safe by default (SEC).

**Acceptance criteria**
- Given 10 login-link requests for one email within 15 min (exact limits set by security-engineer), When the next request arrives, Then it is throttled with a neutral message; the response never reveals whether the email exists. Limits are enforced by the app/database (no paid WAF in development, D17).
- No CAPTCHA on sign-in — access is invite-only (D37).
- Given a state-changing request without a valid CSRF protection, When received, Then rejected.
- (negative) Given an inline script injected into any page, When rendered, Then CSP blocks it.

---

## 2. Authentication

### STORY-SEC-AUTH-1: Sign in with a magic link
As an **invited, active user** in any vertical, I want to sign in with a link sent to my email, so that I don't need a password.

**Acceptance criteria**
- Given an active user, When they enter their email on «Вхід» and click «Надіслати посилання для входу», Then an email in Ukrainian arrives and the screen shows «Перевірте пошту — посилання дійсне 15 хв» (D23).
- Given the link, When opened within its lifetime for the first time, Then the user is signed in and lands on their role landing page (STORY-UI-04-1).
- (negative) Given an email that is unknown, deactivated or only has a pending invite, When a link is requested, Then the screen shows the same neutral message and no email is sent (no account enumeration).
- (negative) Given a used or expired link, When opened, Then sign-in fails with «Посилання недійсне або прострочене. Запросіть нове.»
- (negative) Given an eligible active user and a token-issue or email-delivery failure, Then show «Не вдалося надіслати лист. Спробуйте пізніше.» (`503 AUTH_EMAIL_DELIVERY_FAILED`); record a sanitized failed attempt. The owner confirmed this exception to uniform responses and response timing (D68).

**Data:** email. **Validation:** email format; normalised; rate limit (STORY-FND-5); no CAPTCHA (D37).
**Events:** `auth.login_succeeded` / `auth.login_failed` (method = magic link) into login history (AUD).
**Edge cases:** two links requested — only the latest is valid; user deactivated after link sent → link rejected; link opened on a different device → allowed (single use); Resend free-tier daily cap reached → sign-in email failure is logged and shown as «Не вдалося надіслати лист. Спробуйте пізніше.» (D17).

### STORY-SEC-AUTH-2: Sign in with Google
As an **invited, active user**, I want «Увійти через Google», so that I sign in with one click.

**Acceptance criteria**
- Given an active user whose Google account email equals their invited email, When they choose Google, Then they are signed in (D33). No domain restriction in v1.
- (negative) Given a Google account whose email is not an active user, When used, Then sign-in is refused with the neutral message; no user is created (ROLE-05 no self-signup).
- (negative) Given an active user signing in with a Google account under a different email, Then sign-in is refused (D33).

**Events:** `auth.login_succeeded` / `auth.login_failed` (method = Google).
**Edge cases:** Google email differs only by case → matches; Google alias/plus-address → does not match; ex-employee keeps the Gmail account → blocked once deactivated (ROLE-05).

### STORY-SEC-AUTH-3: Mandatory TOTP for Admin and Finance
As an **Admin or Фінансист**, I want a second factor on every sign-in, so that the accounts with the widest access are protected (SEC, D22).

**Acceptance criteria**
- Given a user holding `ADMIN` or `FINANCE` without TOTP, When they sign in (magic link or Google), Then they must complete TOTP enrolment (QR + code) before using grants from these roles. They may enrol a second TOTP factor for recovery; no recovery codes are issued (owner-confirmed D22).
- Given an enrolled Admin/Finance user, When they sign in to use those grants, Then a 6-digit code from an enrolled TOTP factor is required.
- Given a user lost their device, When an Admin chooses «Скинути 2FA» with a reason, Then the user must re-enrol at next sign-in.
- All other roles may optionally enable TOTP in «Профіль».
- (negative) Given a user at `aal1`, When they access an action requiring their Admin/Finance grant, Then 401 `MFA_REQUIRED`. Other role assignments remain usable; e.g. Admin + Recruiter may use Recruiter pages/APIs until completing MFA (owner-confirmed D63).
- (negative) An Admin cannot reset their own 2FA — another Admin must.

**Events:** `user.mfa_enrolled`, `auth.mfa_challenge_failed`, `user.mfa_reset` (actor, target, reason).
**Notifications:** email to the affected user on `user.mfa_reset`.
**Edge cases:** ADMIN or FINANCE role granted to a signed-in user → those grants require TOTP on the next request; other grants remain usable. Five wrong codes → temporary lock. Lost device → use the second enrolled TOTP or reset by another Admin; keep at least 2 Admins before launch (ADR-002).

### STORY-SEC-AUTH-4: Session timeout, sign-out and revocation
As a **user**, I want my session to end after 12 h of inactivity and immediately when I am deactivated, so that unattended devices don't expose candidate data.

**Acceptance criteria**
- Given no activity for 12 h, When the user acts, Then they are returned to «Вхід» and, after sign-in, to the page they were on (D23).
- Given an absolute session age of 7 days, When reached, Then re-sign-in is required regardless of activity (D23).
- Until Supabase Pro is bought (Phase 7, D17), idle and absolute limits are enforced by the app itself; behaviour is identical.
- Given «Вийти», When clicked, Then the current session ends; «Профіль → Активні сесії → Завершити всі інші» ends the others.
- (negative) Given a user deactivated by Admin, When their next request arrives (any device), Then it is rejected and the session ends (≤ 1 min).

**Events:** `auth.logged_out`, `auth.session_revoked` (reason: idle / absolute / deactivated / user).
**Edge cases:** DST change (Kyiv, last Sunday of October/March) → timeouts are absolute hours, unaffected; multiple tabs → activity in any tab counts.

### STORY-DEV-1: Development-only login
As a **developer or QA**, I want to sign in as any seeded user without email, so that I can test roles quickly.

**Acceptance criteria**
- Given `NODE_ENV=development`, When I open the dev login page, Then I see seeded users with their roles and can sign in as one (TOTP not required for seeded Admin/Finance in development only).
- (negative) Given any other environment (test against prod build, preview, production), When the route is requested, Then 404, and the route is absent from the production build.
- (negative) Given development but a non-seed user, Then they are not listed.

**Events:** login history records method = dev.

---

## 3. Users and invites

### STORY-ROLE-05-1: Invite a user
As an **Admin**, I want to invite a person by email with their roles, so that only people I choose get access.

**Acceptance criteria**
- Given «Налаштування → Користувачі та ролі», When I click «Запросити», enter full name, email and at least one role@vertical, Then an invite email in Ukrainian is sent and the user appears with status «Запрошено» and expiry date (D33).
- Given the invite, Then it expires exactly 72 h after sending (ROLE-05).
- (negative) Given a non-Admin (any role, any vertical, including Head Recruiter), When they call the invite endpoint or open the page, Then 404 (D33).
- (negative) Given an email of an active user or a pending invite, When I invite, Then «Користувач з таким email уже існує» / «Запрошення вже надіслано»; for a deactivated user the dialog offers «Активувати знову» instead (D42, D44).

**Data:** full name (required, 2–100 chars), email, roles[] (role + vertical or global).
**Validation:** role rules from STORY-ROLE-01-1.
**Notifications:** invite email (link valid 72 h).
**Events:** `user.invited` (roles listed) on the user timeline + audit.
**Edge cases:** two Admins invite the same email at the same moment → one succeeds, the other gets the duplicate message; email bounce → status shows «Не доставлено» (delivery status from email provider).

### STORY-ROLE-05-2: Accept an invite
As an **invited person**, I want to open the link and get in, so that I can start working.

**Acceptance criteria**
- Given a valid invite, When opened, Then «Прийняти запрошення» shows my name and role@vertical list (read-only) and lets me continue via magic link or Google; after first sign-in my status becomes «Активний».
- Given my invite includes `ADMIN` or `FINANCE`, Then TOTP enrolment follows (STORY-SEC-AUTH-3).
- (negative) Given the invite is expired, revoked or already used, When opened, Then «Запрошення прострочене (72 год). Попросіть адміністратора надіслати нове.» (revoked/used: «Запрошення недійсне.»).
- (negative) Given I sign in with Google using a different email than invited, Then acceptance is refused (D33).

**Events:** `user.invite_accepted`, `user.activated`.
**Edge cases:** invite opened at 71 h 59 min and completed at 72 h 01 min → expiry is checked at acceptance, refused; Admin revokes while the person is on the page → acceptance refused; roles removed after the invite was sent → acceptance uses current roles; if none remain, acceptance refused with «Запрошення недійсне».

### STORY-ROLE-05-3: Resend, revoke and track invites
As an **Admin**, I want to resend or revoke invites, so that I control pending access (D42).

**Acceptance criteria**
- Given a pending or expired invite, When I click «Надіслати повторно», Then a new 72 h link is sent and the previous link stops working.
- Given a pending invite, When I click «Відкликати», Then the link stops working and status becomes «Відкликано».
- (negative) Non-Admin → 404. Revoking an already accepted invite is not offered.

**Events:** `user.invite_resent`, `user.invite_revoked`.
**Edge cases:** resend and accept at the same moment → whichever commits first wins; the other gets a clear error.

### STORY-ROLE-05-7: Change the email of a not-yet-activated user
As an **Admin**, I want to correct the email of a person who has not accepted their invite yet, so that a typo does not force me to create the user again (ROLE-05, D44, D69).

**Acceptance criteria**
- Given an active user who has never activated, with status «Запрошено» (pending or expired) or «Відкликано», When I open the user card → `⋯` → «Змінити email», enter the new address and confirm, Then in one step: the email is replaced, the current link (if any) stops working, a new 72 h invite with the user's current roles is sent to the new address, and the status becomes «Запрошено» with a new «Діє до» (D69, D70).
- Given the change succeeded, Then list and card show the new email; search finds the user by the new email only; the old address is free for a new invite.
- Given the email provider fails after the change, Then the change stays saved, the user stays «Запрошено», toast «Email змінено, але лист не надіслано. Спробуйте «Надіслати повторно».»; «Надіслати повторно» sends to the new address.
- Given the old link, When opened or completed after the change, Then «Запрошення недійсне.»
- Given the new link, When the person continues with Google, Then the Google verified email must equal the new email exactly; magic-link acceptance creates the account for the new email only (D33).
- (negative) User who has ever activated («Активний», or activated and later deactivated) → item not shown; API → 409 `USER_ACTIVATED`, nothing changes. Activated-user email change is Phase 5 and will end all their sessions (D69).
- (negative) Deactivated never-activated user → item not shown; API → 409 `USER_DEACTIVATED`.
- (negative) Non-Admin of any role/vertical (incl. Head Recruiter, Finance) → no menu item, API 404; unknown user id → 404; Admin without verified 2FA (aal1) → `MFA_REQUIRED`, nothing changes.
- (negative) New email equal to the current one after normalisation (incl. case-only difference) → «Новий email збігається з поточним.»; nothing sent.
- (negative) New email belongs to another user in any status → 409 with the invite-dialog messages (STORY-ROLE-05-1): «Користувач з таким email уже існує.» / «Запрошення на цей email уже надіслано.» / «Цей користувач деактивований…» / «Запрошення на цей email відкликано…» + «Показати в списку»; nothing changes.
- (negative) User has no valid roles → item disabled with reason «Спершу призначте ролі — без ролей запрошення недійсне.»; API 409 `INVITE_ROLES_INVALID`; email unchanged, old link (if any) keeps working.

**Data:** user id, new email (required, valid format, ≤ 254 chars), user version.
**Validation:** normalisation per Conventions; uniqueness on the normalised value across all users; eligibility (active, never activated, valid current roles) re-checked inside the write transaction.
**Effect (one transaction):** set email → old pending invite (fresh or expired) becomes `REVOKED` (revoked by/at = Admin/now) → new pending invite, current roles, `sentAt` = now, expiry = now + 72 h → event + audit. Email is sent after commit.
**Notifications:** invite email in Ukrainian (STORY-ROLE-05-1 template) to the new address only. Nothing to the old address (same as «Відкликати»; it may belong to a stranger).
**Events / audit (same transaction):**

| Record | Content |
|---|---|
| Event `user.email_changed` (user «Історія») | Payload: new `inviteId`, `revokedInviteId` (empty when status was «Відкликано»), roles — ids/enums only. Old→new email only in the purgeable PII side row (D18). «Історія» shows «Змінено email» without values (D72) |
| Audit `user.email_changed` | before/after email (purgeable, Admin-only «Журнал дій»); details: `inviteId`, `revokedInviteId` |
| Logs / Sentry | No email values (SEC P1-12) |

No separate `user.invite_revoked` / `user.reinvited` events; the single event covers both.
**Statistics:** none.
**UI (proposed copy; UX finalises, glossary to add):** menu «Змінити email» (wireframe settings-admin §1.3, closes U1); dialog «Змінити email: {ПІБ}» — read-only «Поточний email», field «Новий email», «Ролі після прийняття: …», note «Поточне посилання перестане діяти. На нову адресу надішлемо нове запрошення, яке діятиме 72 години.», [Скасувати] [Змінити і надіслати]; toast «Email змінено. Запрошення надіслано на {email} · діє до {dd.MM.yyyy HH:mm}». No optimistic update.
**Edge cases:**
- Old link accepted vs email change at the same moment → user row lock; first commit wins: acceptance first → change gets 409 «Користувач уже прийняв запрошення — змінити email поки неможливо.»; change first → acceptance «Запрошення недійсне.»
- Person mid-acceptance (acceptance page or Google consent open) when the change commits → refused at completion; any sign-in identity left for the old address is never linked and gives no access.
- Two Admins change the same user at once → version check; second gets «Дані вже змінено іншим користувачем. Оновили сторінку.»; one email, one invite.
- Change to X while another Admin invites X as a new user → one succeeds, the other gets the duplicate message.
- Change racing «Надіслати повторно» / «Відкликати» → serialised; the later action applies to the new state (resend goes to the new address; revoke kills the new invite).
- Status «Не доставлено» (bounce) → this action is the fix; the new invite has its own delivery status.
- «Відкликано» user → change and «Запросити знову» in one step (D70); all older links stay dead.
- New invite starts with «Надсилалося повторно: 0»; «Надіслано» = change time.
- Expiry is exactly 72 h, shown in Kyiv time: changed 24.10.2026 12:00 Kyiv (09:00 UTC, UTC+3) → «Діє до: 27.10.2026, 11:00» (UTC+2 after DST ends 25.10.2026).
- Repeated corrections A→B→C → only C's link works; «Історія» shows each change. Changing back C→A allowed if A is not used by another user.
- Sign-in page before acceptance: magic-link request for old or new address → neutral response (D68).
- Admin purge (Phase 5) removes the email values from audit before/after and the PII side row.

### STORY-ROLE-05-4: Users list and user details
As an **Admin**, I want to see all users with status, roles and last sign-in, so that I manage access.

**Acceptance criteria**
- Given the list, Then columns: ПІБ, email, статус (Запрошено / Активний / Деактивовано / Відкликано), roles as «Роль · Вертикаль» chips, останній вхід; filters by status, role, vertical; search by name/email; cursor pagination.
- Given a user row, When opened, Then user details show profile, role assignments, TL priorities (if Team Lead), and «Історія» (user timeline).
- (negative) Non-Admin calling list/detail endpoints, including a Head Recruiter of the same vertical → 404.

**Edge cases:** 10k users → list stays virtualised (perf budget PERF-02); deactivated user shown with «(деактивовано)».

### STORY-ROLE-05-5: Deactivate and reactivate a user
As an **Admin**, I want to deactivate a user who left, so that they can't sign in while their history stays (ROLE-05, ROLE-06).

**Acceptance criteria**
- Given an activated, active user, When an Admin with verified 2FA confirms «Деактивувати» («Користувач не зможе увійти. Історія залишиться.»), Then status becomes «Деактивовано», all app and provider sessions are revoked, pending invitations are revoked, and the provider account is banned (D23, STORY-SEC-AUTH-4, T4-G02).
- Given a deactivation dialog, When the Admin optionally enters a reason, Then at most 500 characters are accepted; the reason is visible only in the Admin audit log, never in the user timeline (wireframe §1.5). A validation failure keeps the dialog and entered reason.
- Given deactivation, When it completes, Then assignments stay stored but inactive, and the user's history and previous authorship remain intact (D44).
- Given a deactivated user, When I open «Активувати знову», Then the dialog offers their previous assignments, all initially checked, and no arbitrary new assignments. When I confirm, Then only the selected assignments are restored, the provider ban is lifted and status becomes «Активний» (D44, T4-G03, wireframe §1.6).
- Given no previous roles, or all previous roles unchecked, When reactivation is confirmed, Then zero roles is allowed; the user can sign in to «Профіль» and an Admin can assign roles separately. Reactivation never reopens old sessions or old invitation links.
- Given a committed deactivation, When the next request arrives from any old session, Then the app refuses it immediately, including when the provider ban fails (≤ 1 min, STORY-SEC-AUTH-4). A failed provider operation must not be silently reported as complete: retry it or return 503 and record a DENIED audit (SEC-AUTH-R04). Reactivation must not report success while the provider remains banned.
- Given a successful state change, When the card, users list, vertical active-user count and audit/history are refreshed, Then each reflects the saved state. A failed optimistic UI change is reconciled with the actual server state.
- Given a never-activated user (pending, expired or revoked invitation), Then deactivation is unavailable; invitation actions remain the appropriate path (wireframe §1.3).
- (negative) An Admin cannot deactivate themselves; the last active Admin cannot be deactivated (D45).
- (negative) Deactivation racing with ADMIN-role removal must still leave at least one accepted, active Admin; pending invitees and deactivated Admins do not count (SEC-ROL-02).
- (negative) Both operations require the current card version; a competing edit returns 409 and refreshes the stale card. State/version refusals leave user assignments and history unchanged.
- (negative) There is no action to delete a user, in UI or API (D44).
- (negative) Non-Admin → 404; Admin without verified 2FA → `MFA_REQUIRED`.
- **Deferred (rule confirmed, D24):** the dialog section listing open work of any role (owned applications, Team Lead vacancies, assigned polygraphs, offers) with mandatory reassignment is added in Phase 2–3 as those objects ship (`STORY-ROLE-06-1`, to be written in Phase 2). In Phase 1 no such objects exist, so the dialog has no reassignment section.

**Data / events:** current card version; optional deactivation reason (≤500, audit only); selected subset of previous assignments for reactivation. `user.deactivated` (no free text), `user.reactivated` (`restoredRoles`), `auth.session_revoked` and corresponding audit records. State changes and their events/audit are atomic; provider failure handling is checked separately. No new notification email is specified for this story.
**Edge cases:** two Admins deactivate/reactivate simultaneously → version conflict 409; deactivation versus invite acceptance/email change uses the same invite-first lock order (SEC-EML-03); deactivated user still appears as actor in all history, their name shows «(деактивовано)»; old sessions stay revoked after reactivation. Inviting their email offers «Активувати знову» (STORY-ROLE-05-1, D42).

### STORY-ROLE-05-6: My profile
As **any signed-in user** (including Finance), I want «Профіль» with my roles, theme and security settings, so that I know my access and control my sessions.

**Acceptance criteria**
- Given «Профіль», Then I see name, email (read-only), roles as «Роль · Вертикаль», тема (Світла / Темна / Системна), 2FA, active sessions, my recent sign-ins (D25).
- I can edit my display name; email changes only by Admin, audited (D44); in Phase 1 only before activation (STORY-ROLE-05-7, D69).
- (negative) I cannot view another user's profile via URL → 404 (unless Admin via user details).

**Events:** `user.profile_updated` (old→new name).

---

## 4. Verticals

### STORY-ROLE-03-1: Create and rename verticals
As an **Admin**, I want to create and rename verticals, so that the company structure is reflected (ROLE-03).

**Acceptance criteria**
- Given «Налаштування → Вертикалі», When I create «Гемблінг», Then it appears in the list.
- Given a vertical, When I rename it, Then the new name shows everywhere immediately; history keeps old→new.
- (negative) There is no action to deactivate or delete a vertical, in UI or API (D34).
- (negative) Non-Admin → 404. Duplicate name (case-insensitive) → «Вертикаль з такою назвою вже існує».

**Data:** name (required, 2–50 chars, unique). **Events:** `vertical.created`, `vertical.renamed`.
**Edge cases:** two Admins rename concurrently → 409; per-vertical toggles (vacancy approval D2, auto-routing ROUTE-09) are stored now with PRD defaults but surfaced in their phases. Polygraph Head HR review has no toggle — it is always mandatory (D36).

---

## 5. Role assignments and permissions

### STORY-ROLE-01-1: Assign a role in a vertical
As an **Admin**, I want to give a user a role in one or more verticals, so that their access matches their job (ROLE-01).

**Acceptance criteria**
- Given a user, When I add «Керівник рекрутингу · Гемблінг», Then it takes effect on the user's next request (no re-login).
- Given ADMIN or FINANCE, Then the assignment is global only; all other roles require a vertical (D40).
- Any combination of roles is allowed, including Тімлід + Рекрутер in the same vertical (D35); self-approval of bonuses is blocked later in Phase 4 (§9.3).
- (negative) Assigning a scoped role without vertical, a global role with vertical, or a duplicate (same role + vertical) → validation error.
- (negative) Non-Admin → 404.

**Events:** `user.role_assigned` (role, vertical) on user timeline + audit.
**Edge cases:** two Admins edit the same user at once → one succeeds, the other gets 409 `STALE_STATE` → conflict toast + refetch (version check, ADR-006); FINANCE granted → TOTP required on next request (STORY-SEC-AUTH-3).

### STORY-ROLE-01-2: Remove a role assignment
As an **Admin**, I want to remove a role, so that access shrinks when a job changes.

**Acceptance criteria**
- Given a role assignment, When I remove it, Then access is lost on the next request.
- (negative) Removing ADMIN from the last active Admin, or from myself → refused (D45).
- (negative) Non-Admin → 404.
- **Deferred (rule confirmed, D43):** blocking removal while open work tied to that role exists — added in Phase 2–3 with STORY-ROLE-06-1.

**Events:** `user.role_removed`.
**Edge cases:** removing a user's last role → user stays active but sees «Профіль» only with «Вам ще не призначено ролей. Зверніться до адміністратора.»

### STORY-ROLE-01-3: Team Lead priority per vertical (data for routing)
As an **Admin**, I want to set each Team Lead's priority per vertical, so that routing in Phase 3 knows the order (ROUTE-01).

**Acceptance criteria**
- Given «Пріоритети тімлідів», When I set Vasyl = 0 and Taras = 1 in Гемблінг, Then badges «П0», «П1» show with tooltip «Пріоритет 0 — найвищий».
- Equal priorities are allowed (tie-break: oldest vacancy, D5).
- A Team Lead without a priority is ranked after all prioritised Team Leads, with the marker «Пріоритет не задано», until Admin sets it (D47).
- (negative) Negative, non-integer or > 99 priority → 400 `VALIDATION_FAILED`. A batch containing a user who is not (or no longer) an active, accepted TEAM_LEAD in that vertical, or a stale row version → 409 `STALE_STATE` for the whole batch, nothing saved (the screen lists only eligible Team Leads, so this only happens after a concurrent change; wireframe P1.1 #12). Non-Admin → 404.
- Per-vacancy override is out of scope until Phase 2 (vacancies).

**Events:** `vertical.tl_priority_changed` (old→new).
**Edge cases:** removing TEAM_LEAD, including omission during reactivation, deletes its priority row in the same transaction and records old→null in the Team Lead's history (D73). Deactivation keeps the priority row but excludes the user from active ordering. Reassigning TEAM_LEAD starts without a priority. Confirmed in the owner's resume request, 2026-11-02.

### STORY-ROLE-04-1: Permissions as a role → permission map
As the **architect**, I want permissions defined once as a map from role to permissions, so that UI and API derive from the same source and custom roles can be added later (ROLE-04).

**Acceptance criteria**
- Given any permission check, Then it uses the map via the authorization module — never role-name checks in UI.
- Given a future custom role (name + permission set), Then it fits without schema change (verified by architect review).
- (negative) Given a code path that checks role names directly in UI, Then code review rejects it (rule in reviewer checklist).

### STORY-ROLE-02-1: Multi-role users get the union per vertical
As **Olena** (Керівник рекрутингу · Гемблінг + Рекрутер · Крипто), I want one account where each vertical behaves per my role there, so that I don't switch accounts (ROLE-02).

**Acceptance criteria**
- Given Olena, Then her navigation is the union of both roles; permissions on an object are evaluated only with her roles in that object's vertical.
- (negative) Olena's Head Recruiter permissions never apply to Крипто objects (test with Phase 1 resources and spec rows for later phases).

---

## 6. Authorization module (VIS groundwork)

### STORY-VIS-01-1: One server-side authorization module
As the **owner**, I want every access decision made on the server in one place, so that nobody sees what they shouldn't (VIS-01).

**Acceptance criteria**
- Given any request, Then the user's roles×verticals load once per request and every endpoint calls the module; out-of-scope → 404.
- Given a deactivated user, Then the module denies everything.
- Candidate scoping is designed for one vertical per candidate (CAND-06, D32), used from Phase 2.
- (negative) Given the UI shows a button by mistake, When the server receives the action, Then it is refused — UI hiding is cosmetic.

### STORY-VIS-02-1: Lists, pickers and counts never leak
As a **security engineer**, I want list endpoints, autocompletes and counters to contain only objects the user can open (VIS-02).

**Acceptance criteria (Phase 1 resources)**
- Users list, invites, audit, login history: Admin only; non-Admins → 404, including counts.
- User picker for later phases (e.g. assigning recruiters) returns only users in verticals where the caller has the managing role.
- Vertical list for non-Admins returns only verticals where they hold a role.
- The module supports field-level rules, used from Phase 2: candidate contacts visible to Head HR/HR (from Polygraph on) but not to Team Leads (D20); Finance sees candidates only as full name + application ID (D21).
- (negative) Non-Admin requesting `/users?search=` or a vertical they have no role in → 404 / empty.

**Phase 2 rule (confirmed):** vacancy mini-funnel counts include only applications the viewer can open (D19).

### STORY-VIS-03-1: Authorization test matrix
As **QA**, I want every rule in PRD §2.3 to have an allowed and a denied automated test (VIS-03).

**Acceptance criteria**
- Given `docs/authz-matrix.md` (architect), Then each row maps to tests; Phase 1 rows (settings/users/verticals/roles/audit, Finance-only-statistics, Admin-only purge placeholder rows as "pending phase N") are green; later rows are listed with target phase.
- (negative) A rule without a denied test fails the coverage check in CI.

---

## 7. Audit and history

### STORY-AUD-1: Every write is audited
As an **Admin**, I want every change logged with actor, time, IP, user agent and before/after, so that any action can be traced (AUD).

**Acceptance criteria**
- Given any successful write, Then one audit record exists in the same transaction; failed/refused writes are not recorded as changes (refusals of Admin-only endpoints are recorded as security events).
- Records are kept 3 years (D25). From Phase 2, CV/polygraph downloads, offer-salary views and exports are also logged (D25).
- PII in before/after is stored separately so that only Admin purge can redact it (D18).
- (negative) No role, including Admin, can edit or delete audit records (DB-level guarantee).

**Edge cases:** system actions (cron, seed) recorded with actor «Система».

### STORY-AUD-2: Audit viewer
As an **Admin**, I want «Журнал дій» with filters, so that I can investigate (AUD).

**Acceptance criteria**
- Filters: period (Kyiv dates), actor, action type, entity type, entity; newest first; cursor pagination; open a record to see before/after.
- (negative) Non-Admin → 404 (incl. Finance, Head Recruiter) (D25).
- Period boundaries use Kyiv midnight (e.g. «30.10.2026» = 29.10.2026 22:00 UTC … 30.10.2026 21:59:59 UTC after DST end on 25.10.2026).

**T6 follow-up: grouped action selection and security view (wireframe settings-admin §3.1.1, D74)**
- Given an Admin with verified MFA, When selecting several «Дія» checkboxes, Then the journal shows records matching any selected action, combined with the existing period/actor/entity/result filters; the selection applies immediately like the existing filters.
- Given the emitted-action catalogue, When opening the selector, Then Ukrainian action labels retain the existing groups «Користувачі», «Входи та безпека», «Вертикалі»; no invented actions or empty «Налаштування» group. Selection is visible and announced; keyboard and 390 px touch interaction remain accessible.
- Given no selected actions, Then «Дія: Усі» adds no manual action constraint. When clearing the action selection, Then other filters and the selected view remain; When choosing «Скинути фільтри» or opening entity history, Then «Усі дії» and cleared manual actions are restored (global reset also restores the existing seven-day defaults; entity history retains its entity constraint).
- Given multiple selected actions, When reloading, sharing the URL or returning with Back/Forward, Then the same selection and query results are restored. Opening/closing a record preserves the filters. A filter change starts a fresh cursor window and clears the selected record as existing filters do.
- Given an existing `action=<code>` link, When opening it, Then it remains a one-action filter. The engineering contract uses legacy `action` for one selection, canonical unique `actions=<comma-separated codes>` for multiple selections and neither key for none; the API bounds input length/count and returns 400 for malformed input or simultaneous `action` and `actions` keys. Security view uses `view=security`; default «Усі дії» omits `view`. Restored URLs update the view and manual selection together.
- Given manually selected actions, When switching either direction between «Усі дії» and «Входи та безпека», Then the selection, its visible summary and unrelated filters remain. Security view ANDs `auth.*` or `user.mfa_*` with the selected actions; e.g. `user.invited` plus `auth.login_failed` shows only the latter in security view. All catalogue groups stay selectable in both views, and `user.mfa_*` remains in «Користувачі».
- Given no manual selection and security view, When loading records, Then all matching security-prefix events are eligible, including historical codes outside the current picker catalogue. Given only `user.invited` selected in security view, Then the ordinary empty/reset state appears; switching back restores its matching results without reselecting the action.
- Given no matching rows, When using several actions, Then the existing empty/reset state is shown. Loading/error handling, Admin-only `audit.read`, non-Admin 404 and insufficient-MFA denial remain unchanged.
- Given duplicate selections or concurrent read-only viewers, Then rows are not duplicated and no writes, notifications, timeline events or statistics changes are emitted. Deactivated actors and unknown/removed entities retain their existing visibility/labels.

**Scope:** grouped selection and security-view intersection are approved (Q-158, D74, 2026-11-02). Security scope is prefix-based, independent of the current picker catalogue. Custom-date draft synchronization on Back, full virtualization and retention jobs remain separate slices; backward page-window navigation → STORY-AUD-4. Preserve existing 366-day explicit-range validation, 50-row default/100-row API maximum and bounded retained output; initial JS must remain ≤180 kB gz.

### STORY-AUD-3: Login history
As an **Admin**, I want every sign-in attempt recorded, so that suspicious access is visible (AUD).

**Acceptance criteria**
- Each attempt: user (if known), method (magic link / Google / dev), result, reason for failure, IP, user agent, time.
- Admin sees all; users see their own in «Профіль» (D25).
- (negative) A user cannot see others' login history → 404.

### STORY-AUD-4: Return to newer records in «Журнал дій» (bounded window)
As an **Admin**, I want «Показати новіші» after paging far back, so that I can return to newer records without reloading or losing filters (AUD, PERF-04/05).

Orchestrator decision within STORY-AUD-2 scope: bidirectional bounded window; no new dependency; full virtualization stays a separate slice. Wireframe settings-admin §3.1.

**Acceptance criteria**
- Given the newest first page, Then no «Показати новіші» is shown (`prevCursor` = null).
- Given 3+ «Показати ще» loads (newest page evicted, window = 2 pages / ≤100 rows), Then «Показати новіші» (`settings.audit.loadNewer`) appears **above** the list, same style as «Показати ще»; mobile 390: full width, 44 px.
- When pressing «Показати новіші», Then the 50 records immediately newer than the first shown row are prepended and the oldest page is evicted (still ≤2 pages / ≤100 rows); «Показати ще» below loads the next older 50 symmetrically.
- Given repeated «Показати новіші», When the newest records are reached, Then the button disappears.
- Scroll anchoring: the row that was first stays at the same viewport position (no jump to top). Focus stays on «Показати новіші»; if the button disappears, focus moves to that anchor row. The existing polite live region announces the shown count. While loading: button busy/disabled, no double request.
- Any filter/view change, «Скинути фільтри», entity-history link or reload → restart at the newest first page (existing behaviour).
- Record sheet (`?record=`) stays open across loads (detail is fetched by id); row highlight and `j/k` (§3.1) work on retained rows only; `j/k` never triggers a page load.
- (negative) Non-Admin (incl. Head Recruiter, Finance) → 404; Admin without `aal2` → existing MFA denial; unauthenticated → 401. `direction` does not widen any filter or scope.

**API contract** (`GET /api/v1/audit`, extends ADR-006 `{ items, nextCursor }`)

| Parameter / field | Rule |
|---|---|
| `direction` | Optional, `older` (default) \| `newer`; used with `cursor`. Invalid value → 400. `direction=newer` without `cursor` → 400 |
| `cursor` only | Behaves exactly as today (older) |
| `items` | Always newest first (`occurred_at DESC, id DESC`), also for `newer` |
| `prevCursor` | New, nullable. Non-null only when newer matching records exist before the first returned row. Always null for a request without cursor |
| `nextCursor` | Unchanged semantics: older matching records exist after the last returned row |
| Filters, limits | Same filters/validation (366-day range, actions/view rules), 50 default / 100 max |

**Edge cases**

| Case | Expected |
|---|---|
| Records created after the page opened | May appear when going newer; correct placement, no duplicates, no gaps |
| Page boundary with equal `occurred_at` | Keyset tie-break by `id DESC` in both directions; no row skipped or repeated |
| Last (oldest) page reached | «Показати ще» hidden (`nextCursor` null); «Показати новіші» still works |
| Newest reached via newer loads | Button hidden; newer records arriving later appear only on refetch/reload |
| Newer page with fewer than 50 rows | Shown as is; button hidden (`prevCursor` null) |
| Evicted page + filter change | Window resets to newest first page with new filters; no stale pages or buttons from the previous filter |
| Refetch on window focus / 30 s stale | Retained window re-read from its current first boundary; same window size, no scroll reset, no duplicates; late-committed rows appear at their sorted position |
| Request error (newer) | Existing inline error + retry next to the button; retained rows and scroll unchanged |
| Deactivated actor / removed entity in loaded rows | Existing labels («(деактивовано)», type + short ID) |
| Concurrent Admin viewers | Read-only: no writes, audit records, notifications, timeline events or statistics changes |
| Mobile 390 | Card list; both buttons full width 44 px; anchoring and announcement as desktop |

**Non-functional**
- PERF-04: audit route initial JS ≤180 kB gz (current 178.43 kB); no new dependency.
- PERF-05: one SQL query per page in either direction (limit + 1 probe row), indexed keyset; no count query.
- PERF-02: list P95 <150 ms applies to `newer` as to `older`.
- Client retains ≤2 pages / ≤100 rows; DOM ≤100 rows.

**Data / notifications / events / statistics:** no new data; none emitted (read-only screen).

**Test notes**
- Unit: page-param logic (`getPreviousPageParam` / `getNextPageParam`), window eviction direction, query parsing (`direction` valid/invalid, `newer` without cursor → 400).
- Integration (API/repository): `newer` returns rows strictly newer than cursor in DESC order; equal-timestamp ties; `prevCursor`/`nextCursor` null/non-null at both ends; filters + `view=security` + `actions` combined; legacy `cursor`-only unchanged; non-Admin 404, no `aal2` denied, unauthenticated 401; inserted-after-open record appears once.
- E2E: 3× «Показати ще» → «Показати новіші» appears → repeat to newest → button gone; scroll anchor row position unchanged; focus and live-region text; filter change resets window; record sheet stays open; mobile 390 flow.
- Postman/Newman: `direction` happy path + 400 cases.
- Screenshots: `06-admin-audit-newer-{desktop,mobile}-{light,dark}` (button visible above list after eviction).

### STORY-HIST-03-1: Append-only event store from day one
As the **owner**, I want history that can never be altered, so that every card's timeline is trustworthy (HIST-01, HIST-03).

**Acceptance criteria**
- Given the event table, Then updates and deletes are rejected at DB level for every role.
- User and vertical changes in Phase 1 appear on their «Історія» with who/when/what (old→new).
- PII values in events are stored separately; the only operation that removes them is Admin purge (Phase 5), which itself writes an event (D18).
- (negative) A direct UPDATE attempt by the app's DB role fails (integration test).

---

## 8. Design system shell

### STORY-UI-04-1: App shell and navigation per role
As **any user**, I want navigation that shows only sections I may use, so that the app is simple and safe (UI-04, STAT-08).

**Acceptance criteria**
- Navigation matrix = `docs/ux/screens.md` §1; a section appears only once it is built (D28). In Phase 1: Admin sees «Налаштування» (Користувачі та ролі, Вертикалі, Пріоритети тімлідів, Журнал дій) and «Профіль»; all other roles, including Finance, see «Профіль» only.
- Landing after sign-in: Admin → «Налаштування → Користувачі та ролі»; others → «Профіль» (Phase 1). From Phase 2: Dashboard; Finance → «Статистика» from Phase 4, without bell, search or calendar (D41).
- (negative) Finance opening any non-statistics route → redirect to their landing; object URLs → 404 (STAT-08). Non-Admin opening `/settings/*` → 404.
- Multi-role user sees the union (STORY-ROLE-02-1).

### STORY-UI-05-1: Design tokens, themes, responsive, accessible, Ukrainian
As **any user**, I want a consistent, accessible Ukrainian interface on desktop and phone in light or dark theme (UI-05).

**Acceptance criteria**
- Light/dark/system theme from «Профіль», persisted; no flash of wrong theme on load.
- All copy from the Ukrainian message file using glossary terms, including role names Адміністратор, Керівник рекрутингу, Рекрутер, Керівник HR, HR-менеджер, Тімлід, Фінансист (D27); `ʼ` apostrophe; uk-UA number/date formats.
- 390 px mobile: bottom bar / bottom sheets per screens.md; tap targets ≥ 44 px.
- WCAG 2.1 AA: contrast, focus visible, keyboard navigation for all Phase 1 screens; automated a11y check in E2E.
- (negative) A hard-coded UI string in a component fails lint/review.

### STORY-UI-06-1: Loading, empty, error and not-found states
As **any user**, I want clear states everywhere (UI-06).

**Acceptance criteria**
- Skeletons only after 150 ms; empty states with one-line explanation and primary action if allowed (e.g. users list for Admin: «Запросити»).
- Section-level error with «Спробувати ще раз»; 404 and forbidden share «Сторінку не знайдено або доступ обмежено.»
- (negative) Error pages never show stack traces, emails or IDs of objects the user can't access.

---

## 9. Seed data

### STORY-SEED-1: Phase 1 seed
As **QA and the owner**, I want realistic Ukrainian seed data, so that demos and screenshots are meaningful (CLAUDE.md §8).

**Acceptance criteria**
- `pnpm db:seed` creates verticals Гемблінг and Крипто, and users: `admin@demo` (Адміністратор, global, TOTP pre-enrolled for local only), `head.recruiter.gambling@demo`, `recruiter1.gambling@demo`, `recruiter2.gambling@demo`, `recruiter.crypto@demo`, `head.hr@demo` and `hr@demo` (both verticals, D46), `vasyl.tl@demo` (Тімлід · Гемблінг, П0), `taras.tl@demo` (Тімлід · Гемблінг, П1), `tl.crypto@demo` (Тімлід · Крипто, П0), `finance@demo` (global, TOTP pre-enrolled for local only), with Ukrainian full names; plus one expired invite and one deactivated user for screenshots.
- Re-running is idempotent.
- (negative) Seed refuses to run against production.
- **Deferred:** position «Медіабаєр — Facebook», vacancies and ~30 candidates are seeded in Phase 2–3 with their tables (not stubbed now). Perf seed (PERF-01) starts in Phase 2.

---

## 10. Screenshots

### STORY-SHOT-01-1: Screenshot suite per screen × role × theme × viewport
As the **owner**, I want screenshots of every screen for review without running the app (SHOT-01).

**Acceptance criteria**
- `pnpm test:screens` captures Phase 1 screens and dialogs: Вхід (default, link sent, error, expired invite, deactivated), Прийняти запрошення, TOTP enrolment/challenge (Admin, Finance), Користувачі та ролі (list, invite dialog, user details, change email dialog incl. duplicate-email error, deactivate dialog, role assign dialog), Вертикалі (list, create/rename), Пріоритети тімлідів, Журнал дій (list, record details), Профіль, 404 — for each role that can see them, light + dark, 1440×900 + 390×844.
- (negative) A screen a role cannot access is not captured as that role (captures 404 instead where meaningful, e.g. Finance → settings).

### STORY-SHOT-02-1: File naming and gallery
As the **owner**, I want a gallery grouped by screen that opens locally (SHOT-02).

**Acceptance criteria**
- Files `screenshots/phase-1/<NN>-<role>-<screen>-<state>-<viewport>-<theme>.png`; `screenshots/phase-1/index.html` groups by screen, opens from disk without a server; copy to `screenshots/latest/`.
- (negative) A screenshot missing from the gallery or a gallery link to a missing file fails the suite.

### STORY-SHOT-03-1: Deterministic screenshots
As the **UX designer**, I want stable diffs between runs (SHOT-03).

**Acceptance criteria**
- Fixed clock (16.11.2026, 10:00 Europe/Kyiv, as in `docs/test-plan.md`), seeded Ukrainian data, animations off, fonts loaded before capture.
- (negative) Two consecutive runs with no code change produce identical images (pixel-diff check).

---

## Traceability

| PRD ID | Stories | Tests (filled by QA) |
|---|---|---|
| §15 Phase 1 enablers | FND-1..5 | — |
| ROLE-01 | ROLE-01-1, ROLE-01-2 | — |
| ROLE-02 | ROLE-02-1 | — |
| ROLE-03 | ROLE-03-1 (deactivation removed, D34) | — |
| ROLE-04 | ROLE-04-1 | — |
| ROLE-05 | ROLE-05-1..7 (05-7 = D69 email change), SEC-AUTH-1, SEC-AUTH-2 | — |
| ROLE-06 | ROLE-05-5; open-work reassignment deferred (D24) → STORY-ROLE-06-1 (Phase 2) | — |
| ROUTE-01 (data only) | ROLE-01-3 | — |
| VIS-01 | VIS-01-1 | — |
| VIS-02 | VIS-02-1 | — |
| VIS-03 | VIS-03-1 | — |
| AUD | AUD-1, AUD-2, AUD-3, AUD-4 (newer-window navigation) | — |
| HIST-01, HIST-03 | HIST-03-1 | — |
| SEC (auth, sessions, 2FA, rate limit, CSP, PII logs) | SEC-AUTH-1..4, FND-3, FND-5 | — |
| API | FND-4 | — |
| PERF-03, PERF-06 | FND-2, FND-3 | — |
| UI-04, STAT-08 (nav) | UI-04-1 | — |
| UI-05 | UI-05-1, ROLE-05-6 | — |
| UI-06 | UI-06-1 | — |
| SHOT-01..03 | SHOT-01-1, SHOT-02-1, SHOT-03-1 | — |
| CLAUDE.md §8 seed / dev login | SEED-1, DEV-1 | — |

## Ready for design
- All Phase 1 stories.

## Blocked by questions
- None. Remaining open questions (`docs/OPEN_QUESTIONS.md`) affect Phase 2 and later.
