import { rescoreJobs } from "@jobradar/core";
import { queryRows, sql } from "@jobradar/db";
import type { Alerts } from "./alerts";
import type { Runtime } from "./runtime";
import { runSweep } from "./sweep";

/**
 * Requests written by the dashboard into `kv` (the web never runs a connector itself):
 *   run_request:<source>              "lancer maintenant" on /sources
 *   rescore_request:company:<id>      priority edited on /companies
 *   alert_test_request                "Tester les canaux" on /settings
 * Claimed atomically (DELETE ... RETURNING) at the worker's one-minute tick.
 */
export const RUN_REQUEST_PREFIX = "run_request:";
export const RESCORE_COMPANY_PREFIX = "rescore_request:company:";

async function claim(rt: Runtime, prefix: string): Promise<string[]> {
  const rows = await queryRows<{ key: string }>(
    rt.db,
    sql`delete from kv where key like ${`${prefix}%`} returning key`,
  );
  return rows.map((r) => r.key.slice(prefix.length));
}

export async function processRequests(rt: Runtime, alerts?: Alerts): Promise<void> {
  // Not awaited: sending can take a few seconds (SMTP) and must not delay the tick.
  if (alerts) void alerts.processTestRequest();

  for (const source of await claim(rt, RUN_REQUEST_PREFIX)) {
    if (!rt.sources.some((s) => s.id === source)) {
      rt.log.warn({ source }, "run request for an unknown source ignored");
      continue;
    }
    rt.log.info({ source }, "manual run requested from the dashboard");
    // Not awaited: an ATS sweep can take hours and must not block the tick. The advisory lock
    // still prevents two runs of the same source.
    void runSweep(rt, {
      schedules: ["ats", "aggregators", "feeds"],
      only: [source],
      includeDisabled: false,
      deadline: Date.now() + rt.env.ATS_SWEEP_MAX_MINUTES * 60_000,
      onRun: (r) => {
        if (r.nbNew > 0) void alerts?.instant();
      },
    })
      .then(({ runs }) =>
        rt.log.info(
          { source, runs: runs.length, errors: runs.filter((r) => r.status === "error").length },
          "manual run done",
        ),
      )
      .catch((err: unknown) => rt.log.error({ err, source }, "manual run failed"));
  }

  for (const id of await claim(rt, RESCORE_COMPANY_PREFIX)) {
    const companyId = Number(id);
    if (!Number.isInteger(companyId)) continue;
    const r = await rescoreJobs(
      rt.db,
      { kind: "company", companyId },
      { profile: rt.profile, log: rt.log },
    );
    rt.log.info({ companyId, ...r }, "company jobs rescored (priority changed)");
  }
}
