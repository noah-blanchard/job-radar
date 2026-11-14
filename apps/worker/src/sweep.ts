import { getConnector, runSource, type Company, type RunSummary } from "@jobradar/core";
import { and, asc, companies, eq, isNotNull, ne, sql } from "@jobradar/db";
import { withAdvisoryLock } from "./lock";
import type { Runtime } from "./runtime";

export type Schedule = "ats" | "aggregators" | "feeds";

export interface SweepOptions {
  /** Which schedules of sources.yaml to run. */
  schedules: Schedule[];
  /** Only these source ids (default: every enabled source of the schedules). */
  only?: string[];
  /** ATS only: companies whose name contains this (case-insensitive). */
  company?: string;
  /** Random delay before each source starts, to spread load (0 for manual runs). */
  maxJitterMs?: number;
  /** Ignore `enabled: false` in sources.yaml (manual runs of one source). */
  includeDisabled?: boolean;
  /** ATS: stop starting new companies after this instant (epoch ms). */
  deadline?: number;
  /** Called after each source/company run (instant alerts when it found new jobs). */
  onRun?: (run: RunSummary) => void;
}

export interface SweepResult {
  runs: RunSummary[];
  /** ATS companies not reached before the deadline (they run first next time). */
  deferred: number;
}

/**
 * Companies of one ATS, best first: high priority (seed file, or some user's priority), then
 * never/least recently OK, broken last.
 * With the time budget this rotates through hundreds of discovered boards across sweeps.
 */
async function companiesFor(rt: Runtime, ats: string): Promise<Company[]> {
  const rows = await rt.db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.ats, ats),
        isNotNull(companies.atsKey),
        ne(companies.atsStatus, "unsupported"),
      ),
    )
    .orderBy(
      sql`case when ${companies.atsStatus} = 'broken' then 1 else 0 end`,
      sql`case when ${companies.priority} = 'high' or exists (select 1 from company_prefs cp
        where cp.company_id = ${companies.id} and cp.priority = 'high') then 0
        when ${companies.priority} = 'normal' then 1 else 2 end`,
      sql`${companies.lastOkAt} asc nulls first`,
      asc(companies.id),
    );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ats: r.ats,
    atsKey: r.atsKey,
    careersUrl: r.careersUrl,
    priority: r.priority,
  }));
}

function depsFor(rt: Runtime, sourceId: string) {
  return {
    db: rt.db,
    http: rt.http,
    log: rt.log,
    env: rt.env,
    profile: rt.searchProfile,
    quota: rt.quotaFor(sourceId),
    // Classify the jobs each run touched and score them for every user (optional LLM for the
    // ambiguous ones). Profiles are read when the run ends.
    rescore: { llm: rt.llm, profiles: () => rt.profiles },
  };
}

/**
 * Runs the sources of the given schedules. Sources run in parallel (different hosts), each under
 * its own advisory lock; the companies of one ATS run sequentially.
 */
export async function runSweep(rt: Runtime, opts: SweepOptions): Promise<SweepResult> {
  const ids = rt.sources
    .filter((s) => opts.schedules.includes(s.schedule) && (opts.includeDisabled || s.enabled))
    .map((s) => s.id)
    .filter((id) => !opts.only || opts.only.includes(id));
  let deferred = 0;

  const results = await Promise.all(
    ids.map(async (id) => {
      const connector = getConnector(id);
      if (!connector) {
        if (opts.only || rt.sources.find((s) => s.id === id)?.enabled)
          rt.log.warn({ source: id }, "source listed in sources.yaml but no connector implemented");
        return [];
      }
      const jitter = Math.floor(Math.random() * (opts.maxJitterMs ?? 0));
      if (jitter > 0) await new Promise((r) => setTimeout(r, jitter));

      const out = await withAdvisoryLock(rt.lockSql, `source:${id}`, async () => {
        const deps = depsFor(rt, id);
        const done = (r: RunSummary) => {
          opts.onRun?.(r);
          return r;
        };
        if (!connector.needsCompany) return [done(await runSource(deps, connector))];
        const list = (await companiesFor(rt, id)).filter(
          (c) => !opts.company || c.name.toLowerCase().includes(opts.company.toLowerCase()),
        );
        const summaries: RunSummary[] = [];
        for (const [i, c] of list.entries()) {
          if (opts.deadline && Date.now() > opts.deadline) {
            const left = list.length - i;
            deferred += left;
            rt.log.warn({ source: id, deferred: left }, "sweep time budget reached");
            break;
          }
          summaries.push(done(await runSource(deps, connector, c)));
        }
        return summaries;
      });
      if (out === undefined)
        rt.log.warn({ source: id }, "source already running elsewhere, skipped");
      return out ?? [];
    }),
  );
  return { runs: results.flat(), deferred };
}
