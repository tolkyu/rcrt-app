# Architecture

Modular monolith on Next.js 15 (ADR-001). Related: ADR-002…009, `docs/authz-matrix.md`, `docs/pipeline-state-machine.md`, `docs/erd.md` (database-engineer).

## 1. Module map

```
app/
  (auth)/login, auth/callback, invite/[token]     # Supabase Auth flows, invite acceptance
  (app)/layout.tsx                                 # shell, nav filtered by grants, RealtimeBridge
  (app)/page.tsx                                   # dashboard (UI-01)
  (app)/vacancies, vacancies/[id]
  (app)/candidates, candidates/[id]
  (app)/calendar  (app)/statistics  (app)/archive  (app)/settings/*
  api/v1/**/route.ts                               # REST, only via defineRoute() (ADR-006)
  api/cron/<job>/route.ts                          # CRON_SECRET, thin → server/jobs
  api/webhooks/resend/route.ts                     # signature-verified
  api/dev/login/route.ts                           # NODE_ENV=development only, excluded from prod build
components/ui (shadcn) · components/<feature>      # client/server components, no server imports
server/
  http/            defineRoute, RequestContext, error → problem+json mapping
  authz/           permissions, builtin roles, context loader, can(), scopeWhere()
  domain/pipeline  state machine + probation date rules (pure)
  domain/routing   nextVacancy (pure)
  domain/bonus     compute, evaluateTriggers (pure)
  services/        use cases: vacancy, candidate, application, pipeline, interview, polygraph,
                   offer, probation, bonus, payout, statistics, dashboard, search, file,
                   notification, user, vertical, settings, audit, events, change-feed, purge
  repositories/    Drizzle queries; every list/detail takes a scope SQL argument
  db/              client (postgres.js, prepare:false), schema.ts, migrations/, seed.ts, seed-perf.ts, tx helper
  integrations/    supabase-auth (JWKS), storage, resend (email channel), pdf (react-pdf), fx
  jobs/            one module per cron job (ADR-004)
lib/
  schemas/         shared Zod (forms + API + OpenAPI)
  query-keys.ts    TanStack Query key factory (ADR-007)
  api-client.ts    typed fetch for /api/v1 (problem+json → typed error)
  i18n/            next-intl config, formatters
  utils/
messages/uk.json
```

### Dependency rules (ESLint `import/no-restricted-paths` + `server-only`)

| Module                       | May import                                                     | Must not import                                       |
| ---------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| `server/domain/*`            | `lib/` types, `server/authz/types`                             | db, repositories, services, integrations, Next, React |
| `server/authz`               | repositories (context load), domain types                      | services                                              |
| `server/services`            | domain, authz, repositories, integrations, `server/http` types | `app/`, components                                    |
| `server/repositories`        | db, authz scope types                                          | services, domain logic                                |
| `app/` (RSC, route handlers) | services, authz context, `lib/`                                | repositories, db                                      |
| `components/`                | `lib/`                                                         | anything under `server/`                              |

## 2. Request flows

### 2.1 Mutation (UI or Postman)

```
Client useMutation (optimistic patch)          Postman/Newman (Bearer token)
        └──────── POST /api/v1/applications/{id}/transitions ────────┘
defineRoute
  1 requestId, timing · 2 CSRF/transport check (Origin, JSON, X-CSRF-Protection) · 3 auth → RequestContext (JWT local verify, 1 SQL)
  4 Zod parse → 400
service pipeline.transition(ctx, cmd)  — db.transaction:
  5 repo.findForUpdate(id, scopeWhere(ctx,'application','application.read')) → null ⇒ 404
  6 permissionsFor(ctx, ref) → domain.plan(state, input, {permissions, now, today}) → 403/409
  7 apply effects (repos) · routing/bonus pure calls · counters · stats deltas
  8 events.append · audit.write · changeFeed.emit · notifications.enqueue (rows only)
  commit
after(): notification dispatcher sends emails for new delivery rows (retries via cron)
response DTO (Zod) → client: setQueryData + invalidate keys; others get Realtime broadcast
```

### 2.2 Page load (RSC)

```
page.tsx → getAuthContext() [React.cache] → hasAnyGrant? else notFound()
        → getQueryClient() [React.cache]
        → await Promise.all([qc.prefetchQuery({ queryKey, queryFn: () => service.x(ctx, …) }), …])
        → <HydrationBoundary state={dehydrate(qc)}> client components useQuery(same key) </HydrationBoundary>
secondary panels → <Suspense> streamed
```

### 2.3 Cron / webhook

`/api/cron/<job>` → secret check → system `RequestContext` (`actorId=null`, `actor_kind=SYSTEM`) → `job_run` claim → batches through the **same services** (no duplicated logic) → stats in `job_run.stats`.

## 3. Per-request context

