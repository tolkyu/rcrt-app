DO $bootstrap$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_purge') THEN
    CREATE ROLE app_purge NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN ('app_migrator','app_rw','app_purge') AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication))
     OR EXISTS (SELECT FROM pg_roles WHERE rolname IN ('app_migrator','app_purge') AND rolcanlogin)
     OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rw' AND rolbypassrls)
     OR EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname IN ('app_rw','app_purge','app_migrator')) THEN
    RAISE EXCEPTION 'Unsafe application database role configuration';
  END IF;
END
$bootstrap$;
GRANT app_migrator TO CURRENT_USER WITH SET TRUE;
CREATE SCHEMA "app" AUTHORIZATION app_migrator;
SET LOCAL ROLE app_migrator;

--> statement-breakpoint
CREATE TABLE "app"."app_setting" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"offer_validity_days" smallint DEFAULT 5 NOT NULL,
	"routing_rejection_cooldown_days" smallint DEFAULT 180 NOT NULL,
	"sourcing_ownership_window_days" smallint DEFAULT 180 NOT NULL,
	"retention_rejected_months" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "app_setting_singleton_chk" CHECK ("app"."app_setting"."id" = 1),
	CONSTRAINT "app_setting_days_chk" CHECK ("app"."app_setting"."offer_validity_days" > 0 AND "app"."app_setting"."routing_rejection_cooldown_days" >= 0 AND "app"."app_setting"."sourcing_ownership_window_days" > 0 AND ("app"."app_setting"."retention_rejected_months" IS NULL OR "app"."app_setting"."retention_rejected_months" > 0)),
	CONSTRAINT "app_setting_version_chk" CHECK ("app"."app_setting"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"deactivated_by" uuid,
	"timezone" text DEFAULT 'Europe/Kyiv' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_auth_user_id_uq" UNIQUE("auth_user_id"),
	CONSTRAINT "app_user_email_uq" UNIQUE("email"),
	CONSTRAINT "app_user_email_chk" CHECK ("app"."app_user"."email" = lower(trim("app"."app_user"."email")) AND "app"."app_user"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
	CONSTRAINT "app_user_active_chk" CHECK ("app"."app_user"."is_active" = ("app"."app_user"."deactivated_at" IS NULL)),
	CONSTRAINT "app_user_deactivated_by_chk" CHECK ("app"."app_user"."deactivated_by" IS NULL OR "app"."app_user"."deactivated_at" IS NOT NULL),
	CONSTRAINT "app_user_name_chk" CHECK (length(trim("app"."app_user"."full_name")) > 0),
	CONSTRAINT "app_user_version_chk" CHECK ("app"."app_user"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" uuid,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"result" text DEFAULT 'SUCCESS' NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"candidate_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"details" jsonb,
	"ip" "inet",
	"user_agent" text,
	"request_id" uuid,
	CONSTRAINT "audit_log_action_chk" CHECK ("app"."audit_log"."action" ~ '^[a-z_]+[.][a-z_]+$'),
	CONSTRAINT "audit_log_actor_chk" CHECK ("app"."audit_log"."actor_kind" IN ('USER','SYSTEM','ADMIN_FORCE') AND (("app"."audit_log"."actor_kind" = 'SYSTEM') = ("app"."audit_log"."actor_id" IS NULL))),
	CONSTRAINT "audit_log_result_chk" CHECK ("app"."audit_log"."result" IN ('SUCCESS','DENIED'))
);
--> statement-breakpoint
CREATE TABLE "app"."change_feed" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."change_feed_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"vertical_id" uuid,
	"user_id" uuid,
	"kind" text NOT NULL,
	"mutation_id" uuid,
	CONSTRAINT "change_feed_topic_chk" CHECK (num_nonnulls("app"."change_feed"."vertical_id", "app"."change_feed"."user_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "app"."entity_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."entity_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" uuid,
	"actor_kind" text NOT NULL,
	"type" text NOT NULL,
	"vertical_id" uuid,
	"vacancy_id" uuid,
	"candidate_id" uuid,
	"application_id" uuid,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"sensitivity" text DEFAULT 'GENERAL' NOT NULL,
	"request_id" uuid,
	CONSTRAINT "entity_event_type_chk" CHECK ("app"."entity_event"."type" ~ '^[a-z_]+[.][a-z_]+$'),
	CONSTRAINT "entity_event_actor_chk" CHECK ("app"."entity_event"."actor_kind" IN ('USER','SYSTEM','ADMIN_FORCE') AND (("app"."entity_event"."actor_kind" = 'SYSTEM') = ("app"."entity_event"."actor_id" IS NULL))),
	CONSTRAINT "entity_event_payload_chk" CHECK (jsonb_typeof("app"."entity_event"."payload") = 'object' AND "app"."entity_event"."payload" ? 'v' AND jsonb_typeof("app"."entity_event"."payload"->'v') = 'number'),
	CONSTRAINT "entity_event_sensitivity_chk" CHECK ("app"."entity_event"."sensitivity" IN ('GENERAL','SALARY','POLYGRAPH','BONUS'))
);
--> statement-breakpoint
CREATE TABLE "app"."entity_event_pii" (
	"event_id" bigint PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "entity_event_pii_data_chk" CHECK (jsonb_typeof("app"."entity_event_pii"."data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "app"."file_object" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"vertical_id" uuid NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"original_filename" text,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" "bytea",
	"etag" text,
	"scan_status" text DEFAULT 'NOT_SCANNED' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"storage_deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "file_object_storage_key_uq" UNIQUE("storage_key"),
	CONSTRAINT "file_object_size_chk" CHECK ("app"."file_object"."size_bytes" > 0 AND "app"."file_object"."size_bytes" <= CASE "app"."file_object"."bucket" WHEN 'polygraph' THEN 15728640 WHEN 'offer' THEN 5242880 WHEN 'cv' THEN 10485760 WHEN 'attachment' THEN 10485760 ELSE 0 END),
	CONSTRAINT "file_object_mime_chk" CHECK (("app"."file_object"."bucket" IN ('polygraph','offer') AND "app"."file_object"."mime_type" = 'application/pdf') OR ("app"."file_object"."bucket" IN ('cv','attachment') AND "app"."file_object"."mime_type" IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')) OR ("app"."file_object"."bucket" = 'attachment' AND "app"."file_object"."mime_type" IN ('image/png','image/jpeg'))),
	CONSTRAINT "file_object_status_chk" CHECK ("app"."file_object"."status" IN ('PENDING','READY','REJECTED','PURGED') AND ("app"."file_object"."status" <> 'READY' OR "app"."file_object"."completed_at" IS NOT NULL) AND ("app"."file_object"."status" <> 'PURGED' OR ("app"."file_object"."original_filename" IS NULL AND "app"."file_object"."sha256" IS NULL AND "app"."file_object"."etag" IS NULL AND "app"."file_object"."purged_at" IS NOT NULL))),
	CONSTRAINT "file_object_owner_chk" CHECK ("app"."file_object"."owner_type" IN ('candidate','polygraph','offer') AND ("app"."file_object"."bucket" = 'offer' OR "app"."file_object"."uploaded_by" IS NOT NULL)),
	CONSTRAINT "file_object_key_chk" CHECK ("app"."file_object"."storage_key" = "app"."file_object"."vertical_id"::text || '/' || "app"."file_object"."id"::text),
	CONSTRAINT "file_object_hash_chk" CHECK ("app"."file_object"."sha256" IS NULL OR octet_length("app"."file_object"."sha256") = 32),
	CONSTRAINT "file_object_version_chk" CHECK ("app"."file_object"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."job_run" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."job_run_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job_name" text NOT NULL,
	"run_key" text NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"lease_until" timestamp with time zone NOT NULL,
	"attempt" smallint DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	CONSTRAINT "job_run_key_uq" UNIQUE("job_name","run_key"),
	CONSTRAINT "job_run_status_chk" CHECK ("app"."job_run"."status" IN ('RUNNING','SUCCEEDED','FAILED') AND (("app"."job_run"."status" = 'RUNNING') = ("app"."job_run"."finished_at" IS NULL))),
	CONSTRAINT "job_run_attempt_chk" CHECK ("app"."job_run"."attempt" > 0),
	CONSTRAINT "job_run_stats_chk" CHECK (jsonb_typeof("app"."job_run"."stats") = 'object')
);
--> statement-breakpoint
CREATE TABLE "app"."rate_limit_bucket" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_bucket_key_window_start_pk" PRIMARY KEY("key","window_start"),
	CONSTRAINT "rate_limit_bucket_count_chk" CHECK ("app"."rate_limit_bucket"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."saved_filter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"screen" text DEFAULT 'DASHBOARD' NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_filter_screen_chk" CHECK ("app"."saved_filter"."screen" = 'DASHBOARD'),
	CONSTRAINT "saved_filter_filters_chk" CHECK (jsonb_typeof("app"."saved_filter"."filters") = 'object'),
	CONSTRAINT "saved_filter_name_chk" CHECK (length(trim("app"."saved_filter"."name")) > 0),
	CONSTRAINT "saved_filter_version_chk" CHECK ("app"."saved_filter"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."team_lead_priority" (
	"vertical_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"priority" smallint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "team_lead_priority_vertical_id_user_id_pk" PRIMARY KEY("vertical_id","user_id"),
	CONSTRAINT "team_lead_priority_priority_chk" CHECK ("app"."team_lead_priority"."priority" >= 0),
	CONSTRAINT "team_lead_priority_version_chk" CHECK ("app"."team_lead_priority"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."user_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"roles" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resend_count" smallint DEFAULT 0 NOT NULL,
	"invited_by" uuid NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "user_invite_token_hash_uq" UNIQUE("token_hash"),
	CONSTRAINT "user_invite_hash_chk" CHECK (octet_length("app"."user_invite"."token_hash") = 32),
	CONSTRAINT "user_invite_roles_chk" CHECK (jsonb_typeof("app"."user_invite"."roles") = 'array' AND jsonb_array_length("app"."user_invite"."roles") > 0),
	CONSTRAINT "user_invite_expiry_chk" CHECK ("app"."user_invite"."expires_at" = "app"."user_invite"."sent_at" + interval '72 hours'),
	CONSTRAINT "user_invite_resend_chk" CHECK ("app"."user_invite"."resend_count" >= 0),
	CONSTRAINT "user_invite_status_chk" CHECK (("app"."user_invite"."status" = 'PENDING' AND "app"."user_invite"."accepted_at" IS NULL AND "app"."user_invite"."revoked_at" IS NULL AND "app"."user_invite"."revoked_by" IS NULL) OR ("app"."user_invite"."status" = 'ACCEPTED' AND "app"."user_invite"."accepted_at" IS NOT NULL AND "app"."user_invite"."revoked_at" IS NULL AND "app"."user_invite"."revoked_by" IS NULL) OR ("app"."user_invite"."status" = 'REVOKED' AND "app"."user_invite"."accepted_at" IS NULL AND "app"."user_invite"."revoked_at" IS NOT NULL AND "app"."user_invite"."revoked_by" IS NOT NULL)),
	CONSTRAINT "user_invite_version_chk" CHECK ("app"."user_invite"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."user_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"vertical_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "user_role_uq" UNIQUE NULLS NOT DISTINCT("user_id","role","vertical_id"),
	CONSTRAINT "user_role_scope_chk" CHECK (("app"."user_role"."role" IN ('ADMIN','FINANCE') AND "app"."user_role"."vertical_id" IS NULL) OR ("app"."user_role"."role" IN ('HEAD_RECRUITER','RECRUITER','HEAD_HR','HR','TEAM_LEAD') AND "app"."user_role"."vertical_id" IS NOT NULL) OR "app"."user_role"."role" ~ '^custom:[a-z0-9_]+$')
);
--> statement-breakpoint
CREATE TABLE "app"."vertical" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"vacancy_approval_enabled" boolean DEFAULT false NOT NULL,
	"auto_routing_enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vertical_name_chk" CHECK (length(trim("app"."vertical"."name")) > 0),
	CONSTRAINT "vertical_version_chk" CHECK ("app"."vertical"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."app_setting" ADD CONSTRAINT "app_setting_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."app_user" ADD CONSTRAINT "app_user_deactivated_by_app_user_id_fk" FOREIGN KEY ("deactivated_by") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."app_user" ADD CONSTRAINT "app_user_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD CONSTRAINT "audit_log_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."change_feed" ADD CONSTRAINT "change_feed_vertical_id_vertical_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "app"."vertical"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."change_feed" ADD CONSTRAINT "change_feed_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."entity_event" ADD CONSTRAINT "entity_event_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."entity_event" ADD CONSTRAINT "entity_event_vertical_id_vertical_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "app"."vertical"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."entity_event_pii" ADD CONSTRAINT "entity_event_pii_event_id_entity_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."entity_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."file_object" ADD CONSTRAINT "file_object_vertical_id_vertical_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "app"."vertical"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."file_object" ADD CONSTRAINT "file_object_uploaded_by_app_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."saved_filter" ADD CONSTRAINT "saved_filter_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."team_lead_priority" ADD CONSTRAINT "team_lead_priority_vertical_id_vertical_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "app"."vertical"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."team_lead_priority" ADD CONSTRAINT "team_lead_priority_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."team_lead_priority" ADD CONSTRAINT "team_lead_priority_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_invite" ADD CONSTRAINT "user_invite_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_invite" ADD CONSTRAINT "user_invite_invited_by_app_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_invite" ADD CONSTRAINT "user_invite_revoked_by_app_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_role" ADD CONSTRAINT "user_role_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_role" ADD CONSTRAINT "user_role_vertical_id_vertical_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "app"."vertical"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_role" ADD CONSTRAINT "user_role_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_occurred_idx" ON "app"."audit_log" USING btree ("occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "app"."audit_log" USING btree ("actor_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_candidate_idx" ON "app"."audit_log" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "change_feed_created_idx" ON "app"."change_feed" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "entity_event_candidate_idx" ON "app"."entity_event" USING btree ("candidate_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entity_event_vacancy_idx" ON "app"."entity_event" USING btree ("vacancy_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entity_event_application_idx" ON "app"."entity_event" USING btree ("application_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entity_event_type_idx" ON "app"."entity_event" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "file_object_cleanup_idx" ON "app"."file_object" USING btree ("created_at") WHERE "app"."file_object"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "rate_limit_bucket_window_idx" ON "app"."rate_limit_bucket" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_filter_name_uq" ON "app"."saved_filter" USING btree ("user_id","screen",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "user_invite_pending_uq" ON "app"."user_invite" USING btree ("user_id") WHERE "app"."user_invite"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "user_role_user_idx" ON "app"."user_role" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vertical_name_uq" ON "app"."vertical" USING btree (lower("name"));
--> statement-breakpoint
ALTER TABLE app.rate_limit_bucket SET UNLOGGED;

CREATE FUNCTION app.guard_append_only() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, app AS $guard$
BEGIN
  IF TG_TABLE_NAME = 'entity_event_pii' AND TG_OP = 'DELETE' AND current_user = 'app_purge' THEN
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'audit_log' AND TG_OP = 'UPDATE' AND current_user = 'app_purge' THEN
    IF NEW.before IS NULL AND NEW.after IS NULL
      AND (to_jsonb(NEW) - 'before' - 'after') = (to_jsonb(OLD) - 'before' - 'after') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'APPEND_ONLY', DETAIL = TG_TABLE_NAME;
END
$guard$;

DO $protection$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['entity_event','entity_event_pii','audit_log'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.guard_append_only()', target || '_append_only', target);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.guard_append_only()', target || '_no_truncate', target);
  END LOOP;
  FOR target IN SELECT tablename FROM pg_tables WHERE schemaname = 'app' LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', target);
  END LOOP;
END
$protection$;

REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA app REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA app REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO app_rw, app_purge;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.user_role, app.user_invite, app.team_lead_priority, app.saved_filter, app.change_feed, app.job_run, app.rate_limit_bucket TO app_rw;
GRANT SELECT, INSERT, UPDATE ON app.vertical, app.app_user, app.app_setting, app.file_object TO app_rw;
GRANT SELECT, INSERT ON app.entity_event, app.entity_event_pii, app.audit_log TO app_rw;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app TO app_rw;
GRANT SELECT, DELETE ON app.entity_event_pii TO app_purge;
GRANT SELECT, UPDATE (before, after) ON app.audit_log TO app_purge;
CREATE POLICY entity_event_pii_purge_select ON app.entity_event_pii FOR SELECT TO app_purge USING (true);
CREATE POLICY entity_event_pii_purge_delete ON app.entity_event_pii FOR DELETE TO app_purge USING (true);
CREATE POLICY audit_log_purge_select ON app.audit_log FOR SELECT TO app_purge USING (true);
CREATE POLICY audit_log_purge_update ON app.audit_log FOR UPDATE TO app_purge USING (true) WITH CHECK (true);

-- Supabase-only integrations are installed only when those real services exist.
RESET ROLE;
DO $supabase$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA app FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM %I', client_role);
    END IF;
  END LOOP;
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA auth TO app_rw;
    GRANT SELECT ON auth.sessions TO app_rw;
  END IF;
END
$supabase$;
SET LOCAL ROLE app_migrator;
