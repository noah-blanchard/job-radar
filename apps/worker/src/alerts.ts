import {
  ALERT_TEST_REQUEST_KEY,
  ALERT_TEST_RESULT_KEY,
  alertSecrets,
  createChannels,
  runDigest,
  runHealthChecks,
  runInstantAlerts,
  sendTestAlerts,
  type AlertChannel,
  type AlertDeps,
  type AlertTestResult,
  type ChannelResult,
  type Env,
} from "@jobradar/core";
import { kvSet, queryRows, sql } from "@jobradar/db";
import { Cron } from "croner";
import type { Runtime } from "./runtime";

/** A digest missed (worker down at 08:00, SMTP outage) is still sent within this delay. */
export const DIGEST_CATCH_UP_HOURS = 12;

/** Most recent scheduled time of `expr` at or before `now` (Toronto). */
export function lastScheduled(expr: string, tz: string, now: Date): Date | undefined {
  const cron = new Cron(expr, { timezone: tz, paused: true });
  // +1 s: called from the cron callback itself, the current occurrence must count.
  return cron.previousRuns(1, new Date(now.getTime() + 1000))[0];
}

/** Daily quota per source (sources.yaml `quota_env`), reported in the digest when exhausted. */
function quotaMap(rt: Runtime): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of rt.sources) {
    if (!s.enabled || !s.quota_env) continue;
    const max = rt.env[s.quota_env as keyof Env];
    if (typeof max === "number") out[s.id] = max;
  }
  return out;
}

/**
 * Alert jobs of the worker. Every send goes through one queue (no two alert jobs at once), and
 * each kind is idempotent through `alerts_sent`, so calling them more often is always safe.
 */
export function createAlerts(rt: Runtime, opts: { channels?: AlertChannel[] } = {}) {
  const channels = opts.channels ?? createChannels(rt.env);
  const base0: Omit<AlertDeps, "userId"> = {
    db: rt.db,
    channels,
    log: rt.log,
    secrets: alertSecrets(rt.env),
  };
  // The env channels belong to the owner: their scores and statuses pick the jobs.
  const ownerDeps = (): AlertDeps => ({ ...base0, userId: rt.ownerId });
  const env = rt.env;
  const base = env.PUBLIC_BASE_URL;

  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
    const p = queue.then(fn).catch((err: unknown) => {
      rt.log.error({ err, job: name }, "alert job failed");
      return undefined;
    });
    queue = p;
    return p;
  };
  const logSent = (kind: string, results: ChannelResult[]) => {
    const sent = results.filter((r) => r.sent > 0);
    if (sent.length > 0 || results.some((r) => !r.ok))
      rt.log.info({ kind, results }, "alerts sent");
  };

  async function digestFor(anchor: Date) {
    const results = await runDigest(ownerDeps(), {
      anchor,
      minScore: env.DIGEST_MIN_SCORE,
      publicBaseUrl: base,
      quotas: quotaMap(rt),
    });
    logSent("digest", results);
    return results;
  }

  let instantPending = false;

  return {
    channels: channels.map((c) => c.id),

    /** DIGEST_CRON callback: the digest of the occurrence that just fired. */
    digest: (now = new Date()) =>
      serial("digest", async () => {
        const anchor = lastScheduled(env.DIGEST_CRON, env.TZ, now) ?? now;
        return digestFor(anchor);
      }),

    /** Sends the latest digest if it is recent and some channel did not get it (idempotent). */
    catchUpDigest: (now = new Date()) =>
      serial("digest catch-up", async () => {
        const anchor = lastScheduled(env.DIGEST_CRON, env.TZ, now);
        if (!anchor || now.getTime() - anchor.getTime() > DIGEST_CATCH_UP_HOURS * 3_600_000)
          return [];
        return digestFor(anchor);
      }),

    /** After a run with new jobs. Calls arriving while one is queued are merged. */
    instant: () => {
      if (!env.INSTANT_ALERTS_ENABLED || instantPending) return Promise.resolve(undefined);
      instantPending = true;
      return serial("instant", async () => {
        instantPending = false;
        const results = await runInstantAlerts(ownerDeps(), {
          minScore: env.INSTANT_MIN_SCORE,
          highPriorityMinScore: env.DIGEST_MIN_SCORE,
          publicBaseUrl: base,
        });
        logSent("instant", results);
        return results;
      });
    },

    health: (previousTick?: Date) =>
      serial("health", async () => {
        const r = await runHealthChecks(ownerDeps(), {
          silenceHours: env.HEALTH_SILENCE_HOURS,
          previousTick,
          publicBaseUrl: base,
        });
        if (r.issues.length > 0)
          rt.log.warn({ alert: "health", issues: r.issues.map((i) => i.text) }, "health issues");
        logSent("health", r.results);
        return r;
      }),

    /** "Tester les canaux" on /settings: the request is claimed atomically, the result stored. */
    processTestRequest: () =>
      serial("test", async () => {
        const [req] = await queryRows<{ value: { requestedAt?: string } }>(
          rt.db,
          sql`delete from kv where key = ${ALERT_TEST_REQUEST_KEY} returning value`,
        );
        if (!req) return undefined;
        return runTest(req.value?.requestedAt);
      }),

    test: (requestedAt?: string) => serial("test", () => runTest(requestedAt)),
  };

  async function runTest(requestedAt?: string): Promise<AlertTestResult> {
    const results =
      channels.length === 0
        ? []
        : await sendTestAlerts(ownerDeps(), {
            minScore: env.DIGEST_MIN_SCORE,
            publicBaseUrl: base,
            quotas: quotaMap(rt),
          });
    const out: AlertTestResult = { requestedAt, finishedAt: new Date().toISOString(), results };
    await kvSet(rt.db, ALERT_TEST_RESULT_KEY, out);
    rt.log.info({ results, channels: channels.map((c) => c.id) }, "test alerts sent");
    return out;
  }
}

export type Alerts = ReturnType<typeof createAlerts>;