```ts
// server/http/context.ts
import type { AuthContext } from '@/server/authz/types';
import type { Clock } from '@/server/domain/pipeline/types';

export interface RequestContext {
  readonly identity: VerifiedIdentity; // verified sub/session_id/aal; never a raw token or a role source
  readonly auth: AuthContext; // null-free: unauthenticated requests never reach services
  readonly requestId: string;
  readonly clock: Clock; // SystemClock in prod, FixedClock in tests/screenshots
  readonly ip: string | null; // audit only, never logged with PII
  readonly userAgent: string | null;
}
export interface SystemContext extends Omit<
  RequestContext,
  'auth' | 'identity'
> {
  readonly auth: null;
  readonly jobName: string;
}
export declare const getRequestContext: () => Promise<RequestContext>; // React.cache for RSC
```

- Loaded once per request: RSC via `React.cache`; route handlers via `defineRoute` (React.cache is not request-scoped there) and passed explicitly.
- `verifySupabaseIdentity` is wired into both paths: locally verified ES256/RS256 JWT from Bearer or standard Supabase SSR cookies, cached configured JWKS, strict issuer/audience/session claims; roles still load only from DB (ADR-010). Runtime requires `SUPABASE_URL`; standalone database tooling does not.
- Services always take `ctx` first; never read cookies/headers themselves.
- Context query (`server/repositories/principal.ts`, one round-trip, < 2 ms): `app_user u` by `auth_user_id = $1` + `EXISTS (SELECT 1 FROM app.auth_session_status s WHERE s.id = $2 AND s.user_id = u.auth_user_id AND (s.not_after IS NULL OR s.not_after > now))` + `json_agg` of `user_role` rows. `$1`/`$2` = JWT `sub`/`session_id`; `aal` comes from the verified JWT claims (ADR-002 §4), not from the database. No live session ⇒ 401 `SESSION_EXPIRED`; inactive user ⇒ 401 `USER_DEACTIVATED` (DG-05; logout/revocation are immediate). Access-token TTL ≤ 15 min. JWT checks per ADR-002 (DG-02). `app_rw` reads sessions only through the `app.auth_session_status` view (id, user_id, not_after); it has no grant on `auth.sessions`.
- Authorization never relies on `middleware.ts` (DG-17); it only refreshes the session cookie.

## 4. Transactions & concurrency

- One DB transaction per mutation (services own it; repositories receive `tx`).
- Applications: `SELECT … FOR UPDATE` + `version` check (`expectedVersion`) → 409 `STALE_STATE`.
- Counters: ordered row updates (by `vacancy_id, stage`) to avoid deadlocks.
- ROUTE-06 race: partial unique index `application(candidate_id, position_id) WHERE stage IN (active) AND deleted_at IS NULL` → 23505 → 409 `ACTIVE_APPLICATION_IN_GROUP`.
- Probation extension: DB trigger is the last line (PROB-05) → mapped to 409.
- External calls (email, Storage) never inside the transaction except Storage signed-URL creation (idempotent, no state).

## 5. Error model

Typed domain errors (`server/http/errors.ts`) → RFC 9457 `application/problem+json` `{ type, status, code, detail?, errors?, requestId }`. UI maps `code` → `messages/uk.json` `errors.<code>`.

| Error class              | HTTP | Codes (examples)                                                                                                                                                                                                                                      | When                                                                                                                     |
| ------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ValidationError`        | 400  | `VALIDATION_FAILED` (+ field paths, e.g. Meet link regex), `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `FILE_CONTENT_MISMATCH`                                                                                                                         | Zod / file checks                                                                                                        |
| `UnauthenticatedError`   | 401  | `UNAUTHENTICATED`, `SESSION_EXPIRED`, `USER_DEACTIVATED`, `MFA_REQUIRED`                                                                                                                                                                              | no/invalid JWT, inactive user, Admin or Finance without aal2 (MFA mandatory, owner 2026-10-31)                           |
| `ForbiddenError`         | 403  | `FORBIDDEN`, `SELF_BENEFIT_FORBIDDEN` (DG-19, owner-confirmed), `CSRF_FORBIDDEN` (DG-06; missing/foreign `Origin`, non-JSON body or no `X-CSRF-Protection: 1`)                                                                                        | object **visible** but action not permitted                                                                              |
| `NotFoundError`          | 404  | `NOT_FOUND`                                                                                                                                                                                                                                           | missing, soft-deleted (outside archive), **out of scope**, or whole route without any grant (Finance outside Statistics) |
| `InvalidTransitionError` | 409  | `INVALID_TRANSITION` + guard codes (`TL_NOT_ACCEPTED`, `POLYGRAPH_PDF_REQUIRED`, `POLYGRAPH_MANDATORY`, `PROBATION_MIN_30_DAYS`, …)                                                                                                                   | state machine rejects                                                                                                    |
| `ConflictError`          | 409  | `STALE_STATE`, `ACTIVE_APPLICATION_IN_GROUP`, `CANDIDATE_VERTICAL_MISMATCH`, `CANDIDATE_HAS_ACTIVE_APPLICATIONS` (CAND-06), `PROBATION_EXTENSION_FORBIDDEN`, `INVITE_EXPIRED`, `TRANCHE_PERCENTS_NOT_100`, `VACANCY_BONUS_CHANGE_TOO_SOON` (BONUS-16) | concurrency / business invariants                                                                                        |
| `RateLimitedError`       | 429  | `RATE_LIMITED`                                                                                                                                                                                                                                        | auth/API limits                                                                                                          |
| anything else            | 500  | `INTERNAL`                                                                                                                                                                                                                                            | Sentry (PII scrubbed) with `requestId`                                                                                   |

