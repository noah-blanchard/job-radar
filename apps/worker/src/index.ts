import { createServer } from "node:http";
import { loadCompanySeed, syncCompanySeed } from "@jobradar/core";
import { kvSet, sql } from "@jobradar/db";
import { Cron } from "croner";

import { createHealthHandler } from "./health";
import { createRuntime } from "./runtime";
import { runSweep, type Schedule } from "./sweep";

const rt = createRuntime("worker");
const { env, log, db } = rt;
const TZ = env.TZ;
/** Random start delay per source, to spread load. */
const JITTER_MS: Record<Schedule, number> = {
  ats: 10 * 60_000,
  aggregators: 2 * 60_000,
  feeds: 5 * 60_000,
};

const startedAt = new Date();
let lastTick: Date | undefined;

async function heartbeat(): Promise<void> {
  const now = new Date();
  await kvSet(db, "worker_last_tick", now.toISOString());
  lastTick = now;
  log.debug({ at: now.toISOString() }, "heartbeat");
}

function sweep(schedule: Schedule) {
  return async (): Promise<void> => {
    const t0 = Date.now();
    const { runs, deferred } = await runSweep(rt, {
      schedules: [schedule],
      maxJitterMs: JITTER_MS[schedule],
      deadline: schedule === "ats" ? t0 + env.ATS_SWEEP_MAX_MINUTES * 60_000 : undefined,
    });
    log.info(
      {
        schedule,
        runs: runs.length,
        errors: runs.filter((r) => r.status === "error").length,
        fetched: runs.reduce((a, r) => a + r.fetched, 0),
        nbNew: runs.reduce((a, r) => a + r.nbNew, 0),
        discovered: runs.reduce((a, r) => a + r.discovered, 0),
        deferred,
        ms: Date.now() - t0,
      },
      "sweep done",
    );
  };
}

const guard = (name: string, fn: () => Promise<void>) => () =>
  fn().catch((err: unknown) => log.error({ err, job: name }, "scheduled job failed"));

const jobs: Cron[] = [
  new Cron(
    "* * * * *",
    { name: "heartbeat", timezone: TZ, protect: true },
    guard("heartbeat", heartbeat),
  ),
  new Cron(env.ATS_CRON, { name: "ats", timezone: TZ, protect: true }, guard("ats", sweep("ats"))),
  new Cron(
    env.AGGREGATORS_CRON,
    { name: "aggregators", timezone: TZ, protect: true },
    guard("aggregators", sweep("aggregators")),
  ),
  new Cron(
    env.FEEDS_CRON,
    { name: "feeds", timezone: TZ, protect: true },
    guard("feeds", sweep("feeds")),
  ),
];

const server = createServer(
  createHealthHandler({
    startedAt,
    getLastTick: () => lastTick,
    pingDb: async () => {
      await db.execute(sql`select 1`);
    },
    getFailingSources: async () => {
      const rows = await db.execute<{ source: string }>(sql`
        select source from (
          select distinct on (source) source, status
          from source_runs
          order by source, started_at desc
        ) latest
        where status = 'error'
        order by source`);
      return rows.map((r) => r.source);
    },
  }),
);

async function start(): Promise<void> {
  const seeded = await syncCompanySeed(db, loadCompanySeed());
  log.info(seeded, "company seed synced");
  await heartbeat();
  server.listen(env.WORKER_HEALTH_PORT, () => {
    log.info(
      {
        port: env.WORKER_HEALTH_PORT,
        tz: TZ,
        jobs: jobs.map((j) => ({ name: j.name, next: j.nextRun()?.toISOString() })),
        enabled: rt.sources.filter((s) => s.enabled).map((s) => s.id),
      },
      "worker started",
    );
  });
}

start().catch((err: unknown) => {
  log.fatal({ err }, "worker failed to start");
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutting down");
  for (const j of jobs) j.stop();
  server.close();
  await rt.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (err) => log.error({ err }, "unhandled rejection"));
