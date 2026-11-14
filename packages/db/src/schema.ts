import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---------- Enums ----------

export const remoteKind = pgEnum("remote_kind", ["onsite", "hybrid", "remote", "unknown"]);
export const jobStatusKind = pgEnum("job_status_kind", [
  "new",
  "saved",
  "applied",
  "interview",
  "rejected",
  "ignored",
]);
export const atsStatus = pgEnum("ats_status", ["unknown", "ok", "broken", "unsupported"]);
export const companyOrigin = pgEnum("company_origin", ["seed", "discovered", "manual"]);
export const companyPriority = pgEnum("company_priority", ["low", "normal", "high"]);
export const runStatus = pgEnum("run_status", ["running", "ok", "error", "skipped"]);
export const userRole = pgEnum("user_role", ["admin", "user"]);

// ---------- users ----------

/**
 * Accounts. Each user has their own scoring profile (YAML, same format as config/profile.yaml),
 * their own scores (`job_scores`), statuses (`job_status`) and company priorities.
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    /** Login. Null only for the owner row created by the migration, until the bootstrap. */
    email: text("email"),
    name: text("name"),
    /** scrypt hash ("scrypt$N$r$p$salt$hash"); null = cannot log in yet. */
    passwordHash: text("password_hash"),
    role: userRole("role").notNull().default("user"),
    /** Scoring profile, YAML. Empty = not scored yet. */
    profileYaml: text("profile_yaml").notNull().default(""),
    profileUpdatedAt: tstz("profile_updated_at"),
    /** Hash (profile text + scoring version) the stored `job_scores` reflect. */
    scoredHash: text("scored_hash"),
    scoredAt: tstz("scored_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

/** Invitation (new account) or password reset (`user_id` set) link. Only the hash is stored. */
export const invites = pgTable("invites", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  /** Set for a password reset of an existing account. */
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: tstz("created_at").notNull().defaultNow(),
  expiresAt: tstz("expires_at").notNull(),
  usedAt: tstz("used_at"),
});

// ---------- companies ----------

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    /** Normalized name used for dedup and fingerprints. */
    nameKey: text("name_key").notNull(),
    ats: text("ats"),
    atsKey: text("ats_key"),
    careersUrl: text("careers_url"),
    origin: companyOrigin("origin").notNull().default("seed"),
    /** Sweep order (seed file). The score bonus comes from each user's `company_prefs`. */
    priority: companyPriority("priority").notNull().default("normal"),
    /** Priority edited in the dashboard: the seed sync no longer overwrites it. */
    priorityManual: boolean("priority_manual").notNull().default(false),
    atsStatus: atsStatus("ats_status").notNull().default("unknown"),
    consecutiveFailures: smallint("consecutive_failures").notNull().default(0),
    lastOkAt: tstz("last_ok_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("companies_ats_key_uq").on(t.ats, t.atsKey),
    index("companies_name_key_idx").on(t.nameKey),
  ],
);

// ---------- jobs ----------

