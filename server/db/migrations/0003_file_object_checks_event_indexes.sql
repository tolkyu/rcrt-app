DROP INDEX "app"."user_role_user_idx";--> statement-breakpoint
DROP INDEX "app"."audit_log_occurred_idx";--> statement-breakpoint
DROP INDEX "app"."audit_log_actor_idx";--> statement-breakpoint
DROP INDEX "app"."audit_log_candidate_idx";--> statement-breakpoint
DROP INDEX "app"."entity_event_candidate_idx";--> statement-breakpoint
DROP INDEX "app"."entity_event_vacancy_idx";--> statement-breakpoint
DROP INDEX "app"."entity_event_application_idx";--> statement-breakpoint
DROP INDEX "app"."file_object_cleanup_idx";--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "app"."audit_log" USING btree ("entity_type","entity_id","occurred_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "entity_event_subject_idx" ON "app"."entity_event" USING btree ("subject_type","subject_id","occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "audit_log_occurred_idx" ON "app"."audit_log" USING btree ("occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "app"."audit_log" USING btree ("actor_id","occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "audit_log_candidate_idx" ON "app"."audit_log" USING btree ("candidate_id") WHERE "app"."audit_log"."candidate_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entity_event_candidate_idx" ON "app"."entity_event" USING btree ("candidate_id","occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "app"."entity_event"."candidate_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entity_event_vacancy_idx" ON "app"."entity_event" USING btree ("vacancy_id","occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "app"."entity_event"."vacancy_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entity_event_application_idx" ON "app"."entity_event" USING btree ("application_id","occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "app"."entity_event"."application_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "file_object_cleanup_idx" ON "app"."file_object" USING btree ("status","created_at") WHERE "app"."file_object"."status" = 'PENDING' OR ("app"."file_object"."status" = 'PURGED' AND "app"."file_object"."storage_deleted_at" IS NULL);--> statement-breakpoint
ALTER TABLE "app"."file_object" ADD CONSTRAINT "file_object_bucket_chk" CHECK ("app"."file_object"."bucket" IN ('cv','polygraph','offer','attachment'));--> statement-breakpoint
ALTER TABLE "app"."file_object" ADD CONSTRAINT "file_object_scan_status_chk" CHECK ("app"."file_object"."scan_status" IN ('NOT_SCANNED'));--> statement-breakpoint
INSERT INTO app.app_setting DEFAULT VALUES ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- app_rw reads sessions only through app.auth_session_status (0002); drop the schema USAGE left by 0000.
RESET ROLE;
DO $auth_usage$
BEGIN
  IF to_regnamespace('auth') IS NOT NULL AND has_schema_privilege('app_rw', 'auth', 'USAGE') THEN
    REVOKE USAGE ON SCHEMA auth FROM app_rw;
  END IF;
END
$auth_usage$;
SET LOCAL ROLE app_migrator;
