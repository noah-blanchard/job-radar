-- Per-user alerts: thresholds and personal channels on users; alerts_sent gets its recipient so
-- one user's sends never count as another's. Everything sent so far was the owner's (user 1).
ALTER TABLE "users" ADD COLUMN "digest_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_min_score" smallint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "instant_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "instant_min_score" smallint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alert_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ntfy_topic" text;--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "alerts_sent" SET "user_id" = 1;--> statement-breakpoint
ALTER TABLE "alerts_sent" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX "alerts_sent_dedup_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_sent_dedup_uq" ON "alerts_sent" USING btree ("user_id","channel","kind","dedup_key");
