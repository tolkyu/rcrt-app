ALTER TABLE "app"."position" ADD COLUMN "name_key" text;--> statement-breakpoint
-- Demo rows only; mirrors the app key (NFC, collapsed spaces, case fold) with an explicit ICU collation so it does not depend on the database LC_CTYPE. The application computes the key for every later write.
UPDATE "app"."position" SET "name_key" = lower(normalize(regexp_replace(trim("name"), '\s+', ' ', 'g'), NFC) COLLATE "uk-UA-x-icu");--> statement-breakpoint
ALTER TABLE "app"."position" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
DROP INDEX "app"."position_name_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "position_name_uq" ON "app"."position" USING btree ("vertical_id","name_key");--> statement-breakpoint
-- Renames must be able to rewrite the key; INSERT is already table-level since 0012.
GRANT UPDATE ("name_key") ON "app"."position" TO app_rw;
-- Rollback (manual): REVOKE UPDATE ("name_key") ON "app"."position" FROM app_rw; DROP INDEX "app"."position_name_uq"; CREATE UNIQUE INDEX "position_name_uq" ON "app"."position" USING btree ("vertical_id", lower("name")); ALTER TABLE "app"."position" DROP COLUMN "name_key";
