import type { IncomingMessage, ServerResponse } from "node:http";

export interface HealthDeps {
  /** Throws when the database is unreachable. */
  pingDb(): Promise<void>;
  getLastTick(): Date | undefined;
  /** Sources whose latest run ended in error. */
  getFailingSources(): Promise<string[]>;
  startedAt: Date;
  now?: () => Date;
  /** A tick older than this marks the worker unhealthy. */
  staleAfterMs?: number;
}

export interface HealthReport {
  ok: boolean;
  db: "ok" | "error";
  startedAt: string;
  lastTick: string | null;
  failingSources: string[];
  error?: string;
}

export async function buildHealthReport(deps: HealthDeps): Promise<HealthReport> {
  const now = (deps.now ?? (() => new Date()))();
  const staleAfterMs = deps.staleAfterMs ?? 5 * 60_000;
  const lastTick = deps.getLastTick();

  let db: HealthReport["db"] = "ok";
  let error: string | undefined;
  let failingSources: string[] = [];
  try {
    await deps.pingDb();
    failingSources = await deps.getFailingSources();
  } catch (err) {
    db = "error";
    error = err instanceof Error ? err.message : String(err);
  }

  // Before the first tick, judge freshness from process start.
  const reference = lastTick ?? deps.startedAt;
  const fresh = now.getTime() - reference.getTime() <= staleAfterMs;

  return {
    ok: db === "ok" && fresh,
    db,
    startedAt: deps.startedAt.toISOString(),
    lastTick: lastTick?.toISOString() ?? null,
    failingSources,
    ...(error ? { error } : {}),
  };
}

export function createHealthHandler(deps: HealthDeps) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method !== "GET" || path !== "/healthz") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const report = await buildHealthReport(deps);
    res.writeHead(report.ok ? 200 : 503, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(report));
  };
}
