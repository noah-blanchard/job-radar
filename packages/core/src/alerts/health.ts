import { kvGet, queryRows, sql, type AnyDb } from "@jobradar/db";
import { BROKEN_AFTER_FAILURES } from "../pipeline/run";
import type { AlertMessage } from "./channels";
import { sendOnce, type AlertDeps, type ChannelResult } from "./dispatch";
import { baseUrl, formatDateTime } from "./format";

export const NO_NEW_JOBS_HOURS = 48;
/** Daily backups: older than this = the backup service stopped. */
export const BACKUP_STALE_HOURS = 30;
/** Written by the backup service (scripts/backup/backup.sh). */
export const BACKUP_STATUS_KEY = "backup_status";

export interface BackupStatus {
  ok: boolean;
  at: string;
  file?: string;
  bytes?: number;
  error?: string | null;
}
/** A broken company / failing source is only reported if it failed this recently. */
const RECENT_FAILURE_HOURS = 48;
const MAX_LISTED = 15;

export interface HealthIssue {
  /** Stable while the problem lasts, new once it recovers and breaks again. */
  key: string;
  text: string;
}

export interface HealthOptions {
  silenceHours: number;
  /** Heartbeat left by the previous worker process (read at startup, before the first tick). */
  previousTick?: Date;
  publicBaseUrl: string;
}

const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;
const toDate = (v: Date | string | null | undefined) => (v ? new Date(v) : undefined);
const hours = (ms: number) => Math.round(ms / 3_600_000);
const short = (s: string | null | undefined) =>
  s ? ` : ${s.replace(/\s+/g, " ").slice(0, 120)}` : "";

/**
 * Current health problems, each with a dedup key:
 *  - a company ATS `broken` (3 consecutive failures), or a non-ATS source failing 3 runs in a row;
 *  - the worker silent for more than HEALTH_SILENCE_HOURS (previous process heartbeat at startup,
 *    or no run finished for that long while it ticks);
 *  - zero new jobs across all sources for 48 h;
 *  - the last backup failed, or is older than 30 h (only once a backup ran: none locally).
 * Exhausted quotas are not instant alerts: capped sources (Adzuna, JSearch) use their whole
 * quota every day by design, so they are reported once a day in the digest.
 */
