import { getConnector, runSource, type Company, type RunSummary } from "@jobradar/core";
import { and, asc, companies, eq, isNotNull, ne } from "@jobradar/db";
import { withAdvisoryLock } from "./lock";
import type { Runtime } from "./runtime";

export interface SweepOptions {
  /** Only these connector ids (default: every enabled ATS in sources.yaml). */
  only?: string[];
  /** Only companies whose name contains this (case-insensitive). */
  company?: string;
  /** Random delay before each connector starts, to spread load (0 for manual runs). */
  maxJitterMs?: number;
  /** Ignore `enabled: false` in sources.yaml (manual runs). */
  includeDisabled?: boolean;
}

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
    .orderBy(asc(companies.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ats: r.ats,
    atsKey: r.atsKey,
    careersUrl: r.careersUrl,
    priority: r.priority,
  }));
}

/**
 * One ATS sweep: connectors run in parallel (different hosts), companies of one connector run
 * sequentially, each connector under its own advisory lock.
 */
export async function runAtsSweep(rt: Runtime, opts: SweepOptions = {}): Promise<RunSummary[]> {
  const ids = rt.sources
    .filter((s) => s.schedule === "ats" && (opts.includeDisabled || s.enabled))
    .map((s) => s.id)
    .filter((id) => !opts.only || opts.only.includes(id));

  const results = await Promise.all(
    ids.map(async (id) => {
      const connector = getConnector(id);
      if (!connector) {
        rt.log.warn({ source: id }, "source enabled in sources.yaml but no connector implemented");
        return [];
      }
      const jitter = Math.floor(Math.random() * (opts.maxJitterMs ?? 0));
      if (jitter > 0) await new Promise((r) => setTimeout(r, jitter));

      const out = await withAdvisoryLock(rt.sql, `source:${id}`, async () => {
        const list = (await companiesFor(rt, id)).filter(
          (c) => !opts.company || c.name.toLowerCase().includes(opts.company.toLowerCase()),
        );
        const summaries: RunSummary[] = [];
        for (const c of list) summaries.push(await runSource(rt, connector, c));
        return summaries;
      });
      if (out === undefined)
        rt.log.warn({ source: id }, "source already running elsewhere, skipped");
      return out ?? [];
    }),
  );
  return results.flat();
}
