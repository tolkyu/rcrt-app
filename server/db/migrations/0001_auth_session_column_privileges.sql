RESET ROLE;
DO $session_privileges$
BEGIN
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    REVOKE SELECT ON auth.sessions FROM app_rw;
    GRANT SELECT (id, user_id, not_after) ON auth.sessions TO app_rw;
  END IF;
END
$session_privileges$;
SET LOCAL ROLE app_migrator;
