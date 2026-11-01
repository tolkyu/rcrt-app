CREATE INDEX "app_user_list_idx" ON "app"."app_user" USING btree ((NOT "is_active"),"full_name" COLLATE "uk-UA-x-icu","id");--> statement-breakpoint
RESET ROLE;
DO $mfa_totp_view$
DECLARE
  migration_executor text := current_user;
  temporary_create boolean;
  client_role text;
BEGIN
  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    temporary_create := NOT has_schema_privilege(migration_executor, 'app', 'CREATE');
    IF temporary_create THEN
      SET LOCAL ROLE app_migrator;
      EXECUTE format('GRANT CREATE ON SCHEMA app TO %I', migration_executor);
      RESET ROLE;
    END IF;

    CREATE VIEW app.auth_mfa_totp
      WITH (security_barrier = true, security_invoker = false)
      AS SELECT id, user_id FROM auth.mfa_factors
        WHERE factor_type::text = 'totp' AND status::text = 'verified';

    REVOKE ALL ON app.auth_mfa_totp FROM PUBLIC, app_rw;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = client_role) THEN
        EXECUTE format('REVOKE ALL ON app.auth_mfa_totp FROM %I', client_role);
      END IF;
    END LOOP;
    GRANT SELECT ON app.auth_mfa_totp TO app_rw;

    IF temporary_create THEN
      SET LOCAL ROLE app_migrator;
      EXECUTE format('REVOKE CREATE ON SCHEMA app FROM %I', migration_executor);
      RESET ROLE;
    END IF;
  END IF;
END
$mfa_totp_view$;
SET LOCAL ROLE app_migrator;
