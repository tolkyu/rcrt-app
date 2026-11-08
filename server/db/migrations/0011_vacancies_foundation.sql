RESET ROLE;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
DO $extension_schema$
DECLARE extension_schema name;
BEGIN
  SELECT n.nspname INTO STRICT extension_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO app_migrator', extension_schema);
  PERFORM pg_catalog.set_config('app.migration_search_path', pg_catalog.current_setting('search_path'), true);
  PERFORM pg_catalog.set_config('search_path', format('pg_catalog, app, %I', extension_schema), true);
END
$extension_schema$;
--> statement-breakpoint
SET LOCAL ROLE app_migrator;
--> statement-breakpoint
CREATE TABLE "app"."position" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "position_id_vertical_uq" UNIQUE("id","vertical_id"),
	CONSTRAINT "position_name_chk" CHECK (length(trim("app"."position"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."position" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."vacancy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_no" bigint GENERATED ALWAYS AS IDENTITY (sequence name "app"."vacancy_public_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"vertical_id" uuid NOT NULL,
	"position_id" uuid,
	"title" text NOT NULL,
	"team_lead_id" uuid,
	"recruiter_initiated" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"headcount" smallint DEFAULT 1 NOT NULL,
	"seniority" text,
	"work_format" text,
	"employment_type" text,
	"location" text,
	"salary_min_minor" bigint,
	"salary_max_minor" bigint,
	"salary_currency" char(3),
	"priority_flag" text DEFAULT 'NORMAL' NOT NULL,
	"probation_days" smallint DEFAULT 90 NOT NULL,
	"source" text DEFAULT 'APP' NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vacancy_public_no_uq" UNIQUE("public_no"),
	CONSTRAINT "vacancy_id_vertical_uq" UNIQUE("id","vertical_id"),
	CONSTRAINT "vacancy_public_no_chk" CHECK ("app"."vacancy"."public_no" > 0),
	CONSTRAINT "vacancy_title_chk" CHECK (length(trim("app"."vacancy"."title")) > 0),
	CONSTRAINT "vacancy_status_chk" CHECK ("app"."vacancy"."status" IN ('DRAFT','OPEN','ON_HOLD','FILLED','CANCELLED')),
	CONSTRAINT "vacancy_position_chk" CHECK ("app"."vacancy"."status" = 'DRAFT' OR "app"."vacancy"."position_id" IS NOT NULL),
	CONSTRAINT "vacancy_team_lead_chk" CHECK ("app"."vacancy"."recruiter_initiated" OR "app"."vacancy"."team_lead_id" IS NOT NULL),
	CONSTRAINT "vacancy_headcount_chk" CHECK ("app"."vacancy"."headcount" >= 1),
	CONSTRAINT "vacancy_work_format_chk" CHECK ("app"."vacancy"."work_format" IS NULL OR "app"."vacancy"."work_format" IN ('REMOTE','OFFICE','HYBRID')),
	CONSTRAINT "vacancy_priority_chk" CHECK ("app"."vacancy"."priority_flag" IN ('NORMAL','URGENT')),
	CONSTRAINT "vacancy_probation_days_chk" CHECK ("app"."vacancy"."probation_days" BETWEEN 30 AND 90),
	CONSTRAINT "vacancy_source_chk" CHECK ("app"."vacancy"."source" IN ('APP','TELEGRAM_BOT')),
	CONSTRAINT "vacancy_salary_chk" CHECK (("app"."vacancy"."salary_min_minor" IS NULL OR "app"."vacancy"."salary_min_minor" >= 0) AND ("app"."vacancy"."salary_max_minor" IS NULL OR "app"."vacancy"."salary_max_minor" >= 0) AND ("app"."vacancy"."salary_min_minor" IS NULL OR "app"."vacancy"."salary_max_minor" IS NULL OR "app"."vacancy"."salary_min_minor" <= "app"."vacancy"."salary_max_minor") AND (("app"."vacancy"."salary_min_minor" IS NULL AND "app"."vacancy"."salary_max_minor" IS NULL) = ("app"."vacancy"."salary_currency" IS NULL)) AND ("app"."vacancy"."salary_currency" IS NULL OR "app"."vacancy"."salary_currency" ~ '^[A-Z]{3}$')),
	CONSTRAINT "vacancy_closed_chk" CHECK (("app"."vacancy"."closed_at" IS NOT NULL) = ("app"."vacancy"."status" IN ('FILLED','CANCELLED'))),
	CONSTRAINT "vacancy_opened_chk" CHECK ("app"."vacancy"."status" = 'DRAFT' OR "app"."vacancy"."opened_at" IS NOT NULL),
	CONSTRAINT "vacancy_soft_delete_chk" CHECK (("app"."vacancy"."deleted_at" IS NULL) = ("app"."vacancy"."deleted_by" IS NULL) AND ("app"."vacancy"."deleted_at" IS NULL OR length(trim(coalesce("app"."vacancy"."delete_reason", ''))) > 0)),
	CONSTRAINT "vacancy_version_chk" CHECK ("app"."vacancy"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."vacancy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."vacancy_recruiter" (
	"vacancy_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid NOT NULL,
	CONSTRAINT "vacancy_recruiter_vacancy_id_user_id_pk" PRIMARY KEY("vacancy_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "app"."vacancy_recruiter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."position" ADD CONSTRAINT "position_vertical_id_vertical_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "app"."vertical"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."position" ADD CONSTRAINT "position_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vacancy" ADD CONSTRAINT "vacancy_vertical_id_vertical_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "app"."vertical"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vacancy" ADD CONSTRAINT "vacancy_team_lead_id_app_user_id_fk" FOREIGN KEY ("team_lead_id") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vacancy" ADD CONSTRAINT "vacancy_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vacancy" ADD CONSTRAINT "vacancy_deleted_by_app_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vacancy" ADD CONSTRAINT "vacancy_position_vertical_fk" FOREIGN KEY ("position_id","vertical_id") REFERENCES "app"."position"("id","vertical_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vacancy_recruiter" ADD CONSTRAINT "vacancy_recruiter_vacancy_id_vacancy_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "app"."vacancy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vacancy_recruiter" ADD CONSTRAINT "vacancy_recruiter_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vacancy_recruiter" ADD CONSTRAINT "vacancy_recruiter_assigned_by_app_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "position_name_uq" ON "app"."position" USING btree ("vertical_id",lower("name"));--> statement-breakpoint
CREATE INDEX "vacancy_vertical_list_idx" ON "app"."vacancy" USING btree ("vertical_id","public_no" DESC NULLS LAST) WHERE "app"."vacancy"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "vacancy_status_list_idx" ON "app"."vacancy" USING btree ("status","public_no" DESC NULLS LAST) WHERE "app"."vacancy"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "vacancy_priority_list_idx" ON "app"."vacancy" USING btree ("priority_flag","public_no" DESC NULLS LAST) WHERE "app"."vacancy"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "vacancy_team_lead_list_idx" ON "app"."vacancy" USING btree ("team_lead_id","public_no" DESC NULLS LAST) WHERE "app"."vacancy"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "vacancy_position_idx" ON "app"."vacancy" USING btree ("position_id","vertical_id") WHERE "app"."vacancy"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "vacancy_title_trgm_idx" ON "app"."vacancy" USING gin ("title" gin_trgm_ops) WHERE "app"."vacancy"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "vacancy_recruiter_user_idx" ON "app"."vacancy_recruiter" USING btree ("user_id","vacancy_id");--> statement-breakpoint
ALTER TABLE "app"."entity_event" ADD CONSTRAINT "entity_event_vacancy_id_vacancy_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "app"."vacancy"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION app.guard_vacancy_public_no() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $number_guard$
BEGIN
  IF NEW.public_no IS DISTINCT FROM OLD.public_no THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'vacancy_public_no_immutable';
  END IF;
  RETURN NEW;
END
$number_guard$;
--> statement-breakpoint
CREATE TRIGGER vacancy_public_no_immutable
BEFORE UPDATE OF public_no ON app.vacancy
FOR EACH ROW EXECUTE FUNCTION app.guard_vacancy_public_no();
--> statement-breakpoint
REVOKE ALL ON app.position, app.vacancy, app.vacancy_recruiter FROM PUBLIC;
--> statement-breakpoint
DO $revoke_client_roles$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON app.position, app.vacancy, app.vacancy_recruiter FROM %I', client_role);
    END IF;
  END LOOP;
END
$revoke_client_roles$;
--> statement-breakpoint
GRANT SELECT ON app.position, app.vacancy, app.vacancy_recruiter TO app_rw;
--> statement-breakpoint
SELECT pg_catalog.set_config('search_path', pg_catalog.current_setting('app.migration_search_path'), true);
