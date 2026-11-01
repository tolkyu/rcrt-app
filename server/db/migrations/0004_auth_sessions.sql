CREATE TABLE "app"."user_session" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"method" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"ip" "inet",
	"user_agent" text,
	CONSTRAINT "user_session_method_chk" CHECK ("app"."user_session"."method" IN ('MAGIC_LINK','GOOGLE','INVITE','DEV')),
	CONSTRAINT "user_session_end_chk" CHECK (("app"."user_session"."ended_at" IS NULL) = ("app"."user_session"."end_reason" IS NULL)),
	CONSTRAINT "user_session_reason_chk" CHECK ("app"."user_session"."end_reason" IS NULL OR "app"."user_session"."end_reason" IN ('LOGOUT','IDLE','ABSOLUTE','DEACTIVATED','USER','MFA_RESET')),
	CONSTRAINT "user_session_time_chk" CHECK ("app"."user_session"."last_seen_at" >= "app"."user_session"."started_at")
);
--> statement-breakpoint
ALTER TABLE "app"."app_user" ADD COLUMN "mfa_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."user_session" ADD CONSTRAINT "user_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_session_user_open_idx" ON "app"."user_session" USING btree ("user_id","last_seen_at" DESC NULLS FIRST) WHERE "app"."user_session"."ended_at" IS NULL;--> statement-breakpoint
ALTER TABLE "app"."user_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON app.user_session FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON app.user_session TO app_rw;--> statement-breakpoint
-- Session start for the 7-day limit and a definer function that really ends Supabase sessions (T4-B02, T4-B04).
RESET ROLE;
DO $auth_sessions$
DECLARE
  migration_executor text := current_user;
  temporary_create boolean;
  client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON app.user_session FROM %I', client_role);
    END IF;
  END LOOP;
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    temporary_create := NOT has_schema_privilege(migration_executor, 'app', 'CREATE');
    IF temporary_create THEN
      SET LOCAL ROLE app_migrator;
      EXECUTE format('GRANT CREATE ON SCHEMA app TO %I', migration_executor);
      RESET ROLE;
    END IF;

    CREATE OR REPLACE VIEW app.auth_session_status
      WITH (security_barrier = true, security_invoker = false)
      AS SELECT id, user_id, not_after, created_at FROM auth.sessions;
    REVOKE ALL ON app.auth_session_status FROM PUBLIC;
    GRANT SELECT ON app.auth_session_status TO app_rw;

    CREATE FUNCTION app.end_auth_sessions(
      p_auth_user uuid,
      p_only uuid DEFAULT NULL,
      p_except uuid DEFAULT NULL
    ) RETURNS integer
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = pg_catalog
      AS $fn$
        WITH ended AS (
          DELETE FROM auth.sessions s
          WHERE s.user_id = p_auth_user
            AND (p_only IS NULL OR s.id = p_only)
            AND (p_except IS NULL OR s.id <> p_except)
          RETURNING 1
        )
        SELECT count(*)::integer FROM ended
      $fn$;
    REVOKE ALL ON FUNCTION app.end_auth_sessions(uuid, uuid, uuid) FROM PUBLIC;
    FOREACH client_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = client_role) THEN
        EXECUTE format('REVOKE ALL ON app.auth_session_status FROM %I', client_role);
        EXECUTE format('REVOKE ALL ON FUNCTION app.end_auth_sessions(uuid, uuid, uuid) FROM %I', client_role);
      END IF;
    END LOOP;
    GRANT EXECUTE ON FUNCTION app.end_auth_sessions(uuid, uuid, uuid) TO app_rw;

    IF temporary_create THEN
      SET LOCAL ROLE app_migrator;
      EXECUTE format('REVOKE CREATE ON SCHEMA app FROM %I', migration_executor);
      RESET ROLE;
    END IF;
  END IF;
END
$auth_sessions$;
SET LOCAL ROLE app_migrator;
