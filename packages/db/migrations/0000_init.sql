CREATE TYPE "public"."ats_status" AS ENUM('unknown', 'ok', 'broken', 'unsupported');--> statement-breakpoint
CREATE TYPE "public"."company_origin" AS ENUM('seed', 'discovered', 'manual');--> statement-breakpoint
CREATE TYPE "public"."company_priority" AS ENUM('low', 'normal', 'high');--> statement-breakpoint
CREATE TYPE "public"."job_status_kind" AS ENUM('new', 'saved', 'applied', 'interview', 'rejected', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."remote_kind" AS ENUM('onsite', 'hybrid', 'remote', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'ok', 'error', 'skipped');--> statement-breakpoint
CREATE TABLE "alerts_sent" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" bigint,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"dedup_key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"source" text NOT NULL,
	"day" date NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_source_day_pk" PRIMARY KEY("source","day")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"ats" text,
	"ats_key" text,
	"careers_url" text,
	"origin" "company_origin" DEFAULT 'seed' NOT NULL,
	"priority" "company_priority" DEFAULT 'normal' NOT NULL,
	"ats_status" "ats_status" DEFAULT 'unknown' NOT NULL,
	"consecutive_failures" smallint DEFAULT 0 NOT NULL,
	"last_ok_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_sources" (
	"job_id" bigint NOT NULL,
	"source" text NOT NULL,
	"source_job_id" text NOT NULL,
	"url" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_sources_source_source_job_id_pk" PRIMARY KEY("source","source_job_id")
);
--> statement-breakpoint
CREATE TABLE "job_status" (
	"job_id" bigint PRIMARY KEY NOT NULL,
	"status" "job_status_kind" DEFAULT 'new' NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"canonical_url" text,
	"source" text NOT NULL,
	"source_job_id" text NOT NULL,
	"company_id" integer,
	"company_name" text NOT NULL,
	"title" text NOT NULL,
	"location_raw" text,
	"city" text,
	"region" text,
	"country" text,
	"remote" "remote_kind" DEFAULT 'unknown' NOT NULL,
	"employment_type" text,
	"seniority" text,
	"is_new_grad" boolean,
	"is_new_grad_reason" text,
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" text,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"missed_runs" smallint DEFAULT 0 NOT NULL,
	"url" text NOT NULL,
	"apply_url" text,
	"description_html" text,
	"description_text" text,
	"lang" text,
	"score" smallint,
	"score_breakdown" jsonb,
	"tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce("title", '')), 'A') || setweight(to_tsvector('simple', coalesce("company_name", '')), 'A') || setweight(to_tsvector('simple', coalesce("location_raw", '')), 'B') || setweight(to_tsvector('simple', coalesce("description_text", '')), 'C')) STORED
);
--> statement-breakpoint
CREATE TABLE "kv" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"company_id" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"nb_fetched" integer DEFAULT 0 NOT NULL,
	"nb_new" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_sources" ADD CONSTRAINT "job_sources_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status" ADD CONSTRAINT "job_status_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_sent_dedup_uq" ON "alerts_sent" USING btree ("channel","kind","dedup_key");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_ats_key_uq" ON "companies" USING btree ("ats","ats_key");--> statement-breakpoint
CREATE INDEX "companies_name_key_idx" ON "companies" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "job_sources_job_idx" ON "job_sources" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_fingerprint_uq" ON "jobs" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "jobs_canonical_url_idx" ON "jobs" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "jobs_tsv_idx" ON "jobs" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "jobs_first_seen_idx" ON "jobs" USING btree ("first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_score_idx" ON "jobs" USING btree ("score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_country_idx" ON "jobs" USING btree ("country");--> statement-breakpoint
CREATE INDEX "jobs_company_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "source_runs_source_started_idx" ON "source_runs" USING btree ("source","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "source_runs_company_idx" ON "source_runs" USING btree ("company_id","started_at" DESC NULLS LAST);