- DB errors are logged by SQLSTATE + constraint name only (DG-16).
- PG mapping: `23505` by constraint name → `ConflictError` code; trigger `RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='<CODE>'` → 409 with that code.
- Error bodies never include data about other objects (VIS-02).
- Server Components: `NotFoundError` → `notFound()`; other errors → route `error.tsx` (Ukrainian copy).

## 6. Notification layer (NOTIF, PIPE-05, PROB-06) — pluggable channels

| Part            | Design                                                                                                                                                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog         | `server/services/notification/catalog.ts`: per type → recipient resolver, default channels, allowed channels, user-configurable flag, template keys (`notifications.<type>.*`, `email.<type>.*`)                                                                           |
| Preferences     | `notification_pref(user_id, type, channel, enabled)` — override rows only; defaults from catalog (NOTIF "user chooses channels per event type")                                                                                                                            |
| Enqueue (in tx) | `notifications.enqueue(tx, intent)` → resolve recipients (active users; `can(recipientCtx, read, ref)`; actor excluded) → `notification` row per user (in-app, if enabled) + `notification_delivery` row per external channel, each with `dedupe_key`                      |
| Dispatch        | after commit (`after()`) → channel adapter `send()`; failures → `RETRY` with backoff; `notifications-dispatch` cron retries; Resend webhook updates status                                                                                                                 |
| Channels v1     | `IN_APP` (the `notification` row + `user:{id}` Realtime topic), `EMAIL` (Resend + React Email)                                                                                                                                                                             |
| Recipients      | `USER` (prefs apply) or `CANDIDATE` (email only, address resolved at send time — never stored on the delivery row; purge-safe)                                                                                                                                             |
| Content         | Rows store `type`, entity ids, minimal params (no PII, no salary, no polygraph data); labels resolved at read time via scoped joins. User emails: short text + link to the card. Candidate emails: required details (interview time/link, polygraph place/time, offer PDF) |
| Extension       | Telegram (Phase 6) = new adapter implementing `NotificationChannel` + catalog `allowedChannels` + pref UI; `channel` columns are `text`, no schema change. **Not designed now** — scope defined by the owner in Phase 6                                                    |

```ts
// server/services/notification/types.ts
export type ChannelId = 'IN_APP' | 'EMAIL' | (string & {});
export type Recipient =
  | { readonly kind: 'USER'; readonly userId: string }
  | { readonly kind: 'CANDIDATE'; readonly candidateId: string };
export interface DeliveryEnvelope {
  readonly deliveryId: string;
  readonly notificationType: string;
  readonly recipient: Recipient;
  readonly locale: 'uk';
  readonly entity: { readonly type: string; readonly id: string };
  readonly params: Readonly<Record<string, string | number>>;
  readonly dedupeKey: string;
}
export type DeliveryOutcome =
  | { readonly status: 'SENT'; readonly providerMessageId: string | null }
  | { readonly status: 'RETRY'; readonly errorCode: string }
  | { readonly status: 'FAILED'; readonly errorCode: string };
export interface NotificationChannel {
  readonly id: ChannelId;
  readonly recipientKinds: readonly Recipient['kind'][];
  send(envelope: DeliveryEnvelope): Promise<DeliveryOutcome>;
}
export interface NotificationIntent {
  readonly type: string;
  readonly entity: { readonly type: string; readonly id: string };
  readonly recipients: readonly Recipient[];
  readonly params: Readonly<Record<string, string | number>>;
  readonly dedupeKey: string | null;
}
export interface NotificationService {
  enqueue(tx: unknown, intent: NotificationIntent): Promise<readonly string[]>; // delivery ids
  dispatch(deliveryIds: readonly string[]): Promise<void>;
}
```

## 7. Cron jobs (details ADR-004)

