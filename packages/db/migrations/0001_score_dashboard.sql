ALTER TABLE "companies" ADD COLUMN "priority_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "seniority_hint" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "domains" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "jobs_domains_idx" ON "jobs" USING gin ("domains");--> statement-breakpoint
CREATE INDEX "jobs_open_score_idx" ON "jobs" USING btree ("score" DESC NULLS LAST,"first_seen_at" DESC NULLS LAST) WHERE "jobs"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "jobs_open_first_seen_idx" ON "jobs" USING btree ("first_seen_at" DESC NULLS LAST) WHERE "jobs"."closed_at" is null;