import {
  createLogger,
  getEnv,
  HttpShared,
  kvValidatorStore,
  loadSourcesConfig,
  requireEnv,
  USER_AGENT,
} from "@jobradar/core";
import { createDb } from "@jobradar/db";

/** Process-wide dependencies shared by the scheduler and the CLI. */
export function createRuntime(service: string) {
  const log = createLogger(service);
  const env = requireEnv(getEnv(), ["DATABASE_URL"]);
  if (!env.CONTACT_EMAIL) log.warn("CONTACT_EMAIL is not set: User-Agent will say 'unset'");
  const { db, close: closeDb } = createDb(env.DATABASE_URL, { max: 5 });
  // Advisory locks pin one connection each for a whole sweep: they get their own pool so they
  // can never starve the query pool (deadlock seen with 5 connectors on a 5-connection pool).
  const locks = createDb(env.DATABASE_URL, { max: 20 });
  const close = async () => {
    await Promise.all([closeDb(), locks.close()]);
  };
  const sources = loadSourcesConfig();
  const workdayGap = env.WORKDAY_MIN_INTERVAL_MS;

  const http = new HttpShared({
    userAgent: USER_AGENT(env.CONTACT_EMAIL),
    log,
    concurrencyPerHost: env.HTTP_CONCURRENCY_PER_HOST,
    // Workday tenants: ~1 request/second per tenant host.
    minIntervalMs: (host) => (host.endsWith(".myworkdayjobs.com") ? workdayGap : 0),
    validators: kvValidatorStore(db),
  });

  return { env, log, db, lockSql: locks.client, close, http, sources };
}

export type Runtime = ReturnType<typeof createRuntime>;
