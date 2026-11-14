import {
  ALERT_TEST_REQUEST_KEY,
  ALERT_TEST_RESULT_KEY,
  alertSecrets,
  alertTestResultKey,
  createChannels,
  createUserChannels,
  listUsers,
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
import { kvSet, queryRows, sql, type User } from "@jobradar/db";
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

/** One account the alerts go to: its scores, statuses, thresholds and channels. */
interface Recipient {
  user: User;
  isOwner: boolean;
  deps: AlertDeps;
  digestMinScore: number;
  instantMinScore: number;
}

export interface UserResults<T = ChannelResult[]> {
  userId: number;
  results: T;
}

/**
 * Alert jobs of the worker, per account: each user gets their own digest and instant alerts
 * (their scores, statuses and thresholds) on their own channels. The owner's channels are the
 * .env ones and also receive the health alerts. Every send goes through one queue (no two alert
 * jobs at once), and each kind is idempotent per user through `alerts_sent`, so calling them
 * more often is always safe.
 */
export function createAlerts(rt: Runtime, opts: { channels?: AlertChannel[] } = {}) {
  const env = rt.env;
  const base = env.PUBLIC_BASE_URL;
  const ownerChannels = opts.channels ?? createChannels(env);

  async function recipients(): Promise<Recipient[]> {
    const users = await listUsers(rt.db);
    return users
      .filter((u) => u.id === rt.ownerId || u.passwordHash)
      .map((user) => {
        const isOwner = user.id === rt.ownerId;
        const channels = isOwner ? ownerChannels : createUserChannels(env, user, false);
        return {
          user,
          isOwner,
          deps: {
            db: rt.db,
            userId: user.id,
            channels,
            log: rt.log.child({ userId: user.id }),
            secrets: alertSecrets(env),
          },
          digestMinScore: user.digestMinScore ?? env.DIGEST_MIN_SCORE,
          instantMinScore: user.instantMinScore ?? env.INSTANT_MIN_SCORE,
        };
      })
      .filter((r) => r.deps.channels.length > 0);
  }

  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
    const p = queue.then(fn).catch((err: unknown) => {
      rt.log.error({ err, job: name }, "alert job failed");
      return undefined;
    });
    queue = p;
    return p;
  };
  const logSent = (kind: string, userId: number, results: ChannelResult[]) => {
    const sent = results.filter((r) => r.sent > 0);
    if (sent.length > 0 || results.some((r) => !r.ok))
      rt.log.info({ kind, userId, results }, "alerts sent");
  };

  /** Runs `fn` for each recipient; one user's failure never stops the others. */
  async function forEach<T>(
    kind: string,
    pick: (r: Recipient) => boolean,
    fn: (r: Recipient) => Promise<T>,
  ): Promise<UserResults<T>[]> {
    const out: UserResults<T>[] = [];
    for (const r of (await recipients()).filter(pick)) {
      try {
        out.push({ userId: r.user.id, results: await fn(r) });
      } catch (err) {
        rt.log.error({ err, kind, userId: r.user.id }, "alert job failed for this user");
      }
    }
    return out;
  }

  const digestFor = (anchor: Date) =>
    forEach(
      "digest",
      (r) => r.user.digestEnabled,
      async (r) => {
        const results = await runDigest(r.deps, {
          anchor,
          minScore: r.digestMinScore,
          publicBaseUrl: base,
          // Exhausted quotas are an operations matter: the owner's digest only.
          quotas: r.isOwner ? quotaMap(rt) : {},
        });
        logSent("digest", r.user.id, results);
        return results;
      },
    );

  async function runTest(r: Recipient, requestedAt?: string): Promise<AlertTestResult> {
    const results = await sendTestAlerts(r.deps, {
      minScore: r.digestMinScore,
      publicBaseUrl: base,
      quotas: r.isOwner ? quotaMap(rt) : {},
    });
    const out: AlertTestResult = { requestedAt, finishedAt: new Date().toISOString(), results };
    await kvSet(rt.db, alertTestResultKey(r.user.id), out);
    if (r.isOwner) await kvSet(rt.db, ALERT_TEST_RESULT_KEY, out);
    rt.log.info({ userId: r.user.id, results }, "test alerts sent");
    return out;
  }

  let instantPending = false;

  return {
    /** The owner's channels (.env), for the startup log. */
    channels: ownerChannels.map((c) => c.id),

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
        return forEach(
          "instant",
          (r) => r.user.instantEnabled,
          async (r) => {
            const results = await runInstantAlerts(r.deps, {
              minScore: r.instantMinScore,
              highPriorityMinScore: r.digestMinScore,
              publicBaseUrl: base,
            });
            logSent("instant", r.user.id, results);
            return results;
          },
        );
      });
    },

    /** Health issues: the owner only (sources, worker, backups are shared infrastructure). */
    health: (previousTick?: Date) =>
      serial("health", async () => {
        const owner = (await recipients()).find((r) => r.isOwner);
        if (!owner) return undefined;
        const r = await runHealthChecks(owner.deps, {
          silenceHours: env.HEALTH_SILENCE_HOURS,
          previousTick,
          publicBaseUrl: base,
        });
        if (r.issues.length > 0)
          rt.log.warn({ alert: "health", issues: r.issues.map((i) => i.text) }, "health issues");
        logSent("health", owner.user.id, r.results);
        return r;
      }),

    /**
     * "Tester les canaux" on /settings: each user's request (`alert_test_request:<id>`, or the
     * bare key for the owner) is claimed atomically and answered on that user's channels.
     */
    processTestRequest: () =>
      serial("test", async () => {
        const reqs = await queryRows<{ key: string; value: { requestedAt?: string } }>(
          rt.db,
          sql`delete from kv where key = ${ALERT_TEST_REQUEST_KEY}
                or key like ${`${ALERT_TEST_REQUEST_KEY}:%`} returning key, value`,
        );
        if (reqs.length === 0) return undefined;
        const all = await recipients();
        const users = await listUsers(rt.db);
        for (const req of reqs) {
          const id =
            req.key === ALERT_TEST_REQUEST_KEY
              ? rt.ownerId
              : Number(req.key.slice(ALERT_TEST_REQUEST_KEY.length + 1));
          const r = all.find((x) => x.user.id === id);
          if (r) await runTest(r, req.value?.requestedAt);
          else if (users.some((u) => u.id === id))
            // No channel configured: record an empty result so the page stops waiting.
            await kvSet(rt.db, alertTestResultKey(id), {
              requestedAt: req.value?.requestedAt,
              finishedAt: new Date().toISOString(),
              results: [],
            } satisfies AlertTestResult);
        }
        return reqs.length;
      }),

    /** CLI `alerts test`: every recipient. */
    test: (requestedAt?: string) =>
      serial("test", async () =>
        forEach(
          "test",
          () => true,
          (r) => runTest(r, requestedAt),
        ),
      ),
  };
}

export type Alerts = ReturnType<typeof createAlerts>;