| Job                          | Schedule (UTC) | Purpose (PRD)                                                                                          |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| `notifications-dispatch`     | */5 min        | retry email deliveries (NOTIF)                                                                         |
| `interview-reminders`        | */5 min        | 24 h / 1 h reminders to recruiter, TL, candidate (PIPE-05, D7)                                         |
| `probation-daily`            | 05:00          | 14/7/1-day + daily overdue reminders, close tasks (PROB-06), first-day confirmation reminder (PROB-01) |
| `offer-expiry`               | hourly         | SENT → EXPIRED after validity (OFFER-03, D11) ⚠ OPEN                                                   |
| `bonus-triggers`             | 02:00          | tranche triggers, DAYS_AFTER_START, clawback (BONUS-15)                                                |
| `stats-reconcile`            | 01:30          | recompute last 7 Kyiv days + dirty days (STAT, PERF-05)                                                |
| `vacancy-counters-reconcile` | 01:00          | recompute mini-funnel counters + hires                                                                 |
| `files-cleanup`              | 03:00          | abandoned uploads                                                                                      |
| `change-feed-prune`          | 03:30          | `change_feed` > 24 h                                                                                   |
| `retention-propose`          | Mon 04:00      | ARCH-04 purge proposals (Phase 5)                                                                      |
| `auth-drift-check`           | 04:30 (prod)   | no `@demo`/password users, signups off (DG-07)                                                         |
| `rate-limit-prune`           | 04:45          | expired limiter windows (DG-09)                                                                        |

Manual re-run: `POST /api/v1/admin/jobs/{job}/runs` (Admin, aal2, audited, DG-04) — never via `CRON_SECRET` from a browser.

## 8. Domain engine interfaces (types/signatures only)

### 8.1 Routing — `server/domain/routing/` (ROUTE-01..10)

```ts
import type { UserId, VacancyStatus } from '@/server/authz/types';

export interface RoutingVacancy {
  readonly id: string;
  readonly teamLeadId: UserId | null;
  readonly teamLeadActive: boolean;
  readonly status: VacancyStatus;
  readonly deleted: boolean;
  readonly vacancyPriorityOverride: number | null; // ROUTE-01 per-vacancy override (Admin)
  readonly teamLeadPriority: number | null; // team_lead_priority for (TL, vertical); 0 = highest
  readonly createdAt: Date;
}
export interface TlRejection {
  readonly teamLeadId: UserId;
  readonly at: Date;
} // TL_DECLINE / TL_INTERVIEW_REJECT of this candidate

export interface RoutingInput {
  readonly vacancies: readonly RoutingVacancy[]; // whole routing group (position × vertical)
  readonly tlRejections: readonly TlRejection[];
  readonly excludeVacancyIds: readonly string[]; // current vacancy + any with an active application of the candidate
  readonly now: Date; // injected clock
  readonly rejectionCooldownDays: number; // D6 = 180
}
export type SkipReason =
  | 'DRAFT'
  | 'ON_HOLD'
  | 'FILLED'
  | 'CANCELLED'
  | 'DELETED'
  | 'NO_TEAM_LEAD'
  | 'TEAM_LEAD_INACTIVE'
  | 'TL_REJECTED_RECENTLY'
  | 'EXCLUDED';
export interface RankedVacancy {
  readonly vacancyId: string;
  readonly teamLeadId: UserId;
  readonly effectivePriority: number;
}
export type RoutingDecision =
  | {
      readonly kind: 'ROUTE';
      readonly target: RankedVacancy;
      readonly ranked: readonly RankedVacancy[];
      readonly skipped: readonly { vacancyId: string; reason: SkipReason }[];
    }
  | {
      readonly kind: 'NONE';
      readonly ranked: readonly [];
      readonly skipped: readonly { vacancyId: string; reason: SkipReason }[];
    };

/** Order: effectivePriority = override ?? teamLeadPriority (asc), ties by createdAt asc (D5), then id asc for determinism. */
export declare function nextVacancy(input: RoutingInput): RoutingDecision;
```

- Uses current priorities at decision time (ROUTE-10 "mid-flow priority change").
- ⚠ OPEN: TL with no priority set in the vertical — default ranked after all prioritised TLs.
- `ranked` feeds ROUTE-08 suggestion and ROUTE-09 manual pick.

### 8.2 Bonus — `server/domain/bonus/` (BONUS-01..16; PRD names `computeBonus` = `compute`, `nextBonusEvents` = `evaluateTriggers`)

