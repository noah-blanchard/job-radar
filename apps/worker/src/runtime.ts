import {
  createLogger,
  dbQuota,
  FINDWORK_MIN_INTERVAL_MS,
  getEnv,
  HttpShared,
  kvValidatorStore,
  loadProfile,
  loadSourcesConfig,
  requireEnv,
  unlimitedQuota,
  USER_AGENT,
  type Env,
  type QuotaCounter,
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
  const profile = loadProfile();
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

  return { env, log, db, lockSql: locks.client, close, http, sources, profile, quotaFor };
}

export type Runtime = ReturnType<typeof createRuntime>;
