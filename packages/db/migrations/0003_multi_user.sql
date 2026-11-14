-- Multi-user: accounts, per-user scores, statuses and company priorities.
-- The single-user data becomes user 1's (the owner, role admin): scores and statuses are copied
-- as they are, no rescore needed. The owner's e-mail and password are set by the bootstrap
-- (ADMIN_EMAIL / DASHBOARD_PASSWORD) the first time the worker or the dashboard starts.
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"password_hash" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"profile_yaml" text DEFAULT '' NOT NULL,
	"profile_updated_at" timestamp with time zone,
	"scored_hash" text,
	"scored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE TABLE "invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"user_id" integer,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "job_scores" (
	"user_id" integer NOT NULL,
	"job_id" bigint NOT NULL,
	"score" smallint NOT NULL,
	"score_breakdown" jsonb NOT NULL,
	"domains" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "job_scores_user_id_job_id_pk" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "company_prefs" (
	"user_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"priority" "company_priority" NOT NULL,
	CONSTRAINT "company_prefs_user_id_company_id_pk" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
-- Owner = user 1. Its profile is the one the stored scores were computed with (kv "profile_hash"
-- keeps the applied text); on a fresh database it stays empty and the bootstrap loads
-- config/profile.yaml.
INSERT INTO "users" ("id", "role", "profile_yaml", "profile_updated_at", "scored_hash", "scored_at")
SELECT 1, 'admin',
	coalesce((SELECT "value"->>'text' FROM "kv" WHERE "key" = 'profile_hash'), ''),
	now(),
	(SELECT "value"->>'hash' FROM "kv" WHERE "key" = 'profile_hash'),
	(SELECT ("value"->>'appliedAt')::timestamptz FROM "kv" WHERE "key" = 'profile_hash');--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('users', 'id'), 1);--> statement-breakpoint
INSERT INTO "job_scores" ("user_id", "job_id", "score", "score_breakdown", "domains")
SELECT 1, "id", "score", "score_breakdown", "domains" FROM "jobs"
WHERE "score" IS NOT NULL AND "score_breakdown" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "job_scores" ADD CONSTRAINT "job_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_scores" ADD CONSTRAINT "job_scores_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_scores_user_score_idx" ON "job_scores" USING btree ("user_id","score" DESC NULLS LAST,"job_id");--> statement-breakpoint
CREATE INDEX "job_scores_job_idx" ON "job_scores" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_scores_domains_idx" ON "job_scores" USING gin ("domains");--> statement-breakpoint
-- The owner keeps the priorities that gave the score bonus (seed file and dashboard edits).
INSERT INTO "company_prefs" ("user_id", "company_id", "priority")
SELECT 1, "id", "priority" FROM "companies" WHERE "priority" <> 'normal';--> statement-breakpoint
ALTER TABLE "company_prefs" ADD CONSTRAINT "company_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_prefs" ADD CONSTRAINT "company_prefs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Statuses, notes and follow-ups become the owner's.
ALTER TABLE "job_status" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "job_status" SET "user_id" = 1;--> statement-breakpoint
ALTER TABLE "job_status" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "job_status" DROP CONSTRAINT "job_status_pkey";--> statement-breakpoint
ALTER TABLE "job_status" ADD CONSTRAINT "job_status_user_id_job_id_pk" PRIMARY KEY("user_id","job_id");--> statement-breakpoint
ALTER TABLE "job_status" ADD CONSTRAINT "job_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_status_job_idx" ON "job_status" USING btree ("job_id");