```ts
import type { UserId } from '@/server/authz/types';
import type { KyivDate } from '@/server/domain/pipeline/types';

export type BaseType =
  'FIXED' | 'PERCENT_OF_MONTHLY_SALARY' | 'PERCENT_OF_ANNUAL_SALARY';
export type TrancheTrigger =
  | { readonly kind: 'PROBATION_STARTED' }
  | { readonly kind: 'PROBATION_PASSED' }
  | { readonly kind: 'DAYS_AFTER_START'; readonly days: number };
export type ClawbackPolicy =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'FULL_IF_LEFT_WITHIN_N_DAYS'; readonly days: number }
  | { readonly kind: 'PRORATED' };
export type TrancheStatus =
  | 'PLANNED'
  | 'ELIGIBLE'
  | 'APPROVED'
  | 'PAID'
  | 'CANCELLED'
  | 'ON_HOLD'
  | 'CLAWBACK_PENDING'
  | 'CLAWED_BACK';

/** Frozen copy stored on bonus_snapshot (BONUS-02). Percentages/multipliers in basis points (10000 = 100% / ×1). */
export interface BonusSchemeSnapshot {
  readonly schemeId: string;
  readonly schemeVersion: number;
  readonly name: string;
  readonly baseType: BaseType;
  readonly baseValue: bigint; // FIXED: minor units; PERCENT_*: basis points
  readonly currency: string; // ISO 4217
  readonly tranches: readonly {
    readonly index: number;
    readonly trigger: TrancheTrigger;
    readonly percentBp: number;
  }[]; // sum = 10000
  readonly clawback: ClawbackPolicy;
  readonly minDaysForTranche1: number | null;
  readonly urgentMultiplierBp: number;
}
export interface FxRate {
  readonly from: string;
  readonly to: string;
  readonly rate: string;
  readonly date: KyivDate;
  readonly source: string;
} // decimal string, BONUS-03

export interface BonusComputeInput {
  readonly scheme: BonusSchemeSnapshot; // split/triggers/clawback: vacancy scheme override → vertical → global (BONUS-01)
  /** BONUS-16: when set, replaces the scheme base entirely (no FX); the scheme still supplies the tranche split. */
  readonly vacancyRewardAmount: {
    readonly amountMinor: bigint;
    readonly currency: string;
  } | null;
  readonly offerSalary: {
    readonly amountMinor: bigint;
    readonly currency: string;
    readonly payPeriod: 'MONTH' | 'YEAR';
    readonly grossNet: 'GROSS' | 'NET';
  };
  readonly fx: FxRate | null; // required iff salary currency ≠ scheme currency and base is a percent
  readonly vacancyUrgent: boolean;
  readonly sourcerId: UserId; // tranche 1 (BONUS-04)
  readonly ownerId: UserId; // tranche 2 provisional; fixed at PROBATION_PASSED
  readonly manualSplit:
    readonly { readonly userId: UserId; readonly percentBp: number }[] | null;
  readonly formerEmployeeWithin12Months: boolean; // BONUS-11
  readonly selfReferralRecruiterIds: readonly UserId[]; // BONUS-05 blocked unless approved
  readonly expectedStartDate: KyivDate;
  readonly probationDays: number;
}
export interface PlannedRecipient {
  readonly userId: UserId;
  readonly percentBp: number;
  readonly amountMinor: bigint;
  readonly hold: 'SELF_REFERRAL' | null;
}
export interface PlannedTranche {
  readonly index: number;
  readonly trigger: TrancheTrigger;
  readonly percentBp: number;
  readonly amountMinor: bigint;
  readonly expectedDueDate: KyivDate;
  readonly recipients: readonly PlannedRecipient[];
}
export type BonusComputation =
  | { readonly kind: 'BLOCKED'; readonly reason: 'REHIRE_WITHIN_12_MONTHS' }
  | {
      readonly kind: 'COMPUTED';
      readonly amountSource: 'VACANCY_AMOUNT' | 'SCHEME';
      readonly baseMinor: bigint;
      readonly totalMinor: bigint;
      readonly currency: string;
      readonly fxRateUsed: FxRate | null;
      readonly multiplierBp: number;
      readonly tranches: readonly PlannedTranche[];
    };

/** Integer maths only; one half-up rounding of the total; last tranche/recipient takes the remainder so parts sum exactly. */
export declare function compute(input: BonusComputeInput): BonusComputation;

export interface TrancheState {
  readonly id: string;
  readonly kind: 'TRANCHE' | 'ADJUSTMENT';
  readonly index: number;
  readonly trigger: TrancheTrigger | null;
  readonly status: TrancheStatus;
  readonly statusBeforeHold: TrancheStatus | null;
  readonly amountMinor: bigint;
  readonly recipientId: UserId;
  readonly paid: boolean;
}
export interface BonusFacts {
  readonly today: KyivDate;
  readonly probation: {
    readonly status: 'ACTIVE' | 'PASSED' | 'FAILED';
    readonly startDate: KyivDate;
    readonly plannedEndDate: KyivDate;
    readonly actualEndDate: KyivDate | null;
    readonly probationDays: number;
  } | null;
  readonly applicationClosedBeforeProbation: boolean; // rejected/withdrawn after offer acceptance
  readonly currentOwnerId: UserId;
  readonly clawback: ClawbackPolicy;
  readonly minDaysForTranche1: number | null;
}
export type TrancheChangeReason =
  | 'TRIGGER_REACHED'
  | 'PROBATION_FAILED'
  | 'LEFT_WITHIN_MIN_DAYS'
  | 'APPLICATION_CLOSED'
  | 'CLAWBACK'
  | 'RECIPIENT_FIXED';
export interface TrancheChange {
  readonly trancheId: string;
  readonly from: TrancheStatus;
  readonly to: TrancheStatus;
  readonly reason: TrancheChangeReason;
  readonly recipientId: UserId | null;
  readonly clawbackAmountMinor: bigint | null;
  readonly expectedDueDate: KyivDate | null;
}
/** Deterministic and idempotent: re-running with the same facts after applying the changes yields []. */
export declare function evaluateTriggers(
  tranches: readonly TrancheState[],
  facts: BonusFacts,
): readonly TrancheChange[];

/** BONUS-16 rate limit (≤ 1 change per 2 months per vacancy). Edge rules are parameters until the owner decides (⚠ OPEN). */
export interface VacancyRewardChangePolicy {
  readonly firstSetCounts: boolean; // ⚠ OPEN
  readonly window:
    | { readonly kind: 'CALENDAR_MONTHS'; readonly months: 2 }
    | { readonly kind: 'DAYS'; readonly days: 60 }; // ⚠ OPEN
  readonly typoFixWindowHours: number | null; // ⚠ OPEN (e.g. 24, or null = no grace)
}
export interface VacancyRewardChange {
  readonly at: Date;
  readonly isFirstSet: boolean;
}
export type VacancyRewardDecision =
  | { readonly allowed: true; readonly countsTowardLimit: boolean }
  | {
      readonly allowed: false;
      readonly code: 'VACANCY_BONUS_CHANGE_TOO_SOON';
      readonly nextAllowedAt: Date;
    };
export declare function vacancyRewardChangeAllowed(
  history: readonly VacancyRewardChange[],
  now: Date,
  policy: VacancyRewardChangePolicy,
): VacancyRewardDecision;
```

