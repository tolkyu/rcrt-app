RESET ROLE;
DO $session_status_view$
DECLARE
  migration_executor text := current_user;
  temporary_create boolean;
  client_role text;
BEGIN
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    temporary_create := NOT has_schema_privilege(migration_executor, 'app', 'CREATE');
    IF temporary_create THEN
      SET LOCAL ROLE app_migrator;
      EXECUTE format('GRANT CREATE ON SCHEMA app TO %I', migration_executor);
      RESET ROLE;
    END IF;

    CREATE VIEW app.auth_session_status
      WITH (security_barrier = true, security_invoker = false)
      AS SELECT id, user_id, not_after FROM auth.sessions;

    REVOKE ALL ON app.auth_session_status FROM PUBLIC, app_rw;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = client_role) THEN
        EXECUTE format('REVOKE ALL ON app.auth_session_status FROM %I', client_role);
      END IF;
    END LOOP;
    GRANT SELECT ON app.auth_session_status TO app_rw;
    REVOKE SELECT ON auth.sessions FROM app_rw;
    REVOKE SELECT (id, user_id, not_after) ON auth.sessions FROM app_rw;

    IF temporary_create THEN
      SET LOCAL ROLE app_migrator;
      EXECUTE format('REVOKE CREATE ON SCHEMA app FROM %I', migration_executor);
      RESET ROLE;
    END IF;
  END IF;
END
$session_status_view$;
SET LOCAL ROLE app_migrator;
