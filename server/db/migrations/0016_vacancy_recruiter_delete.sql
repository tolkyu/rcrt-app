-- ADR-017: removing a recruiter from a vacancy is an audited hard delete of the assignment row (ADR-012); only the runtime role gets it.
GRANT DELETE ON "app"."vacancy_recruiter" TO app_rw;
-- Rollback (manual): REVOKE DELETE ON "app"."vacancy_recruiter" FROM app_rw.