- Service `bonus.setVacancyReward(ctx, vacancyId, { amount, reason })` (Admin aal2): scoped fetch `FOR UPDATE` (404) → `vacancy.bonus.update` (403) → `vacancyRewardChangeAllowed` on history from `entity_event` `vacancy.bonus_amount_changed` (409) → update vacancy columns + event (old → new, actor, reason) + audit in one transaction. Existing `bonus_snapshot` rows are never touched (BONUS-02; `REVOKE UPDATE` on `bonus_snapshot` from `app_rw`, DG-19). Offer acceptance reads the vacancy row `FOR UPDATE` before computing the snapshot, so a reward change and an acceptance can't interleave. Clone must not reset the limit: either it doesn't copy the reward or it inherits the history ⚠ OWNER (DG-19).
- Bonus separation of duties (DG-19, owner-confirmed 2026-10-31; Head Recruiters can be sourcer/owner and earn bonuses, approved by another HREC of the vertical or an Admin): approve, hold/release, mark paid, adjust, self-referral approval, split and reassign-to-self require actor ≠ beneficiary → 403 `SELF_BENEFIT_FORBIDDEN`. DB CHECKs: `bonus_tranche.approved_by <> recipient_id`, `paid_by <> recipient_id`.
- Base: PERCENT_OF_MONTHLY with YEAR `pay_period` → annual / 12; PERCENT_OF_ANNUAL with MONTH salary → monthly × 12; FX applied before percent (BONUS-03), rate stored.
- ⚠ OPEN: gross vs net as base; allowed pay periods (MONTH/YEAR only?); FX rate source (Admin-entered table vs. NBU API); manual split semantics; clawback on unpaid tranche 1.

### 8.3 Candidate vertical transfer — service (CAND-06, owner 2026-10-31)

- `candidate.transferVertical(ctx, candidateId, { toVerticalId, newOwnerId, reason })`: scoped fetch `FOR UPDATE` (404) → `candidate.transfer_vertical` in the **source** vertical (403) → no active applications (409 `CANDIDATE_HAS_ACTIVE_APPLICATIONS`) → `newOwnerId` holds REC/HREC in the target vertical → update `vertical_id`, `owner_id` (sourcer unchanged) → event `candidate.vertical_transferred` + audit + change feed on both vertical topics.
- ⚠ OWNER: defaults pending (role required only in the source vertical; blocked while active applications exist; sourcer unchanged; new owner picked in the dialog). Dedupe stays company-wide.

## 9. Entity names for `docs/erd.md` (database-engineer baseline + additions)