export const jobs = pgTable(
  "jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    canonicalUrl: text("canonical_url"),
    source: text("source").notNull(),
    sourceJobId: text("source_job_id").notNull(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
    companyName: text("company_name").notNull(),
    title: text("title").notNull(),
    locationRaw: text("location_raw"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    remote: remoteKind("remote").notNull().default("unknown"),
    employmentType: text("employment_type"),
    seniority: text("seniority"),
    /** Seniority stated by the source itself (new grad list, "Entry-level" filter, Personio). */
    seniorityHint: text("seniority_hint"),
    isNewGrad: boolean("is_new_grad"),
    isNewGradReason: text("is_new_grad_reason"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),
    postedAt: tstz("posted_at"),
    firstSeenAt: tstz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
    closedAt: tstz("closed_at"),
    /** Consecutive complete source runs in which the job was missing (closed at 2). */
    missedRuns: smallint("missed_runs").notNull().default(0),
    url: text("url").notNull(),
    applyUrl: text("apply_url"),
    descriptionHtml: text("description_html"),
    descriptionText: text("description_text"),
    lang: text("lang"),
    /** Legacy (single-user scores, copied to `job_scores` by 0003): no longer written. */
    score: smallint("score"),
    scoreBreakdown: jsonb("score_breakdown"),
    /** Legacy, see `score`. */
    domains: text("domains")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce("title", '')), 'A') || setweight(to_tsvector('simple', coalesce("company_name", '')), 'A') || setweight(to_tsvector('simple', coalesce("location_raw", '')), 'B') || setweight(to_tsvector('simple', coalesce("description_text", '')), 'C')`,
    ),
  },
  (t) => [
    uniqueIndex("jobs_fingerprint_uq").on(t.fingerprint),
    index("jobs_canonical_url_idx").on(t.canonicalUrl),
    index("jobs_tsv_idx").using("gin", t.tsv),
    index("jobs_first_seen_idx").on(t.firstSeenAt.desc()),
    index("jobs_score_idx").on(t.score.desc()),
    index("jobs_country_idx").on(t.country),
    index("jobs_company_idx").on(t.companyId),
    index("jobs_domains_idx").using("gin", t.domains),
    // Inbox default view: open jobs by score then freshness.
    index("jobs_open_score_idx")
      .on(t.score.desc().nullsLast(), t.firstSeenAt.desc())
      .where(sql`${t.closedAt} is null`),
    index("jobs_open_first_seen_idx")
      .on(t.firstSeenAt.desc())
      .where(sql`${t.closedAt} is null`),
  ],
);

/** One job seen on several sources = one `jobs` row, several `job_sources` rows. */
export const jobSources = pgTable(
  "job_sources",
  {
    jobId: bigint("job_id", { mode: "number" })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceJobId: text("source_job_id").notNull(),
    url: text("url").notNull(),
    firstSeenAt: tstz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.sourceJobId] }),
    index("job_sources_job_idx").on(t.jobId),
  ],
);

/** Per-user score of every job (the profile is per user). */
export const jobScores = pgTable(
  "job_scores",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: bigint("job_id", { mode: "number" })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    score: smallint("score").notNull(),
    scoreBreakdown: jsonb("score_breakdown").notNull(),
    /** Profile domains matched by the scorer (Inbox domain filter, GIN-indexed). */
    domains: text("domains")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.jobId] }),
    index("job_scores_user_score_idx").on(t.userId, t.score.desc(), t.jobId),
    index("job_scores_job_idx").on(t.jobId),
    index("job_scores_domains_idx").using("gin", t.domains),
  ],
);

/** A user's priority for a company ("high" = score bonus for that user only). */
export const companyPrefs = pgTable(
  "company_prefs",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    priority: companyPriority("priority").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.companyId] })],
);

export const jobStatus = pgTable(
  "job_status",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: bigint("job_id", { mode: "number" })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: jobStatusKind("status").notNull().default("new"),
    notes: text("notes"),
    /** Follow-up date ("relancer le"): set on applied/interview, editable in the dashboard. */
    nextActionAt: tstz("next_action_at"),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.jobId] }), index("job_status_job_idx").on(t.jobId)],
);

// ---------- operations ----------

export const sourceRuns = pgTable(
  "source_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
    startedAt: tstz("started_at").notNull().defaultNow(),
    finishedAt: tstz("finished_at"),
    status: runStatus("status").notNull().default("running"),
    nbFetched: integer("nb_fetched").notNull().default(0),
    nbNew: integer("nb_new").notNull().default(0),
    error: text("error"),
  },
  (t) => [
    index("source_runs_source_started_idx").on(t.source, t.startedAt.desc()),
    index("source_runs_company_idx").on(t.companyId, t.startedAt.desc()),
  ],
);

export const apiUsage = pgTable(
  "api_usage",
  {
    source: text("source").notNull(),
    /** Calendar day in America/Toronto. Monthly usage = sum over the month. */
    day: date("day", { mode: "string" }).notNull(),
    calls: integer("calls").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.source, t.day] })],
);

export const alertsSent = pgTable(
  "alerts_sent",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Null for alerts not tied to a single job (health, digest summary). */
    jobId: bigint("job_id", { mode: "number" }).references(() => jobs.id, {
      onDelete: "cascade",
    }),
    channel: text("channel").notNull(),
    kind: text("kind").notNull(),
    /** Idempotency key, e.g. "digest:2027-01-15:job:42" or "health:greenhouse:7". */
    dedupKey: text("dedup_key").notNull(),
    sentAt: tstz("sent_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alerts_sent_dedup_uq").on(t.channel, t.kind, t.dedupKey)],
);

/** Small key/value store: worker heartbeat, profile.yaml hash, LLM cache, ... */
export const kv = pgTable("kv", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type SourceRun = typeof sourceRuns.$inferSelect;
export type User = typeof users.$inferSelect;