export async function findHealthIssues(
  db: AnyDb,
  o: HealthOptions,
  now: Date,
): Promise<HealthIssue[]> {
  const issues: HealthIssue[] = [];
  const recent = new Date(now.getTime() - RECENT_FAILURE_HOURS * 3_600_000);

  const broken = await queryRows<{
    id: number | string;
    name: string;
    ats: string | null;
    failures: number;
    last_ok_at: Date | string | null;
    error: string | null;
  }>(
    db,
    sql`
      select c.id, c.name, c.ats, c.consecutive_failures as failures, c.last_ok_at,
        (select r.error from source_runs r where r.company_id = c.id
          order by r.started_at desc limit 1) as error
      from companies c
      where c.ats_status = 'broken' and c.consecutive_failures >= ${BROKEN_AFTER_FAILURES}
        and exists (select 1 from source_runs r where r.company_id = c.id
          and r.status = 'error' and r.started_at > ${ts(recent)})
      order by c.priority desc, c.name`,
  );
  for (const b of broken) {
    issues.push({
      key: `broken:company:${Number(b.id)}:${toDate(b.last_ok_at)?.toISOString() ?? "never"}`,
      text: `${b.name} (${b.ats ?? "?"}) en échec ${b.failures} fois de suite${short(b.error)}`,
    });
  }

  // Sources without companies (aggregators, feeds): streak of errors since the last OK run.
  const failing = await queryRows<{
    source: string;
    streak_start: number | string;
    failures: number | string;
    error: string | null;
  }>(
    db,
    sql`
      select s.source, min(s.id) as streak_start, count(*) as failures,
        (array_agg(s.error order by s.id desc))[1] as error
      from source_runs s
      where s.company_id is null and s.status = 'error'
        and s.id > coalesce((select max(o.id) from source_runs o
          where o.source = s.source and o.company_id is null and o.status = 'ok'), 0)
      group by s.source
      having count(*) >= ${BROKEN_AFTER_FAILURES} and max(s.started_at) > ${ts(recent)}
      order by s.source`,
  );
  for (const f of failing) {
    issues.push({
      key: `broken:source:${f.source}:${Number(f.streak_start)}`,
      text: `Source ${f.source} en échec ${Number(f.failures)} fois de suite${short(f.error)}`,
    });
  }

  const silenceMs = o.silenceHours * 3_600_000;
  if (o.previousTick && now.getTime() - o.previousTick.getTime() > silenceMs) {
    issues.push({
      key: `silence:worker:${o.previousTick.toISOString()}`,
      text: `Worker silencieux pendant ${hours(now.getTime() - o.previousTick.getTime())} h (dernier signe de vie : ${formatDateTime(o.previousTick)}), redémarré à ${formatDateTime(now)}`,
    });
  }

  const [last] = await queryRows<{ finished: Date | string | null; seen: Date | string | null }>(
    db,
    sql`select (select max(finished_at) from source_runs) as finished,
               (select max(first_seen_at) from jobs) as seen`,
  );
  const lastRun = toDate(last?.finished);
  if (lastRun && now.getTime() - lastRun.getTime() > silenceMs) {
    issues.push({
      key: `silence:runs:${lastRun.toISOString()}`,
      text: `Aucun run terminé depuis ${hours(now.getTime() - lastRun.getTime())} h (dernier : ${formatDateTime(lastRun)})`,
    });
  }
  const lastNew = toDate(last?.seen);
  if (lastNew && now.getTime() - lastNew.getTime() > NO_NEW_JOBS_HOURS * 3_600_000) {
    issues.push({
      key: `no-new:${lastNew.toISOString()}`,
      text: `Aucune nouvelle offre depuis ${hours(now.getTime() - lastNew.getTime())} h, toutes sources confondues (dernière : ${formatDateTime(lastNew)})`,
    });
  }

  const backup = await kvGet<BackupStatus>(db, BACKUP_STATUS_KEY);
  if (backup?.at) {
    const at = new Date(backup.at);
    if (!backup.ok)
      issues.push({
        key: `backup:failed:${at.toISOString()}`,
        text: `Backup en échec (${formatDateTime(at)})${short(backup.error)}`,
      });
    else if (now.getTime() - at.getTime() > BACKUP_STALE_HOURS * 3_600_000)
      issues.push({
        key: `backup:stale:${at.toISOString()}`,
        text: `Aucun backup depuis ${hours(now.getTime() - at.getTime())} h (dernier : ${formatDateTime(at)})`,
      });
  }
  return issues;
}

export function buildHealthMessage(issues: HealthIssue[], publicBaseUrl: string): AlertMessage {
  const lines = issues.slice(0, MAX_LISTED).map((i) => `• ${i.text}`);
  if (issues.length > MAX_LISTED) lines.push(`+ ${issues.length - MAX_LISTED} autres`);
  const url = `${baseUrl(publicBaseUrl)}/sources`;
  const title = `JobRadar : alerte santé (${issues.length})`;
  const text = lines.join("\n");
  return {
    kind: "health",
    title,
    text,
    url,
    priority: "high",
    tags: ["warning"],
    email: { subject: title, text: `${text}\n\nSanté des sources : ${url}` },
  };
}

/** Sends the health issues not alerted yet, grouped in one message per channel. */
export async function runHealthChecks(
  deps: AlertDeps,
  o: HealthOptions,
): Promise<{ issues: HealthIssue[]; results: ChannelResult[] }> {
  const now = (deps.now ?? (() => new Date()))();
  const issues = await findHealthIssues(deps.db, o, now);
  if (issues.length === 0) return { issues, results: [] };
  const byKey = new Map(issues.map((i) => [i.key, i]));
  const results = await sendOnce(
    deps,
    "health",
    issues.map((i) => ({ key: i.key })),
    (fresh) =>
      buildHealthMessage(
        fresh.map((f) => byKey.get(f.key)).filter((i): i is HealthIssue => !!i),
        o.publicBaseUrl,
      ),
  );
  return { issues, results };
}
