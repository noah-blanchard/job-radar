/**
 * Manual operations.
 *   node dist/cli.js seed
 *   node dist/cli.js run <all|ats|tier-b|aggregators|feeds|<source>> [--company <name>] [--max-minutes N]
 *   node dist/cli.js detect-ats <careers-url> [--name <company>] [--dry-run]
 *   node dist/cli.js stats
 */
import { parseArgs } from "node:util";
import {
  loadCompanySeed,
  PoliteHttpClient,
  probeCareersUrl,
  registerCompany,
  syncCompanySeed,
  type DetectedAts,
} from "@jobradar/core";
import { companies, count, isNull, jobs, jobSources, sql } from "@jobradar/db";
import { createRuntime } from "./runtime";
import { runSweep, type Schedule } from "./sweep";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    company: { type: "string" },
    name: { type: "string" },
    "max-minutes": { type: "string" },
    "dry-run": { type: "boolean" },
  },
});
const [cmd, target] = positionals;
const rt = createRuntime("cli");

const GROUPS: Record<string, Schedule[]> = {
  all: ["ats", "aggregators", "feeds"],
  ats: ["ats"],
  "tier-b": ["aggregators", "feeds"],
  aggregators: ["aggregators"],
  feeds: ["feeds"],
};

async function stats() {
  const [j] = await rt.db.select({ n: count() }).from(jobs);
  const [open] = await rt.db.select({ n: count() }).from(jobs).where(isNull(jobs.closedAt));
  const [s] = await rt.db.select({ n: count() }).from(jobSources);
  const [dups] = await rt.db.execute<{ n: number }>(
    sql`select count(*)::int as n from (select fingerprint from jobs group by fingerprint having count(*) > 1) d`,
  );
  const [dupSources] = await rt.db.execute<{ n: number }>(
    sql`select count(*)::int as n from (select source, source_job_id from job_sources group by 1, 2 having count(*) > 1) d`,
  );
  const bySource = await rt.db.execute<{ source: string; n: number }>(
    sql`select source, count(*)::int as n from job_sources group by source order by source`,
  );
  const byOrigin = await rt.db.execute<{ origin: string; n: number; with_ats: number }>(
    sql`select origin, count(*)::int as n, count(ats)::int as with_ats from companies group by origin order by origin`,
  );
  const [c] = await rt.db.select({ n: count() }).from(companies);
  console.log(
    JSON.stringify(
      {
        companies: c?.n,
        companiesByOrigin: Object.fromEntries(
          byOrigin.map((r) => [r.origin, { total: r.n, withAts: r.with_ats }]),
        ),
        jobs: j?.n,
        open: open?.n,
        jobSources: s?.n,
        duplicateFingerprints: dups?.n,
        duplicateSourceIds: dupSources?.n,
        bySource: Object.fromEntries(bySource.map((r) => [r.source, r.n])),
      },
      null,
      2,
    ),
  );
}

async function detect(url: string) {
  const http = new PoliteHttpClient(rt.http);
  const { detected, hits } = await probeCareersUrl(http, url);
  let board: DetectedAts | undefined = detected ?? undefined;
  let name = values.name;
  if (detected) {
    console.log(`ATS detected from the URL: ${detected.ats} ${detected.atsKey}`);
  } else if (hits.length === 1) {
    board = hits[0]!;
    name ??= hits[0]!.name;
    console.log(
      `Found by probing public APIs: ${board.ats} ${board.atsKey} (${hits[0]!.jobs} jobs)`,
    );
  } else if (hits.length > 1) {
    console.log("Several boards answered; re-run with the board URL of the right one:");
    for (const h of hits)
      console.log(`  ${h.ats.padEnd(16)} ${h.atsKey.padEnd(30)} ${h.jobs} jobs`);
    return;
  } else {
    console.log("No supported ATS found (URL not recognized, no public board for the domain).");
    return;
  }
  if (!board) return;
  name ??= board.atsKey.split(/[/:]/).pop()!;
  if (values["dry-run"]) {
    console.log(`(dry run) would add "${name}" ${board.ats} ${board.atsKey}`);
    return;
  }
  const r = await registerCompany(rt.db, {
    name,
    ats: board.ats,
    atsKey: board.atsKey,
    careersUrl: url,
    origin: "manual",
  });
  console.log(
    r.created
      ? `Added "${name}" (id ${r.id}); it will be swept at the next ATS run.`
      : r.updated
        ? `Existing company "${name}" (id ${r.id}) now uses ${board.ats} ${board.atsKey}.`
        : `Already known (id ${r.id}).`,
  );
}

async function main() {
  switch (cmd) {
    case "seed": {
      console.log(await syncCompanySeed(rt.db, loadCompanySeed()));
      break;
    }
    case "run": {
      if (!target)
        throw new Error(
          "usage: run <all|ats|tier-b|aggregators|feeds|<source>> [--company <name>]",
        );
      await syncCompanySeed(rt.db, loadCompanySeed());
      const group = GROUPS[target];
      const minutes = Number(values["max-minutes"] ?? rt.env.ATS_SWEEP_MAX_MINUTES);
      const { runs, deferred } = await runSweep(rt, {
        schedules: group ?? ["ats", "aggregators", "feeds"],
        only: group ? undefined : [target],
        company: values.company,
        includeDisabled: !group,
        deadline: Date.now() + minutes * 60_000,
      });
      if (!group && runs.length === 0) console.log(`no run: unknown source "${target}"?`);
      for (const r of runs) {
        console.log(
          `${r.status.padEnd(5)} ${r.source.padEnd(24)} company=${r.companyId} fetched=${r.fetched} new=${r.nbNew} closed=${r.closed} discovered=${r.discovered}${r.unchanged ? " (304)" : ""}${r.error ? ` error=${r.error}` : ""}`,
        );
      }
      const errors = runs.filter((r) => r.status === "error").length;
      console.log(
        `\n${runs.length} runs, ${errors} errors, ${runs.reduce((a, r) => a + r.nbNew, 0)} new jobs, ${runs.reduce((a, r) => a + r.discovered, 0)} companies discovered${deferred ? `, ${deferred} companies deferred (time budget)` : ""}`,
      );
      break;
    }
    case "detect-ats": {
      if (!target)
        throw new Error("usage: detect-ats <careers-url> [--name <company>] [--dry-run]");
      await detect(target);
      break;
    }
    case "stats":
      await stats();
      break;
    default:
      throw new Error(
        "usage: seed | run <all|ats|tier-b|aggregators|feeds|<source>> [--company <name>] [--max-minutes N] | detect-ats <url> [--name X] [--dry-run] | stats",
      );
  }
}

main()
  .then(() => rt.close())
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    await rt.close();
    process.exit(1);
  });