ERD renames (§6.1 C1–C26) are **accepted** and used in these docs: `max_stage_reached`, `vacancy_recruiter.user_id`, `bonus_tranche.recipient_id` / `due_date` / `payout_period_id`, `sensitivity`, `vacancy_stage_count.count`, `polygraph.hr_outcome` / `review_status`, `offer.pay_period`, `candidate.former_employee` + `former_employee_left_on`, `bonus_snapshot.voided_at/voided_by`, `change_feed.mutation_id` (no actor column).

| Table                                                                                     | Status             | Notes from these docs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vertical`                                                                                | baseline           | no `is_active` (never deactivated, owner 2026-10-31); `vacancy_approval_enabled` (kept, inert since D89; D2 superseded), `auto_routing_enabled` (ROUTE-09), `default_bonus_scheme_id`; polygraph review is mandatory, so no flag                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `app_user`                                                                                | baseline           | `is_active`, `timezone` default `Europe/Kyiv`, `auth_user_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `user_role`                                                                               | baseline           | `role text` (no pg enum, ROLE-04), `vertical_id` null only for ADMIN/FINANCE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `user_invite`                                                                             | **new**            | SHA-256 of a 256-bit token, `expires_at` (72 h, ROLE-05), `accepted_at`, `revoked_at`, roles to grant; atomic consume (DG-07)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `team_lead_priority`                                                                      | baseline           | unique (user, vertical)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `position`                                                                                | baseline           | per vertical = routing group                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `vacancy`                                                                                 | baseline           | `status`, `team_lead_id` null (recruiter-initiated), `headcount`, `hires_count`, `priority_flag`, `priority_override`, `probation_days` ≤ 90, `bonus_scheme_id`, `bonus_amount_minor` + `bonus_currency` (BONUS-16, nullable), `bonus_amount_changed_at`, `source` APP/TELEGRAM_BOT, `created_by`, soft delete                                                                                                                                                                                                                                                                                                                                                 |
| `vacancy_recruiter`                                                                       | baseline           | (vacancy_id, user_id)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `candidate`                                                                               | baseline           | `vertical_id` (exactly one, CAND-06), `owner_id` (talent-pool owner, set on transfer), `sourcer_id`, `sourcer_since`, `last_activity_at` (BONUS-05 window), `former_employee` + `former_employee_left_on`, `referrer_user_id`, normalized dedupe keys with **unique partial indexes** (email, phone, Telegram, LinkedIn; `WHERE deleted_at IS NULL AND purged_at IS NULL`, DG-19 race-proof sourcing credit — ⚠ OWNER: this makes CAND-02 duplicates impossible to create rather than only warned), consent, soft delete, `purged_at`; `last_activity_at` counts only pipeline actions, not comments or views (DG-19) ⚠ OWNER (BONUS-05 meaning of 'activity') |
| `candidate_file`                                                                          | baseline           | version, `file_object_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `application`                                                                             | baseline           | `stage`, `max_stage_reached`, `version`, `vertical_id`, `position_id`, `team_lead_id` (denorm), `owner_id`, `sourcer_id`, `source_type` DIRECT/POSITION/ROUTED, `tl_decision`, `routed_from_application_id`, `reactivated_from_application_id`, `closed_reason_code`, `routed`, `submitted_at`, `stage_entered_at`, `last_activity_at`, soft delete                                                                                                                                                                                                                                                                                                            |
| `interview`, `reschedule_request`                                                         | baseline           | §9 of state machine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `polygraph`                                                                               | baseline           | one row per **attempt**: `attempt_no`, partial unique (one non-final attempt per application), `hr_outcome`, `review_status` (PENDING/CONFIRMED/NOT_CONFIRMED), `reviewed_by`, `review_comment` (nulled on purge); closed attempts immutable; `hr_user_id`, `location_id`/`address`, `result_file_id`, `outcome`, status                                                                                                                                                                                                                                                                                                                                       |
| `polygraph_location`                                                                      | **new**            | Admin-managed rooms (POLY-02)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `offer`                                                                                   | baseline           | versioned, money minor + currency, `gross_net`, `pay_period`, `probation_days`, `valid_until`, `letter_file_id`, `email_status`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `offer_template`                                                                          | **new**            | Admin-managed merge-field template (OFFER-02)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `probation`                                                                               | baseline           | `UNIQUE (application_id)`; `start_date`, `probation_days`, `planned_end_date`, `actual_end_date`, status; PROB-05 trigger also freezes `start_date`/`probation_days` after start (DG-18)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `bonus_scheme`, `bonus_snapshot`, `bonus_tranche`, `payout_period`                        | baseline           | snapshot insert-only except `UPDATE (voided_at, voided_by)` (DG-19); tranche `approved_by`/`paid_by` with CHECK ≠ `recipient_id` ⚠ OWNER (O-07); snapshot: `amount_source` VACANCY_AMOUNT/SCHEME (BONUS-16), frozen scheme json, fx used; tranche: `kind` TRANCHE/ADJUSTMENT, `recipient_id`, `vertical_id`, `status_before_hold`, `due_date`, `payout_period_id`, `clawback_amount_minor`                                                                                                                                                                                                                                                                     |
| `fx_rate`                                                                                 | **new**            | (date, from, to, rate numeric, source) — BONUS-03 ⚠ source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `rejection_reason`                                                                        | baseline           | §6.4 configurable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `comment`, `comment_mention`                                                              | baseline + **new** | mentions (NOTIF)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `entity_event`                                                                            | baseline           | ADR-003                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `entity_event_pii`                                                                        | **new**            | purgeable side table (ADR-003)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `notification`, `notification_pref`                                                       | baseline           | `dedupe_key`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `notification_delivery`                                                                   | **new**            | outbox per channel (`channel text`), status, attempts, `next_attempt_at`, `provider_message_id`, `dedupe_key`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `audit_log`                                                                               | baseline           | append-only (DG-17), `candidate_id` correlation column (DG-20), purge updates `before/after` only via `app.purge_candidate` (SECURITY DEFINER, owner `app_purge`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `job_run`, `change_feed`                                                                  | baseline           | ADR-004/007; `change_feed` payload has `mutation_id`, no actor (DG-11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `file_object`                                                                             | baseline           | `uploaded_by`, `status`, size, etag, sha256, `scan_status` (DG-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `candidate_vertical_transfer`                                                             | **new**            | append-only transfer history (CAND-06)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `purge_log`                                                                               | **new**            | purge ledger without PII; re-applied after any backup restore (DG-20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `rate_limit_bucket`                                                                       | **new**            | fixed-window limiter (key, window_start, count) (DG-09)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `vacancy_stage_count`, `stat_recruiter_daily`, `stat_vacancy_daily`, `stat_bonus_monthly` | baseline           | ADR-008                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `stat_hr_daily`, `stat_rejection_daily`, `stat_dirty_day`                                 | **new**            | ADR-008                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `saved_filter`                                                                            | **new**            | UI-01 saved filters per user                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `app_setting`                                                                             | **new**            | single row; global defaults: offer validity (D11, global only — not per vertical), cooldown (D6), ownership window (D8), global bonus scheme, retention                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `role_definition`, `role_permission`                                                      | later              | custom roles (ROLE-04), additive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## 10. Hot paths vs PERF budgets (review with performance-engineer)

| Path                               | Query shape                                                                                                                                                                                                                                                                                                            | Budget       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Auth context                       | 1 indexed join                                                                                                                                                                                                                                                                                                         | ≤ 2 ms       |
| Candidate kanban (50/col, filters) | **Sort decided (ERD C13): `ORDER BY stage_entered_at DESC, id DESC` within each stage column**, keyset cursor `(stage_entered_at, id)`; 1 query on `application` with scope predicate on IDX-01/02/03 `(…, stage, stage_entered_at DESC, id DESC) WHERE ACTIVE` (index order = ORDER BY), lateral candidate name/owner | < 150 ms P95 |
| Vacancy grid with mini-funnels     | `ORDER BY updated_at DESC, id DESC` on IDX-23/24; 1 query + counters (or scoped live counts, Q-15)                                                                                                                                                                                                                     | < 150 ms     |
| Candidate list                     | `ORDER BY last_activity_at DESC, id DESC` on IDX-14/15                                                                                                                                                                                                                                                                 | < 150 ms     |
| Rejected archive                   | `ORDER BY closed_at DESC, id DESC` on IDX-09/10                                                                                                                                                                                                                                                                        | < 150 ms     |
| Card detail                        | `Promise.all`: entity (1 query with joins) + first timeline page + available actions                                                                                                                                                                                                                                   | < 100 ms     |
| Stage move                         | 1 tx: lock row, ≤ 8 small writes                                                                                                                                                                                                                                                                                       | < 120 ms     |
| Global search                      | pg_trgm GIN on candidate name/email + scope, `LIMIT 10`                                                                                                                                                                                                                                                                | < 150 ms     |
| Statistics                         | aggregate tables only                                                                                                                                                                                                                                                                                                  | < 150 ms     |

## 11. Designed for later

| Later need                        | Hook now                                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom roles (ROLE-04)            | grants as data, `user_role.role text`                                                                                                                                      |
| Google Calendar (PIPE-04 Phase 6) | `MeetingLinkProvider` in `server/integrations/` — v1 implementation validates a manually entered Meet link; Calendar provider later creates the event and returns the link |
| More verticals                    | everything keyed by `vertical_id`; perf seed uses 10 verticals                                                                                                             |
| `en` locale                       | next-intl structure (ADR-009)                                                                                                                                              |
| Telegram                          | notification channel adapter; `vacancy.source` already supports `TELEGRAM_BOT`                                                                                             |
| Antivirus (Phase 7)               | `file_object.scan_status`                                                                                                                                                  |
