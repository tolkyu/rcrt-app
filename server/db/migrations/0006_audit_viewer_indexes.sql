DROP INDEX "app"."audit_log_entity_idx";--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "app"."audit_log" USING btree ("action","occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "audit_log_result_idx" ON "app"."audit_log" USING btree ("result","occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "audit_log_entity_type_idx" ON "app"."audit_log" USING btree ("entity_type","occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "app"."audit_log" USING btree ("entity_type","entity_id","occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);