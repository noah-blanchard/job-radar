import { createServer } from "node:http";
import { createLogger, getEnv, requireEnv } from "@jobradar/core";
import { createDb, kvSet, sql } from "@jobradar/db";
import { Cron } from "croner";
import { createHealthHandler } from "./health";

const log = createLogger("worker");
const env = requireEnv(getEnv(), ["DATABASE_URL"]);
const TZ = env.TZ;

const { db, close } = createDb(env.DATABASE_URL, { max: 5 });
const startedAt = new Date();
let lastTick: Date | undefined;

async function heartbeat(): Promise<void> {
  const now = new Date();
  await kvSet(db, "worker_last_tick", now.toISOString());
  lastTick = now;
  log.debug({ at: now.toISOString() }, "heartbeat");
}

const jobs: Cron[] = [
  new Cron("* * * * *", { name: "heartbeat", timezone: TZ, protect: true }, () =>
    heartbeat().catch((err: unknown) => log.error({ err }, "heartbeat failed")),
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

server.listen(env.WORKER_HEALTH_PORT, () => {
  log.info({ port: env.WORKER_HEALTH_PORT, tz: TZ, jobs: jobs.map((j) => j.name) }, "worker started");
});

// First tick right away so /healthz reports a real timestamp quickly.
heartbeat().catch((err: unknown) => log.error({ err }, "initial heartbeat failed"));

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutting down");
  for (const j of jobs) j.stop();
  server.close();
  await close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (err) => log.error({ err }, "unhandled rejection"));
