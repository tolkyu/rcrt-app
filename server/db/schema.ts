import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  inet,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const app = pgSchema('app');
const instant = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });
const timestamps = () => ({
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});
const version = () => integer('version').notNull().default(1);
const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});
export const roleCodes = [
  'ADMIN',
  'HEAD_RECRUITER',
  'RECRUITER',
  'HEAD_HR',
  'HR',
  'TEAM_LEAD',
  'FINANCE',
] as const;
export const actorKinds = ['USER', 'SYSTEM', 'ADMIN_FORCE'] as const;

export const vertical = app.table(
  'vertical',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    vacancyApprovalEnabled: boolean('vacancy_approval_enabled')
      .notNull()
      .default(false),
    autoRoutingEnabled: boolean('auto_routing_enabled').notNull().default(true),
    version: version(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('vertical_name_uq').on(sql`lower(${t.name})`),
    check('vertical_name_chk', sql`length(trim(${t.name})) > 0`),
    check('vertical_version_chk', sql`${t.version} > 0`),
  ],
);

export const appUser = app.table(
  'app_user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authUserId: uuid('auth_user_id').unique('app_user_auth_user_id_uq'),
    email: text('email').notNull().unique('app_user_email_uq'),
    fullName: text('full_name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    activatedAt: instant('activated_at'),
    deactivatedAt: instant('deactivated_at'),
    deactivatedBy: uuid('deactivated_by').references(
      (): AnyPgColumn => appUser.id,
      { onDelete: 'restrict' },
    ),
    timezone: text('timezone').notNull().default('Europe/Kyiv'),
    lastLoginAt: instant('last_login_at'),
    /** Set after 5 failed TOTP checks; until then the session counts as aal1 (SEC-AUTH-3, T4-F04). */
    mfaLockedUntil: instant('mfa_locked_until'),
    createdBy: uuid('created_by').references((): AnyPgColumn => appUser.id, {
      onDelete: 'restrict',
    }),
    version: version(),
    ...timestamps(),
  },
  (t) => [
    check(
      'app_user_email_chk',
      sql`${t.email} = lower(trim(${t.email})) AND ${t.email} ~ '^[^[:space:]@]+@[^[:space:]@]+$'`,
    ),
    check(
      'app_user_active_chk',
      sql`${t.isActive} = (${t.deactivatedAt} IS NULL)`,
    ),
    check(
      'app_user_deactivated_by_chk',
      sql`${t.deactivatedBy} IS NULL OR ${t.deactivatedAt} IS NOT NULL`,
    ),
    check('app_user_name_chk', sql`length(trim(${t.fullName})) > 0`),
    check('app_user_version_chk', sql`${t.version} > 0`),
    /** «Користувачі та ролі» order and keyset: active first, then ПІБ in Ukrainian collation (ROLE-05-4). */
    index('app_user_list_idx').on(
      sql`(NOT ${t.isActive})`,
      sql`${t.fullName} COLLATE "uk-UA-x-icu"`,
      t.id,
    ),
  ],
);

export const userRole = app.table(
  'user_role',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
    verticalId: uuid('vertical_id').references(() => vertical.id, {
      onDelete: 'restrict',
    }),
    createdAt: instant('created_at').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => appUser.id, {
      onDelete: 'restrict',
    }),
  },
  (t) => [
    unique('user_role_uq')
      .on(t.userId, t.role, t.verticalId)
      .nullsNotDistinct(),
    index('user_role_team_lead_idx')
      .on(t.verticalId, t.userId)
      .where(sql`${t.role} = 'TEAM_LEAD'`),
    check(
      'user_role_scope_chk',
      sql`(${t.role} IN ('ADMIN','FINANCE') AND ${t.verticalId} IS NULL) OR (${t.role} IN ('HEAD_RECRUITER','RECRUITER','HEAD_HR','HR','TEAM_LEAD') AND ${t.verticalId} IS NOT NULL) OR ${t.role} ~ '^custom:[a-z0-9_]+$'`,
    ),
  ],
);

