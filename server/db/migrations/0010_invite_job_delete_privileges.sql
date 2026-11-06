REVOKE DELETE ON "app"."user_invite", "app"."job_run" FROM app_rw;
--> statement-breakpoint
-- Schema-local revokes cannot remove the global PUBLIC EXECUTE default.
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
