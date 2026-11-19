CREATE TABLE "app"."idempotency_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_key_chk" CHECK ("app"."idempotency_key"."key" ~ '^[A-Za-z0-9_-]{16,64}$')
);
--> statement-breakpoint
ALTER TABLE "app"."idempotency_key" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."vacancy" DROP CONSTRAINT "vacancy_position_chk";--> statement-breakpoint
ALTER TABLE "app"."vacancy" DROP CONSTRAINT "vacancy_opened_chk";--> statement-breakpoint
ALTER TABLE "app"."vacancy" ADD COLUMN "description_doc" jsonb;--> statement-breakpoint
ALTER TABLE "app"."vacancy" ADD COLUMN "requirements_doc" jsonb;--> statement-breakpoint
ALTER TABLE "app"."vacancy" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
-- D82: cancelled rows predate the column; closed_at is their cancellation moment.
UPDATE "app"."vacancy" SET "cancelled_at" = "closed_at" WHERE "status" = 'CANCELLED';--> statement-breakpoint
ALTER TABLE "app"."idempotency_key" ADD CONSTRAINT "idempotency_key_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_key_uq" ON "app"."idempotency_key" USING btree ("user_id","operation","key");--> statement-breakpoint
CREATE INDEX "idempotency_key_created_idx" ON "app"."idempotency_key" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "vacancy_position_open_idx" ON "app"."vacancy" USING btree ("position_id","vertical_id") WHERE "app"."vacancy"."deleted_at" IS NULL AND "app"."vacancy"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "vacancy_draft_author_idx" ON "app"."vacancy" USING btree ("created_by","public_no" DESC NULLS LAST) WHERE "app"."vacancy"."deleted_at" IS NULL AND "app"."vacancy"."status" = 'DRAFT';--> statement-breakpoint
ALTER TABLE "app"."vacancy" ADD CONSTRAINT "vacancy_cancelled_chk" CHECK (("app"."vacancy"."cancelled_at" IS NOT NULL) = ("app"."vacancy"."status" = 'CANCELLED') AND ("app"."vacancy"."cancelled_at" IS NULL OR "app"."vacancy"."cancelled_at" = "app"."vacancy"."closed_at"));--> statement-breakpoint
ALTER TABLE "app"."vacancy" ADD CONSTRAINT "vacancy_position_chk" CHECK ("app"."vacancy"."status" IN ('DRAFT','CANCELLED') OR "app"."vacancy"."position_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "app"."vacancy" ADD CONSTRAINT "vacancy_opened_chk" CHECK ("app"."vacancy"."status" IN ('DRAFT','CANCELLED') OR "app"."vacancy"."opened_at" IS NOT NULL);--> statement-breakpoint
DO $revoke_client_roles$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON app.idempotency_key FROM %I', client_role);
    END IF;
  END LOOP;
END
$revoke_client_roles$;--> statement-breakpoint
-- Runtime creates vacancies and recruiter assignments; updates arrive with the S2 lifecycle migration. A key is claimed by one upsert that may only replace an expired row, so the key table gets INSERT plus column UPDATE and no DELETE.
GRANT INSERT ON "app"."vacancy", "app"."vacancy_recruiter" TO app_rw;--> statement-breakpoint
GRANT SELECT, INSERT ON "app"."idempotency_key" TO app_rw;--> statement-breakpoint
GRANT UPDATE ("request_hash", "resource_id", "created_at") ON "app"."idempotency_key" TO app_rw;
-- Rollback (manual, before vacancy rows depend on it): REVOKE INSERT ON app.vacancy, app.vacancy_recruiter FROM app_rw; DROP TABLE app.idempotency_key; DROP INDEX app.vacancy_position_open_idx, app.vacancy_draft_author_idx; ALTER TABLE app.vacancy DROP CONSTRAINT vacancy_cancelled_chk, DROP COLUMN cancelled_at, DROP COLUMN description_doc, DROP COLUMN requirements_doc; then restore vacancy_position_chk and vacancy_opened_chk from 0011.
