import {
  createAnthropicClassifier,
  createLogger,
  dbQuota,
  FINDWORK_MIN_INTERVAL_MS,
  getEnv,
  HttpShared,
  kvValidatorStore,
  loadSourcesConfig,
  loadUserProfiles,
  ownerUser,
  parseProfile,
  requireEnv,
  unlimitedQuota,
  USER_AGENT,
  type Env,
  type LlmOptions,
  type Profile,
  type QuotaCounter,
  type UserProfile,
  type UserProfiles,
} from "@jobradar/core";
import { createDb } from "@jobradar/db";

/** Env keys whose values must never appear in logs or stored errors. */
const SECRET_KEYS = [
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
  "JOOBLE_KEY",
  "FT_CLIENT_ID",
  "FT_CLIENT_SECRET",
  "RAPIDAPI_KEY",
  "FINDWORK_KEY",
  "GITHUB_TOKEN",
  "THEMUSE_KEY",
  "CAREERJET_AFFID",
  "ANTHROPIC_API_KEY",
  "NTFY_TOKEN",
  "SMTP_PASS",
  "DISCORD_WEBHOOK_URL",
  "TELEGRAM_BOT_TOKEN",
] as const satisfies readonly (keyof Env)[];

/** Process-wide dependencies shared by the scheduler and the CLI. */
export function createRuntime(service: string) {
  const log = createLogger(service);
  const env = requireEnv(getEnv(), ["DATABASE_URL"]);
  if (!env.CONTACT_EMAIL) log.warn("CONTACT_EMAIL is not set: User-Agent will say 'unset'");
  const { db, close: closeDb } = createDb(env.DATABASE_URL, { max: 5 });
  // Advisory locks pin one connection each for a whole sweep: they get their own pool so they
  // can never starve the query pool (deadlock seen with 5 connectors on a 5-connection pool).
  const locks = createDb(env.DATABASE_URL, { max: 40 });
  const close = async () => {
    await Promise.all([closeDb(), locks.close()]);
  };
  const sources = loadSourcesConfig();
  // Users' profiles (in the database), reloaded every minute and before each sweep: a profile
  // edited in the dashboard is picked up without a restart.
  let profiles: UserProfile[] = [];
  let ownerId = 1;
  const emptyProfile = parseProfile({});
  async function reloadProfiles(): Promise<UserProfiles> {
    const loaded = await loadUserProfiles(db);
    profiles = loaded.profiles;
    ownerId = (await ownerUser(db))?.id ?? ownerId;
    return loaded;
  }
  const workdayGap = env.WORKDAY_MIN_INTERVAL_MS;

  const http = new HttpShared({
    userAgent: USER_AGENT(env.CONTACT_EMAIL),
    log,
    concurrencyPerHost: env.HTTP_CONCURRENCY_PER_HOST,
    // Workday tenants: ~1 request/second per tenant host. Findwork: 10 requests/minute.
    minIntervalMs: (host) =>
      host.endsWith(".myworkdayjobs.com")
        ? workdayGap
        : host === "findwork.dev"
          ? FINDWORK_MIN_INTERVAL_MS
          : 0,
    validators: kvValidatorStore(db),
    secrets: SECRET_KEYS.map((k) => env[k]).filter((v): v is string => !!v),
  });

  /** Daily quota of a source: `quota_env` in sources.yaml names the *_DAILY_MAX_CALLS variable. */
  function quotaFor(sourceId: string): QuotaCounter {
    const cfg = sources.find((s) => s.id === sourceId);
    if (!cfg?.quota_env) return unlimitedQuota;
    const max = env[cfg.quota_env as keyof Env];
    if (typeof max !== "number") {
      log.warn({ source: sourceId, quota_env: cfg.quota_env }, "unknown quota_env: quota 0");
      return dbQuota(db, sourceId, 0);
    }
    return dbQuota(db, sourceId, max);
  }

  /** Optional LLM pass for ambiguous jobs: LLM_ENABLED=true and ANTHROPIC_API_KEY set. */
  let llm: LlmOptions | undefined;
  if (env.LLM_ENABLED) {
    if (env.ANTHROPIC_API_KEY) {
      llm = {
        classifier: createAnthropicClassifier({
          apiKey: env.ANTHROPIC_API_KEY,
          model: env.LLM_MODEL,
          log,
        }),
        quota: dbQuota(db, "llm", env.LLM_DAILY_MAX_CALLS),
      };
    } else log.warn("LLM_ENABLED=true but ANTHROPIC_API_KEY is empty: rules only");
  }

  return {
    env,
    log,
    db,
    lockSql: locks.client,
    close,
    http,
    sources,
    /** Every user's parsed profile (the scorer scores them all). */
    get profiles(): readonly UserProfile[] {
      return profiles;
    },
    /** The owner: receives the alerts until per-user alerts exist. */
    get ownerId(): number {
      return ownerId;
    },
    /** Profile driving the aggregator search queries: the owner's for now. */
    get searchProfile(): Profile {
      return profiles.find((p) => p.userId === ownerId)?.profile ?? emptyProfile;
    },
    reloadProfiles,
    llm,
    quotaFor,
  };
}

export type Runtime = ReturnType<typeof createRuntime>;
