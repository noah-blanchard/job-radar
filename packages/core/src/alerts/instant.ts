import { and, gte, jobs, jobScores, or, sql } from "@jobradar/db";
import type { AlertMessage } from "./channels";
import { selectAlertJobs } from "./digest";
import { sendOnce, type AlertDeps, type ChannelResult } from "./dispatch";
import { age, applyLink, baseUrl, jobLink, place, pushLine, type AlertJob } from "./format";

/** Only jobs first seen this recently can trigger an instant alert ("new jobs only"). */
export const INSTANT_WINDOW_HOURS = 24;
const MAX_LISTED = 10;

export interface InstantOptions {
  minScore: number;
  /** A `priority = high` company alerts from this score up (its exclusions still apply). */
  highPriorityMinScore: number;
  publicBaseUrl: string;
}

export const instantKey = (jobId: number) => `job:${jobId}`;

export function buildInstantMessage(list: AlertJob[], o: InstantOptions, now: Date): AlertMessage {
  const first = list[0];
  if (list.length === 1 && first) {
    const apply = applyLink(first);
    return {
      kind: "instant",
      title: `${first.score} · ${first.title}`,
      text: [
        `${first.company} · ${place(first)} · il y a ${age(first.firstSeenAt, now)}`,
        `Fiche : ${jobLink(o.publicBaseUrl, first.id)}`,
        apply ? `Postuler : ${apply}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      url: jobLink(o.publicBaseUrl, first.id),
      priority: "high",
      tags: ["star"],
    };
  }
  const lines = list
    .slice(0, MAX_LISTED)
    .map((j) => `${pushLine(j)}\n${jobLink(o.publicBaseUrl, j.id)}`);
  if (list.length > MAX_LISTED) lines.push(`+ ${list.length - MAX_LISTED} autres`);
  return {
    kind: "instant",
    title: `${list.length} nouvelles offres à fort score`,
    text: lines.join("\n"),
    url: `${baseUrl(o.publicBaseUrl)}/?since=24h&min=${o.minScore}`,
    priority: "high",
    tags: ["star"],
  };
}

/**
 * Instant alert after a run: open jobs first seen in the last 24 h, new grad or unknown, with
 * score ≥ INSTANT_MIN_SCORE or from a `priority = high` company. Each job is alerted at most once
 * per channel (`alerts_sent`, key `job:<id>`); several new jobs make one grouped message.
 */
export async function runInstantAlerts(
  deps: AlertDeps,
  o: InstantOptions,
): Promise<ChannelResult[]> {
  const now = (deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - INSTANT_WINDOW_HOURS * 3_600_000);
  const list = await selectAlertJobs(
    deps.db,
    deps.userId,
    and(
      gte(jobs.firstSeenAt, since),
      or(
        gte(jobScores.score, o.minScore),
        and(
          sql`exists (select 1 from company_prefs cp where cp.user_id = ${deps.userId}
            and cp.company_id = ${jobs.companyId} and cp.priority = 'high')`,
          gte(jobScores.score, o.highPriorityMinScore),
        ),
      ),
    ),
    200,
  );
  if (list.length === 0) return [];
  const byKey = new Map(list.map((j) => [instantKey(j.id), j]));
  return sendOnce(
    deps,
    "instant",
    list.map((j) => ({ key: instantKey(j.id), jobId: j.id })),
    (fresh) =>
      buildInstantMessage(
        fresh.map((f) => byKey.get(f.key)).filter((j): j is AlertJob => !!j),
        o,
        now,
      ),
  );
}
