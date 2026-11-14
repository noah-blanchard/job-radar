import { z } from "zod";

/** Empty strings in .env files mean "not set". */
const opt = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );

/** `prefault` runs the default through the schema (so "false" becomes false, "ca,us" a list). */
const withDefault = <T extends z.ZodType>(schema: T, def: z.input<T>) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.prefault(def as never),
  );

const int = z.coerce.number().int().nonnegative();
const bool = z.stringbool();
const csv = z.string().transform((s) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
);

export const envSchema = z.object({
  // --- General ---
  NODE_ENV: withDefault(z.enum(["development", "production", "test"]), "development"),
  TZ: withDefault(z.string(), "America/Toronto"),
  PUBLIC_BASE_URL: withDefault(z.url(), "http://localhost:3000"),
  CONTACT_EMAIL: opt(z.email()),
  LOG_LEVEL: withDefault(z.enum(["fatal", "error", "warn", "info", "debug", "trace"]), "info"),

  // --- Database ---
  DATABASE_URL: opt(z.string()),

  // --- Dashboard ---
  DASHBOARD_PASSWORD: opt(z.string().min(8)),
  AUTH_SECRET: opt(z.string().min(32, "AUTH_SECRET must be at least 32 characters")),

  // --- Worker ---
  WORKER_HEALTH_PORT: withDefault(int, 8081),

  // --- Sources with keys ---
  ADZUNA_APP_ID: opt(z.string()),
  ADZUNA_APP_KEY: opt(z.string()),
  ADZUNA_COUNTRIES: withDefault(csv, "ca,us,fr,gb"),
  ADZUNA_DAILY_MAX_CALLS: withDefault(int, 200),
  JOOBLE_KEY: opt(z.string()),
  JOOBLE_DAILY_MAX_CALLS: withDefault(int, 100),
  FT_CLIENT_ID: opt(z.string()),
  FT_CLIENT_SECRET: opt(z.string()),
  FT_DAILY_MAX_CALLS: withDefault(int, 100),
  RAPIDAPI_KEY: opt(z.string()),
  JSEARCH_DAILY_MAX_CALLS: withDefault(int, 3),
  FINDWORK_KEY: opt(z.string()),
  FINDWORK_DAILY_MAX_CALLS: withDefault(int, 50),

  // --- Optional sources ---
  GITHUB_TOKEN: opt(z.string()),
  THEMUSE_KEY: opt(z.string()),
  CAREERJET_AFFID: opt(z.string()),
  BA_JOBSUCHE_ENABLED: withDefault(bool, "false"),

  // --- Scheduling ---
  ATS_CRON: withDefault(z.string(), "0 */6 * * *"),
  AGGREGATORS_CRON: withDefault(z.string(), "30 5 * * *"),
  FEEDS_CRON: withDefault(z.string(), "15 */6 * * *"),
  DIGEST_CRON: withDefault(z.string(), "0 8 * * *"),
  HTTP_CONCURRENCY_PER_HOST: withDefault(int.min(1), 2),
  WORKDAY_MIN_INTERVAL_MS: withDefault(int, 1000),

  // --- Alert thresholds ---
  DIGEST_MIN_SCORE: withDefault(int.max(100), 40),
  INSTANT_ALERTS_ENABLED: withDefault(bool, "true"),
  INSTANT_MIN_SCORE: withDefault(int.max(100), 75),
  HEALTH_SILENCE_HOURS: withDefault(int, 12),

  // --- Alert channels ---
  NTFY_URL: withDefault(z.url(), "https://ntfy.sh"),
  NTFY_TOPIC: opt(z.string()),
  NTFY_TOKEN: opt(z.string()),
  SMTP_HOST: opt(z.string()),
  SMTP_PORT: withDefault(int, 587),
  SMTP_SECURE: withDefault(bool, "false"),
  SMTP_USER: opt(z.string()),
  SMTP_PASS: opt(z.string()),
  SMTP_FROM: opt(z.string()),
  ALERT_EMAIL_TO: opt(z.string()),
  DISCORD_WEBHOOK_URL: opt(z.url()),
  TELEGRAM_BOT_TOKEN: opt(z.string()),
  TELEGRAM_CHAT_ID: opt(z.string()),

  // --- LLM (optional) ---
  LLM_ENABLED: withDefault(bool, "false"),
  ANTHROPIC_API_KEY: opt(z.string()),
  LLM_MODEL: withDefault(z.string(), "claude-haiku-5-5"),
  LLM_DAILY_MAX_CALLS: withDefault(int, 200),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  override name = "EnvError";
}

/** Parse an env source. Throws EnvError listing every invalid variable. */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const res = envSchema.safeParse(source);
  if (!res.success) {
    const lines = res.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new EnvError(`Invalid environment:\n${lines.join("\n")}`);
  }
  return res.data;
}

/** Ensure the given variables are set (service-specific requirements). */
export function requireEnv<K extends keyof Env>(
  env: Env,
  keys: readonly K[],
): Env & { [P in K]-?: NonNullable<Env[P]> } {
  const missing = keys.filter((k) => env[k] === undefined);
  if (missing.length > 0) {
    throw new EnvError(`Missing required environment variables: ${missing.join(", ")}`);
  }
  return env as Env & { [P in K]-?: NonNullable<Env[P]> };
}

let cached: Env | undefined;

/** Process-wide parsed env (parsed once). */
export function getEnv(): Env {
  cached ??= parseEnv();
  return cached;
}

export const USER_AGENT = (contact: string | undefined) =>
  `JobRadar/1.0 (+contact: ${contact ?? "unset"})`;
