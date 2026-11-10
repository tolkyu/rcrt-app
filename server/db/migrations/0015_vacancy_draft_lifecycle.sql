-- The runtime edits, publishes, cancels and soft-deletes a draft; the author (`created_by`), `public_no`, vertical, source and creation time stay immutable for it.
GRANT UPDATE ("position_id", "title", "team_lead_id", "recruiter_initiated", "status", "headcount", "seniority", "work_format", "employment_type", "location", "salary_min_minor", "salary_max_minor", "salary_currency", "priority_flag", "probation_days", "description_doc", "requirements_doc", "opened_at", "closed_at", "cancelled_at", "deleted_at", "deleted_by", "delete_reason", "version", "updated_at") ON "app"."vacancy" TO app_rw;--> statement-breakpoint
-- `CANCELLED AND opened_at IS NULL` is what keeps a never-opened vacancy private to its author (D92); no writer may blur it.
CREATE FUNCTION app.guard_vacancy_lifecycle() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $lifecycle_guard$
BEGIN
  IF OLD.opened_at IS NOT NULL AND NEW.opened_at IS DISTINCT FROM OLD.opened_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'vacancy_opened_at_immutable';
  END IF;
  IF OLD.status <> 'DRAFT' AND NEW.status = 'DRAFT' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'vacancy_draft_is_first_status';
  END IF;
  IF OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'vacancy_cancelled_is_final';
  END IF;
  RETURN NEW;
END
$lifecycle_guard$;
--> statement-breakpoint
CREATE TRIGGER vacancy_lifecycle_guard
BEFORE UPDATE OF opened_at, status ON app.vacancy
FOR EACH ROW EXECUTE FUNCTION app.guard_vacancy_lifecycle();
-- Rollback (manual): DROP TRIGGER vacancy_lifecycle_guard ON app.vacancy; DROP FUNCTION app.guard_vacancy_lifecycle(); REVOKE UPDATE ON app.vacancy FROM app_rw.
