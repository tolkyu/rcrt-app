ALTER TABLE "app"."position" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."position" ADD CONSTRAINT "position_version_chk" CHECK ("app"."position"."version" > 0);--> statement-breakpoint
-- Runtime may create positions and change only name, is_active and the version/updated_at bookkeeping; vertical_id and created_by stay immutable, no DELETE.
GRANT INSERT ON "app"."position" TO app_rw;--> statement-breakpoint
GRANT UPDATE ("name", "is_active", "version", "updated_at") ON "app"."position" TO app_rw;
-- Rollback (manual, only before position rows depend on it): REVOKE INSERT, UPDATE ON "app"."position" FROM app_rw; ALTER TABLE "app"."position" DROP CONSTRAINT "position_version_chk", DROP COLUMN "version";