export const userInvite = app.table(
  'user_invite',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'restrict' }),
    tokenHash: bytes('token_hash')
      .notNull()
      .unique('user_invite_token_hash_uq'),
    roles: jsonb('roles')
      .$type<{ role: string; verticalId: string | null }[]>()
      .notNull(),
    status: text('status', { enum: ['PENDING', 'ACCEPTED', 'REVOKED'] })
      .notNull()
      .default('PENDING'),
    sentAt: instant('sent_at').notNull(),
    expiresAt: instant('expires_at').notNull(),
    resendCount: smallint('resend_count').notNull().default(0),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => appUser.id, { onDelete: 'restrict' }),
    acceptedAt: instant('accepted_at'),
    revokedAt: instant('revoked_at'),
    revokedBy: uuid('revoked_by').references(() => appUser.id, {
      onDelete: 'restrict',
    }),
    createdAt: instant('created_at').notNull().defaultNow(),
    version: version(),
  },
  (t) => [
    uniqueIndex('user_invite_pending_uq')
      .on(t.userId)
      .where(sql`${t.status} = 'PENDING'`),
    index('user_invite_latest_idx').on(
      t.userId,
      sql`(${t.status} = 'PENDING') DESC`,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    check('user_invite_hash_chk', sql`octet_length(${t.tokenHash}) = 32`),
    check(
      'user_invite_roles_chk',
      sql`jsonb_typeof(${t.roles}) = 'array' AND jsonb_array_length(${t.roles}) > 0`,
    ),
    check(
      'user_invite_expiry_chk',
      sql`${t.expiresAt} = ${t.sentAt} + interval '72 hours'`,
    ),
    check('user_invite_resend_chk', sql`${t.resendCount} >= 0`),
    check(
      'user_invite_status_chk',
      sql`(${t.status} = 'PENDING' AND ${t.acceptedAt} IS NULL AND ${t.revokedAt} IS NULL AND ${t.revokedBy} IS NULL) OR (${t.status} = 'ACCEPTED' AND ${t.acceptedAt} IS NOT NULL AND ${t.revokedAt} IS NULL AND ${t.revokedBy} IS NULL) OR (${t.status} = 'REVOKED' AND ${t.acceptedAt} IS NULL AND ${t.revokedAt} IS NOT NULL AND ${t.revokedBy} IS NOT NULL)`,
    ),
    check('user_invite_version_chk', sql`${t.version} > 0`),
  ],
);

export const teamLeadPriority = app.table(
  'team_lead_priority',
  {
    verticalId: uuid('vertical_id')
      .notNull()
      .references(() => vertical.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'restrict' }),
    priority: smallint('priority').notNull(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => appUser.id, {
      onDelete: 'restrict',
    }),
    version: version(),
  },
  (t) => [
    primaryKey({ columns: [t.verticalId, t.userId] }),
    check(
      'team_lead_priority_priority_chk',
      sql`${t.priority} BETWEEN 0 AND 99`,
    ),
    check('team_lead_priority_version_chk', sql`${t.version} > 0`),
  ],
);

export const appSetting = app.table(
  'app_setting',
  {
    id: smallint('id').primaryKey().default(1),
    offerValidityDays: smallint('offer_validity_days').notNull().default(5),
    routingRejectionCooldownDays: smallint('routing_rejection_cooldown_days')
      .notNull()
      .default(180),
    sourcingOwnershipWindowDays: smallint('sourcing_ownership_window_days')
      .notNull()
      .default(180),
    retentionRejectedMonths: smallint('retention_rejected_months'),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => appUser.id, {
      onDelete: 'restrict',
    }),
    version: version(),
  },
  (t) => [
    check('app_setting_singleton_chk', sql`${t.id} = 1`),
    check(
      'app_setting_days_chk',
      sql`${t.offerValidityDays} > 0 AND ${t.routingRejectionCooldownDays} >= 0 AND ${t.sourcingOwnershipWindowDays} > 0 AND (${t.retentionRejectedMonths} IS NULL OR ${t.retentionRejectedMonths} > 0)`,
    ),
    check('app_setting_version_chk', sql`${t.version} > 0`),
  ],
);

export const savedFilter = app.table(
  'saved_filter',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'restrict' }),
    screen: text('screen', { enum: ['DASHBOARD'] })
      .notNull()
      .default('DASHBOARD'),
    name: text('name').notNull(),
    filters: jsonb('filters').$type<Record<string, unknown>>().notNull(),
    version: version(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('saved_filter_name_uq').on(
      t.userId,
      t.screen,
      sql`lower(${t.name})`,
    ),
    check('saved_filter_screen_chk', sql`${t.screen} = 'DASHBOARD'`),
    check(
      'saved_filter_filters_chk',
      sql`jsonb_typeof(${t.filters}) = 'object'`,
    ),
    check('saved_filter_name_chk', sql`length(trim(${t.name})) > 0`),
    check('saved_filter_version_chk', sql`${t.version} > 0`),
  ],
);

