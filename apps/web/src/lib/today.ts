import "server-only";
import { loadSourcesConfig } from "@jobradar/core/config";
import { PROFILE_KV_KEY, type AppliedProfile } from "@jobradar/core/score";
import { kvGet, queryRows, sql } from "@jobradar/db";
import { cache } from "react";
import { getDb } from "./db";
import type { JobStatus } from "./filters";
import { readProfile } from "./profile";

/** Score threshold of the "à trier" count: the digest's own threshold, so both agree. */
export function triageMinScore(): number {
  const n = Number(process.env.DIGEST_MIN_SCORE);
  return Number.isFinite(n) && process.env.DIGEST_MIN_SCORE !== "" ? n : 40;
}

export interface DueItem {
  id: number;
  title: string;
  company_name: string;
  status: JobStatus;
  next_action_at: string;
}

export interface Problem {
  kind: "source" | "quota" | "silent" | "profile";
  label: string;
}

export interface Today {
  minScore: number;
  triage: number;
  triageFresh: number;
  saved: number;
  applied: number;
  interview: number;
  due: DueItem[];
  dueCount: number;
  problems: Problem[];
}

/**
 * What needs attention now: triage queue, pipeline counts, due follow-ups and machine problems.
 * Wrapped in `cache` so the shell (rail counts) and the home page share one set of queries.
 */
export const loadToday = cache(async (): Promise<Today> => {
  const db = getDb();
  const minScore = triageMinScore();
  const silenceHours = Number(process.env.HEALTH_SILENCE_HOURS ?? 12) || 12;

  const [[triage], pipeline, due, failing, [lastRun], usage, applied] = await Promise.all([
    queryRows<{ n: number; fresh: number }>(
      db,
      sql`select count(*)::int as n,
            count(*) filter (where j.first_seen_at >= now() - interval '24 hours')::int as fresh
          from jobs j left join job_status s on s.job_id = j.id
          where j.closed_at is null and (s.status is null or s.status = 'new')
            and j.score >= ${minScore}`,
    ),
    queryRows<{ status: JobStatus; n: number; due: number }>(
      db,
      sql`select status, count(*)::int as n,
            count(*) filter (where next_action_at <= now())::int as due
          from job_status where status in ('saved', 'applied', 'interview') group by status`,
    ),
    queryRows<DueItem & { next_action_at: Date | string }>(
      db,
      sql`select j.id, j.title, j.company_name, s.status, s.next_action_at
          from job_status s join jobs j on j.id = s.job_id
          where s.next_action_at <= now() and s.status in ('saved', 'applied', 'interview')
          order by s.next_action_at limit 8`,
    ),
    queryRows<{ source: string }>(
      db,
      sql`select source from (
            select distinct on (source) source, status from source_runs
            order by source, started_at desc
          ) l where l.status = 'error'`,
    ),
    queryRows<{ last: Date | string | null }>(
      db,
      sql`select max(started_at) as last from source_runs`,
    ),
    queryRows<{ source: string; calls: number }>(
      db,
      sql`select source, calls from api_usage
          where day = (now() at time zone 'America/Toronto')::date`,
    ),
    kvGet<AppliedProfile>(db, PROFILE_KV_KEY),
  ]);

  const count = (s: JobStatus) => pipeline.find((p) => p.status === s);
  const problems: Problem[] = [];
  if (failing.length)
    problems.push({
      kind: "source",
      label: `${failing.length} source${failing.length > 1 ? "s" : ""} en échec`,
    });
  try {
    const config = loadSourcesConfig();
    const exhausted = config.filter((c) => {
      if (!c.enabled || !c.quota_env) return false;
      const max = Number(process.env[c.quota_env]);
      const used = usage.find((u) => u.source === c.id)?.calls ?? 0;
      return process.env[c.quota_env] !== "" && Number.isFinite(max) && max > 0 && used >= max;
    });
    if (exhausted.length)
      problems.push({
        kind: "quota",
        label: `quota épuisé : ${exhausted.map((c) => c.id).join(", ")}`,
      });
  } catch {
    // sources.yaml unreadable: /sources shows it, the home page stays quiet.
  }
  const last = lastRun?.last ? new Date(lastRun.last) : null;
  if (last && Date.now() - last.getTime() > silenceHours * 3_600_000)
    problems.push({ kind: "silent", label: `worker silencieux depuis ${silenceHours} h` });
  const file = readProfile();
  if ("hash" in file && applied && applied.hash !== file.hash)
    problems.push({ kind: "profile", label: "recalcul des scores en attente" });

  return {
    minScore,
    triage: triage?.n ?? 0,
    triageFresh: triage?.fresh ?? 0,
    saved: count("saved")?.n ?? 0,
    applied: count("applied")?.n ?? 0,
    interview: count("interview")?.n ?? 0,
    dueCount: pipeline.reduce((a, p) => a + p.due, 0),
    due: due.map((d) => ({
      ...d,
      id: Number(d.id),
      next_action_at: new Date(d.next_action_at).toISOString(),
    })),
    problems,
  };
});
