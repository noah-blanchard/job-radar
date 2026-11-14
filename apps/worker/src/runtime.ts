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
  const { db, client, close } = createDb(env.DATABASE_URL, { max: 5 });
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

  return { env, log, db, sql: client, close, http, sources };
}

export type Runtime = ReturnType<typeof createRuntime>;