export const entityEvent = app.table(
  'entity_event',
  {
    id: bigint('id', { mode: 'bigint' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    occurredAt: instant('occurred_at').notNull(),
    actorId: uuid('actor_id').references(() => appUser.id, {
      onDelete: 'restrict',
    }),
    actorKind: text('actor_kind', { enum: actorKinds }).notNull(),
    type: text('type').notNull(),
    verticalId: uuid('vertical_id').references(() => vertical.id, {
      onDelete: 'restrict',
    }),
    vacancyId: uuid('vacancy_id'),
    candidateId: uuid('candidate_id'),
    applicationId: uuid('application_id'),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    payload: jsonb('payload')
      .$type<Record<string, unknown> & { v: number }>()
      .notNull(),
    sensitivity: text('sensitivity', {
      enum: ['GENERAL', 'SALARY', 'POLYGRAPH', 'BONUS'],
    })
      .notNull()
      .default('GENERAL'),
    requestId: uuid('request_id'),
  },
  (t) => [
    check('entity_event_type_chk', sql`${t.type} ~ '^[a-z_]+[.][a-z_]+$'`),
    check(
      'entity_event_actor_chk',
      sql`${t.actorKind} IN ('USER','SYSTEM','ADMIN_FORCE') AND ((${t.actorKind} = 'SYSTEM') = (${t.actorId} IS NULL))`,
    ),
    check(
      'entity_event_payload_chk',
      sql`jsonb_typeof(${t.payload}) = 'object' AND ${t.payload} ? 'v' AND jsonb_typeof(${t.payload}->'v') = 'number'`,
    ),
    check(
      'entity_event_sensitivity_chk',
      sql`${t.sensitivity} IN ('GENERAL','SALARY','POLYGRAPH','BONUS')`,
    ),
    /** Plain DESC (NULLS FIRST) so `ORDER BY occurred_at DESC, id DESC` reads the index without a sort. */
    index('entity_event_candidate_idx')
      .on(
        t.candidateId,
        t.occurredAt.desc().nullsFirst(),
        t.id.desc().nullsFirst(),
      )
      .where(sql`${t.candidateId} IS NOT NULL`),
    index('entity_event_vacancy_idx')
      .on(
        t.vacancyId,
        t.occurredAt.desc().nullsFirst(),
        t.id.desc().nullsFirst(),
      )
      .where(sql`${t.vacancyId} IS NOT NULL`),
    index('entity_event_application_idx')
      .on(
        t.applicationId,
        t.occurredAt.desc().nullsFirst(),
        t.id.desc().nullsFirst(),
      )
      .where(sql`${t.applicationId} IS NOT NULL`),
    index('entity_event_type_idx').on(t.type, t.occurredAt),
    index('entity_event_subject_idx').on(
      t.subjectType,
      t.subjectId,
      t.occurredAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
  ],
);

export const entityEventPii = app.table(
  'entity_event_pii',
  {
    eventId: bigint('event_id', { mode: 'bigint' })
      .primaryKey()
      .references(() => entityEvent.id, { onDelete: 'restrict' }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    check('entity_event_pii_data_chk', sql`jsonb_typeof(${t.data}) = 'object'`),
  ],
);

export const auditLog = app.table(
  'audit_log',
  {
    id: bigint('id', { mode: 'bigint' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    /** Millisecond precision only (writers pass JS Dates, never SQL `now()`): keyset cursors round-trip it as ISO strings. */
    occurredAt: instant('occurred_at').notNull(),
    actorId: uuid('actor_id').references(() => appUser.id, {
      onDelete: 'restrict',
    }),
    actorKind: text('actor_kind', { enum: actorKinds }).notNull(),
    action: text('action').notNull(),
    result: text('result', { enum: ['SUCCESS', 'DENIED'] })
      .notNull()
      .default('SUCCESS'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    candidateId: uuid('candidate_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    details: jsonb('details'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    requestId: uuid('request_id'),
  },
  (t) => [
    check('audit_log_action_chk', sql`${t.action} ~ '^[a-z_]+[.][a-z_]+$'`),
    check(
      'audit_log_actor_chk',
      sql`${t.actorKind} IN ('USER','SYSTEM','ADMIN_FORCE') AND ((${t.actorKind} = 'SYSTEM') = (${t.actorId} IS NULL))`,
    ),
    check('audit_log_result_chk', sql`${t.result} IN ('SUCCESS','DENIED')`),
    index('audit_log_occurred_idx').on(
      t.occurredAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index('audit_log_actor_idx').on(
      t.actorId,
      t.occurredAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index('audit_log_action_idx').on(
      t.action,
      t.occurredAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index('audit_log_result_idx').on(
      t.result,
      t.occurredAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index('audit_log_entity_type_idx').on(
      t.entityType,
      t.occurredAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index('audit_log_entity_idx').on(
      t.entityType,
      t.entityId,
      t.occurredAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index('audit_log_candidate_idx')
      .on(t.candidateId)
      .where(sql`${t.candidateId} IS NOT NULL`),
  ],
);

export const fileObject = app.table(
  'file_object',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bucket: text('bucket', {
      enum: ['cv', 'polygraph', 'offer', 'attachment'],
    }).notNull(),
    storageKey: text('storage_key')
      .notNull()
      .unique('file_object_storage_key_uq'),
    verticalId: uuid('vertical_id')
      .notNull()
      .references(() => vertical.id, { onDelete: 'restrict' }),
    ownerType: text('owner_type', {
      enum: ['candidate', 'polygraph', 'offer'],
    }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    status: text('status', { enum: ['PENDING', 'READY', 'REJECTED', 'PURGED'] })
      .notNull()
      .default('PENDING'),
    originalFilename: text('original_filename'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    sha256: bytes('sha256'),
    etag: text('etag'),
    scanStatus: text('scan_status', { enum: ['NOT_SCANNED'] })
      .notNull()
      .default('NOT_SCANNED'),
    uploadedBy: uuid('uploaded_by').references(() => appUser.id, {
      onDelete: 'restrict',
    }),
    createdAt: instant('created_at').notNull().defaultNow(),
    completedAt: instant('completed_at'),
    purgedAt: instant('purged_at'),
    storageDeletedAt: instant('storage_deleted_at'),
    version: version(),
  },
  (t) => [
    check(
      'file_object_bucket_chk',
      sql`${t.bucket} IN ('cv','polygraph','offer','attachment')`,
    ),
    check(
      'file_object_scan_status_chk',
      sql`${t.scanStatus} IN ('NOT_SCANNED')`,
    ),
    check(
      'file_object_size_chk',
      sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= CASE ${t.bucket} WHEN 'polygraph' THEN 15728640 WHEN 'offer' THEN 5242880 WHEN 'cv' THEN 10485760 WHEN 'attachment' THEN 10485760 ELSE 0 END`,
    ),
    check(
      'file_object_mime_chk',
      sql`(${t.bucket} IN ('polygraph','offer') AND ${t.mimeType} = 'application/pdf') OR (${t.bucket} IN ('cv','attachment') AND ${t.mimeType} IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')) OR (${t.bucket} = 'attachment' AND ${t.mimeType} IN ('image/png','image/jpeg'))`,
    ),
    check(
      'file_object_status_chk',
      sql`${t.status} IN ('PENDING','READY','REJECTED','PURGED') AND (${t.status} <> 'READY' OR ${t.completedAt} IS NOT NULL) AND (${t.status} <> 'PURGED' OR (${t.originalFilename} IS NULL AND ${t.sha256} IS NULL AND ${t.etag} IS NULL AND ${t.purgedAt} IS NOT NULL))`,
    ),
    check(
      'file_object_owner_chk',
      sql`${t.ownerType} IN ('candidate','polygraph','offer') AND (${t.bucket} = 'offer' OR ${t.uploadedBy} IS NOT NULL)`,
    ),
    check(
      'file_object_key_chk',
      sql`${t.storageKey} = ${t.verticalId}::text || '/' || ${t.id}::text`,
    ),
    check(
      'file_object_hash_chk',
      sql`${t.sha256} IS NULL OR octet_length(${t.sha256}) = 32`,
    ),
    check('file_object_version_chk', sql`${t.version} > 0`),
    index('file_object_cleanup_idx')
      .on(t.status, t.createdAt)
      .where(
        sql`${t.status} = 'PENDING' OR (${t.status} = 'PURGED' AND ${t.storageDeletedAt} IS NULL)`,
      ),
  ],
);

export const changeFeed = app.table(
  'change_feed',
  {
    id: bigint('id', { mode: 'bigint' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    createdAt: instant('created_at').notNull().defaultNow(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    verticalId: uuid('vertical_id').references(() => vertical.id, {
      onDelete: 'restrict',
    }),
    userId: uuid('user_id').references(() => appUser.id, {
      onDelete: 'restrict',
    }),
    kind: text('kind').notNull(),
    mutationId: uuid('mutation_id'),
  },
  (t) => [
    check(
      'change_feed_topic_chk',
      sql`num_nonnulls(${t.verticalId}, ${t.userId}) = 1`,
    ),
    index('change_feed_created_idx').on(t.createdAt),
  ],
);

export const jobRun = app.table(
  'job_run',
  {
    id: bigint('id', { mode: 'bigint' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    jobName: text('job_name').notNull(),
    runKey: text('run_key').notNull(),
    status: text('status', { enum: ['RUNNING', 'SUCCEEDED', 'FAILED'] })
      .notNull()
      .default('RUNNING'),
    leaseUntil: instant('lease_until').notNull(),
    attempt: smallint('attempt').notNull().default(1),
    startedAt: instant('started_at').notNull(),
    finishedAt: instant('finished_at'),
    stats: jsonb('stats').notNull().default({}),
    errorCode: text('error_code'),
  },
  (t) => [
    unique('job_run_key_uq').on(t.jobName, t.runKey),
    check(
      'job_run_status_chk',
      sql`${t.status} IN ('RUNNING','SUCCEEDED','FAILED') AND ((${t.status} = 'RUNNING') = (${t.finishedAt} IS NULL))`,
    ),
    check('job_run_attempt_chk', sql`${t.attempt} > 0`),
    check('job_run_stats_chk', sql`jsonb_typeof(${t.stats}) = 'object'`),
  ],
);

export const rateLimitBucket = app.table(
  'rate_limit_bucket',
  {
    key: text('key').notNull(),
    windowStart: instant('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    check('rate_limit_bucket_count_chk', sql`${t.count} >= 0`),
    index('rate_limit_bucket_window_idx').on(t.windowStart),
  ],
);

/** App-side session state keyed by the Supabase session id: idle/absolute limits and revocation (SEC-AUTH-4, DG-05). */
export const userSession = app.table(
  'user_session',
  {
    sessionId: uuid('session_id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'restrict' }),
    method: text('method', {
      enum: ['MAGIC_LINK', 'GOOGLE', 'INVITE', 'DEV'],
    }).notNull(),
    startedAt: instant('started_at').notNull(),
    lastSeenAt: instant('last_seen_at').notNull(),
    endedAt: instant('ended_at'),
    endReason: text('end_reason', {
      enum: ['LOGOUT', 'IDLE', 'ABSOLUTE', 'DEACTIVATED', 'USER', 'MFA_RESET'],
    }),
    /** Set only by our lockout-guarded TOTP verify; a GoTrue aal2 claim alone is not trusted (SEC-AUTH-R02). */
    mfaVerifiedAt: instant('mfa_verified_at'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [
    index('user_session_user_open_idx')
      .on(t.userId, t.lastSeenAt.desc().nullsFirst())
      .where(sql`${t.endedAt} IS NULL`),
    check(
      'user_session_method_chk',
      sql`${t.method} IN ('MAGIC_LINK','GOOGLE','INVITE','DEV')`,
    ),
    check(
      'user_session_end_chk',
      sql`(${t.endedAt} IS NULL) = (${t.endReason} IS NULL)`,
    ),
    check(
      'user_session_reason_chk',
      sql`${t.endReason} IS NULL OR ${t.endReason} IN ('LOGOUT','IDLE','ABSOLUTE','DEACTIVATED','USER','MFA_RESET')`,
    ),
    check('user_session_time_chk', sql`${t.lastSeenAt} >= ${t.startedAt}`),
  ],
);

export const authSessionStatus = app
  .view('auth_session_status', {
    id: uuid('id').notNull(),
    userId: uuid('user_id').notNull(),
    notAfter: instant('not_after'),
    createdAt: instant('created_at'),
  })
  .existing();

/** Verified TOTP factors only; app_rw has no access to `auth.mfa_factors` itself (secrets live there). */
export const authMfaTotp = app
  .view('auth_mfa_totp', {
    id: uuid('id').notNull(),
    userId: uuid('user_id').notNull(),
  })
  .existing();
