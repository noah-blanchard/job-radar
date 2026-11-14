/**
 * Manual operations.
 *   node dist/cli.js seed
 *   node dist/cli.js run <connector|all> [--company <name>]
 *   node dist/cli.js stats
 */
import { parseArgs } from "node:util";
import { loadCompanySeed, syncCompanySeed } from "@jobradar/core";
import { companies, count, isNull, jobs, jobSources, sql } from "@jobradar/db";
import { runAtsSweep } from "./ats";
import { createRuntime } from "./runtime";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { company: { type: "string" } },
});
const [cmd, target] = positionals;
const rt = createRuntime("cli");

async function stats() {
  const [j] = await rt.db.select({ n: count() }).from(jobs);
  const [open] = await rt.db.select({ n: count() }).from(jobs).where(isNull(jobs.closedAt));
  const [s] = await rt.db.select({ n: count() }).from(jobSources);
  const [dups] = await rt.db.execute<{ n: number }>(
    sql`select count(*)::int as n from (select fingerprint from jobs group by fingerprint having count(*) > 1) d`,
  );
  const bySource = await rt.db.execute<{ source: string; n: number }>(
    sql`select source, count(*)::int as n from job_sources group by source order by source`,
  );
  const [c] = await rt.db.select({ n: count() }).from(companies);
  console.log(
    JSON.stringify(
      {
        companies: c?.n,
        jobs: j?.n,
        open: open?.n,
        jobSources: s?.n,
        duplicateFingerprints: dups?.n,
        bySource: Object.fromEntries(bySource.map((r) => [r.source, r.n])),
      },
      null,
      2,
    ),
  );
}

async function main() {
  switch (cmd) {
    case "seed": {
      console.log(await syncCompanySeed(rt.db, loadCompanySeed()));
      break;
    }
    case "run": {
      if (!target) throw new Error("usage: run <connector|all> [--company <name>]");
      await syncCompanySeed(rt.db, loadCompanySeed());
      const results = await runAtsSweep(rt, {
        only: target === "all" ? undefined : [target],
        company: values.company,
        includeDisabled: target !== "all",
      });
      for (const r of results) {
        console.log(
          `${r.status.padEnd(5)} ${r.source.padEnd(16)} company=${r.companyId} fetched=${r.fetched} new=${r.nbNew} closed=${r.closed}${r.unchanged ? " (304)" : ""}${r.error ? ` error=${r.error}` : ""}`,
        );
      }
      break;
    }
    case "stats":
      await stats();
      break;
    default:
      throw new Error("usage: seed | run <connector|all> [--company <name>] | stats");
  }
}

main()
  .then(() => rt.close())
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    await rt.close();
    process.exit(1);
  });
